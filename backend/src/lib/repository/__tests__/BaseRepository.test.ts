/**
 * BaseRepository Tests
 */

import { Pool, PoolClient, QueryResult } from "pg";
import { BaseRepository } from "../BaseRepository.js";
import type { BaseEntity, RepositoryConfig } from "../types.js";

// Mock the logger
jest.mock("../../logger.js", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock crypto.randomUUID
jest.mock("crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid-123"),
}));

// Test entity type
interface TestEntity extends BaseEntity {
  name: string;
  email: string;
  status: string;
}

interface CreateTestDTO {
  name: string;
  email: string;
  status?: string;
}

interface UpdateTestDTO {
  name?: string;
  email?: string;
  status?: string;
}

// Concrete implementation for testing
class TestRepository extends BaseRepository<
  TestEntity,
  CreateTestDTO,
  UpdateTestDTO
> {
  constructor(pool: Pool) {
    super({
      tableName: "test_entities",
      pool,
      columns: [
        "id",
        "tenant_id",
        "name",
        "email",
        "status",
        "created_at",
        "updated_at",
        "deleted_at",
      ],
    });
  }
}

describe("BaseRepository", () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;
  let repository: TestRepository;

  const mockEntity: TestEntity = {
    id: "entity-1",
    tenant_id: "tenant-1",
    name: "Test Entity",
    email: "test@example.com",
    status: "active",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
    deleted_at: null,
  };

  const createMockQueryResult = <T>(rows: T[]): QueryResult<T> => ({
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  });

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue(createMockQueryResult([])),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    mockPool = {
      query: jest.fn().mockResolvedValue(createMockQueryResult([])),
      connect: jest.fn().mockResolvedValue(mockClient),
    } as unknown as jest.Mocked<Pool>;

    repository = new TestRepository(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor validation", () => {
    it("should throw error if tableName is missing", () => {
      expect(() => {
        new (class extends BaseRepository<TestEntity, CreateTestDTO, UpdateTestDTO> {
          constructor() {
            super({
              tableName: "",
              pool: mockPool,
              columns: ["id"],
            });
          }
        })();
      }).toThrow("BaseRepository: tableName is required");
    });

    it("should throw error if columns is empty", () => {
      expect(() => {
        new (class extends BaseRepository<TestEntity, CreateTestDTO, UpdateTestDTO> {
          constructor() {
            super({
              tableName: "test",
              pool: mockPool,
              columns: [],
            });
          }
        })();
      }).toThrow("BaseRepository: columns array is required and must not be empty");
    });

    it("should throw error if columns includes '*'", () => {
      expect(() => {
        new (class extends BaseRepository<TestEntity, CreateTestDTO, UpdateTestDTO> {
          constructor() {
            super({
              tableName: "test",
              pool: mockPool,
              columns: ["*"],
            });
          }
        })();
      }).toThrow("BaseRepository: columns must be explicit, not '*'");
    });
  });

  describe("findById", () => {
    it("should find entity by ID", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.findById("entity-1", "tenant-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        expect.arrayContaining(["entity-1", "tenant-1"])
      );
      expect(result).toEqual(mockEntity);
    });

    it("should return null if entity not found", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      const result = await repository.findById("nonexistent", "tenant-1");

      expect(result).toBeNull();
    });

    it("should use transaction client when provided", async () => {
      mockClient.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.findById(
        "entity-1",
        "tenant-1",
        mockClient
      );

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockPool.query).not.toHaveBeenCalled();
      expect(result).toEqual(mockEntity);
    });

    it("should exclude soft deleted records by default", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findById("entity-1", "tenant-1");

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("deleted_at IS NULL");
    });
  });

  describe("findAll", () => {
    it("should find all entities for tenant", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const results = await repository.findAll("tenant-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        expect.arrayContaining(["tenant-1"])
      );
      expect(results).toEqual([mockEntity]);
    });

    it("should apply ordering options", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findAll("tenant-1", {
        orderBy: "created_at",
        direction: "DESC",
      });

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("ORDER BY created_at DESC");
    });

    it("should apply pagination options", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findAll("tenant-1", { limit: 10, offset: 20 });

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("LIMIT 10");
      expect(query).toContain("OFFSET 20");
    });

    it("should include deleted records when requested", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findAll("tenant-1", { includeDeleted: true });

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).not.toContain("deleted_at IS NULL");
    });
  });

  describe("findWhere", () => {
    it("should find entities matching conditions", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const results = await repository.findWhere(
        { status: "active" },
        "tenant-1"
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = $"),
        expect.arrayContaining(["active", "tenant-1"])
      );
      expect(results).toEqual([mockEntity]);
    });

    it("should combine multiple conditions", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findWhere(
        { status: "active", name: "Test" },
        "tenant-1"
      );

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("status = $");
      expect(query).toContain("name = $");
    });
  });

  describe("findOneWhere", () => {
    it("should return single matching entity", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.findOneWhere(
        { email: "test@example.com" },
        "tenant-1"
      );

      expect(result).toEqual(mockEntity);
    });

    it("should return null if no match", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      const result = await repository.findOneWhere(
        { email: "nonexistent@example.com" },
        "tenant-1"
      );

      expect(result).toBeNull();
    });
  });

  describe("findPaginated", () => {
    it("should return paginated results with total", async () => {
      // Mock count query
      mockPool.query = jest
        .fn()
        .mockResolvedValueOnce(createMockQueryResult([{ count: "100" }]))
        .mockResolvedValueOnce(createMockQueryResult([mockEntity]));

      const result = await repository.findPaginated("tenant-1", {
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({
        data: [mockEntity],
        total: 100,
        limit: 10,
        offset: 0,
        hasMore: true,
      });
    });

    it("should indicate no more results when at end", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValueOnce(createMockQueryResult([{ count: "1" }]))
        .mockResolvedValueOnce(createMockQueryResult([mockEntity]));

      const result = await repository.findPaginated("tenant-1", {
        limit: 10,
        offset: 0,
      });

      expect(result.hasMore).toBe(false);
    });
  });

  describe("count", () => {
    it("should return count of entities", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([{ count: "42" }]));

      const count = await repository.count("tenant-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*)"),
        expect.any(Array)
      );
      expect(count).toBe(42);
    });

    it("should apply where conditions to count", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([{ count: "10" }]));

      await repository.count("tenant-1", { status: "active" });

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("status = $");
    });

    it("should return 0 for empty results", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([{ count: "0" }]));

      const count = await repository.count("tenant-1");

      expect(count).toBe(0);
    });
  });

  describe("exists", () => {
    it("should return true if entity exists", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([{ count: "1" }]));

      const exists = await repository.exists("entity-1", "tenant-1");

      expect(exists).toBe(true);
    });

    it("should return false if entity does not exist", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([{ count: "0" }]));

      const exists = await repository.exists("nonexistent", "tenant-1");

      expect(exists).toBe(false);
    });
  });

  describe("create", () => {
    it("should create a new entity", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.create(
        { name: "Test", email: "test@example.com" },
        "tenant-1"
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO"),
        expect.arrayContaining(["test-uuid-123", "tenant-1", "Test", "test@example.com"])
      );
      expect(result).toEqual(mockEntity);
    });

    it("should throw error if create fails", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await expect(
        repository.create(
          { name: "Test", email: "test@example.com" },
          "tenant-1"
        )
      ).rejects.toThrow("Failed to create test_entities record");
    });

    it("should use transaction client when provided", async () => {
      mockClient.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      await repository.create(
        { name: "Test", email: "test@example.com" },
        "tenant-1",
        mockClient
      );

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe("createMany", () => {
    it("should create multiple entities", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const results = await repository.createMany(
        [
          { name: "Test 1", email: "test1@example.com" },
          { name: "Test 2", email: "test2@example.com" },
        ],
        "tenant-1"
      );

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
    });

    it("should return empty array for empty input", async () => {
      const results = await repository.createMany([], "tenant-1");

      expect(results).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should update an entity", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.update(
        "entity-1",
        { name: "Updated Name" },
        "tenant-1"
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE"),
        expect.arrayContaining(["Updated Name", "entity-1", "tenant-1"])
      );
      expect(result).toEqual(mockEntity);
    });

    it("should return null if entity not found", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      const result = await repository.update(
        "nonexistent",
        { name: "Updated" },
        "tenant-1"
      );

      expect(result).toBeNull();
    });

    it("should auto-update updated_at timestamp", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      await repository.update("entity-1", { name: "Updated" }, "tenant-1");

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("updated_at = $");
    });

    it("should return current entity if no fields to update", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      // This is a tricky case - empty update should just fetch
      // But our implementation adds updated_at, so it will still update
      const result = await repository.update("entity-1", {}, "tenant-1");

      expect(result).toEqual(mockEntity);
    });
  });

  describe("delete", () => {
    it("should hard delete an entity", async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        ...createMockQueryResult([]),
        rowCount: 1,
      });

      const result = await repository.delete("entity-1", "tenant-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM"),
        ["entity-1", "tenant-1"]
      );
      expect(result).toBe(true);
    });

    it("should return false if entity not found", async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        ...createMockQueryResult([]),
        rowCount: 0,
      });

      const result = await repository.delete("nonexistent", "tenant-1");

      expect(result).toBe(false);
    });
  });

  describe("softDelete", () => {
    it("should soft delete an entity", async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        ...createMockQueryResult([]),
        rowCount: 1,
      });

      const result = await repository.softDelete("entity-1", "tenant-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("deleted_at = NOW()"),
        ["entity-1", "tenant-1"]
      );
      expect(result).toBe(true);
    });

    it("should return false if entity not found", async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        ...createMockQueryResult([]),
        rowCount: 0,
      });

      const result = await repository.softDelete("nonexistent", "tenant-1");

      expect(result).toBe(false);
    });

    it("should not soft delete already deleted entity", async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        ...createMockQueryResult([]),
        rowCount: 0,
      });

      const result = await repository.softDelete("already-deleted", "tenant-1");

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain("deleted_at IS NULL");
      expect(result).toBe(false);
    });
  });

  describe("restore", () => {
    it("should restore a soft-deleted entity", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.restore("entity-1", "tenant-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("deleted_at = NULL"),
        ["entity-1", "tenant-1"]
      );
      expect(result).toEqual(mockEntity);
    });

    it("should return null if entity not found or not deleted", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      const result = await repository.restore("nonexistent", "tenant-1");

      expect(result).toBeNull();
    });
  });

  describe("upsert", () => {
    it("should upsert an entity", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      const result = await repository.upsert(
        { name: "Test", email: "test@example.com" },
        "tenant-1",
        ["tenant_id", "email"]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT"),
        expect.any(Array)
      );
      expect(result).toEqual(mockEntity);
    });

    it("should throw error if upsert fails", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await expect(
        repository.upsert(
          { name: "Test", email: "test@example.com" },
          "tenant-1",
          ["email"]
        )
      ).rejects.toThrow("Failed to upsert test_entities record");
    });
  });

  describe("rawQuery", () => {
    it("should execute raw query", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([{ custom: "result" }]));

      const result = await repository.rawQuery(
        "SELECT custom FROM somewhere WHERE id = $1",
        ["test-id"]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        "SELECT custom FROM somewhere WHERE id = $1",
        ["test-id"]
      );
      expect(result.rows).toEqual([{ custom: "result" }]);
    });
  });

  describe("multi-tenant safety", () => {
    it("should always include tenant_id in findById", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findById("entity-1", "tenant-1");

      const values = (mockPool.query as jest.Mock).mock.calls[0][1];
      expect(values).toContain("tenant-1");
    });

    it("should always include tenant_id in findAll", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await repository.findAll("tenant-1");

      const values = (mockPool.query as jest.Mock).mock.calls[0][1];
      expect(values).toContain("tenant-1");
    });

    it("should always include tenant_id in create", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      await repository.create(
        { name: "Test", email: "test@example.com" },
        "tenant-1"
      );

      const values = (mockPool.query as jest.Mock).mock.calls[0][1];
      expect(values).toContain("tenant-1");
    });

    it("should always include tenant_id in update", async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValue(createMockQueryResult([mockEntity]));

      await repository.update("entity-1", { name: "Updated" }, "tenant-1");

      const values = (mockPool.query as jest.Mock).mock.calls[0][1];
      expect(values).toContain("tenant-1");
    });

    it("should always include tenant_id in delete", async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        ...createMockQueryResult([]),
        rowCount: 1,
      });

      await repository.delete("entity-1", "tenant-1");

      const values = (mockPool.query as jest.Mock).mock.calls[0][1];
      expect(values).toContain("tenant-1");
    });
  });

  describe("repository without soft delete", () => {
    let noSoftDeleteRepo: TestRepository;

    beforeEach(() => {
      // Create repository that doesn't support soft delete
      class NoSoftDeleteRepository extends BaseRepository<
        TestEntity,
        CreateTestDTO,
        UpdateTestDTO
      > {
        constructor(pool: Pool) {
          super({
            tableName: "test_entities",
            pool,
            columns: [
              "id",
              "tenant_id",
              "name",
              "email",
              "status",
              "created_at",
              "updated_at",
            ],
            supportsSoftDelete: false,
          });
        }
      }

      noSoftDeleteRepo = new NoSoftDeleteRepository(mockPool);
    });

    it("should not filter by deleted_at in findById", async () => {
      mockPool.query = jest.fn().mockResolvedValue(createMockQueryResult([]));

      await noSoftDeleteRepo.findById("entity-1", "tenant-1");

      const query = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(query).not.toContain("deleted_at");
    });

    it("should throw error on softDelete", async () => {
      await expect(
        noSoftDeleteRepo.softDelete("entity-1", "tenant-1")
      ).rejects.toThrow("Table test_entities does not support soft delete");
    });

    it("should throw error on restore", async () => {
      await expect(
        noSoftDeleteRepo.restore("entity-1", "tenant-1")
      ).rejects.toThrow("Table test_entities does not support soft delete");
    });
  });
});
