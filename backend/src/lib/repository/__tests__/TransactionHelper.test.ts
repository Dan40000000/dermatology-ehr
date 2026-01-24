/**
 * TransactionHelper Tests
 */

import { Pool, PoolClient } from "pg";
import {
  withTransaction,
  withTransactionClient,
  withParallelTransaction,
  createSavepoint,
  rollbackToSavepoint,
  releaseSavepoint,
} from "../TransactionHelper.js";

// Mock the logger
jest.mock("../../logger.js", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe("TransactionHelper", () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    } as unknown as jest.Mocked<Pool>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("withTransaction", () => {
    it("should execute callback within a transaction", async () => {
      const expectedResult = { id: "123", name: "Test" };
      const callback = jest.fn().mockResolvedValue(expectedResult);

      const result = await withTransaction(mockPool, callback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it("should rollback on callback error", async () => {
      const error = new Error("Test error");
      const callback = jest.fn().mockRejectedValue(error);

      await expect(withTransaction(mockPool, callback)).rejects.toThrow(
        "Test error"
      );

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should release client even if rollback fails", async () => {
      const callbackError = new Error("Callback error");
      const rollbackError = new Error("Rollback error");

      mockClient.query = jest
        .fn()
        .mockImplementation((sql: string) => {
          if (sql === "ROLLBACK") {
            return Promise.reject(rollbackError);
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

      const callback = jest.fn().mockRejectedValue(callbackError);

      await expect(withTransaction(mockPool, callback)).rejects.toThrow(
        "Callback error"
      );

      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should set isolation level when specified", async () => {
      const callback = jest.fn().mockResolvedValue(null);

      await withTransaction(mockPool, callback, {
        isolationLevel: "SERIALIZABLE",
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        "BEGIN ISOLATION LEVEL SERIALIZABLE"
      );
    });

    it("should set read only when specified", async () => {
      const callback = jest.fn().mockResolvedValue(null);

      await withTransaction(mockPool, callback, { readOnly: true });

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN READ ONLY");
    });

    it("should set both isolation level and read only", async () => {
      const callback = jest.fn().mockResolvedValue(null);

      await withTransaction(mockPool, callback, {
        isolationLevel: "REPEATABLE READ",
        readOnly: true,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
      );
    });

    it("should set statement timeout when specified", async () => {
      const callback = jest.fn().mockResolvedValue(null);

      await withTransaction(mockPool, callback, { timeout: 5000 });

      expect(mockClient.query).toHaveBeenCalledWith(
        "SET LOCAL statement_timeout = 5000"
      );
    });
  });

  describe("withTransactionClient", () => {
    it("should execute callback with existing client", async () => {
      const expectedResult = { success: true };
      const callback = jest.fn().mockResolvedValue(expectedResult);

      const result = await withTransactionClient(mockClient, callback);

      expect(callback).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
      // Should NOT call BEGIN or COMMIT - caller manages transaction
      expect(mockClient.query).not.toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    });

    it("should propagate callback errors", async () => {
      const error = new Error("Inner error");
      const callback = jest.fn().mockRejectedValue(error);

      await expect(withTransactionClient(mockClient, callback)).rejects.toThrow(
        "Inner error"
      );
    });
  });

  describe("withParallelTransaction", () => {
    it("should execute multiple callbacks in parallel within a transaction", async () => {
      const results = [{ a: 1 }, { b: 2 }];
      const callback1 = jest.fn().mockResolvedValue(results[0]);
      const callback2 = jest.fn().mockResolvedValue(results[1]);

      const result = await withParallelTransaction(mockPool, [
        callback1,
        callback2,
      ]);

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(callback1).toHaveBeenCalledWith(mockClient);
      expect(callback2).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(result).toEqual(results);
    });

    it("should rollback if any callback fails", async () => {
      const callback1 = jest.fn().mockResolvedValue({ a: 1 });
      const callback2 = jest.fn().mockRejectedValue(new Error("Second failed"));

      await expect(
        withParallelTransaction(mockPool, [callback1, callback2])
      ).rejects.toThrow("Second failed");

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("should support transaction options", async () => {
      const callback = jest.fn().mockResolvedValue(null);

      await withParallelTransaction(mockPool, [callback], {
        isolationLevel: "READ COMMITTED",
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        "BEGIN ISOLATION LEVEL READ COMMITTED"
      );
    });
  });

  describe("savepoint functions", () => {
    describe("createSavepoint", () => {
      it("should create a savepoint", async () => {
        await createSavepoint(mockClient, "my_savepoint");

        expect(mockClient.query).toHaveBeenCalledWith("SAVEPOINT my_savepoint");
      });

      it("should throw error for invalid savepoint name", async () => {
        await expect(
          createSavepoint(mockClient, "invalid-name")
        ).rejects.toThrow("Savepoint name must be a valid identifier");

        await expect(createSavepoint(mockClient, "123invalid")).rejects.toThrow(
          "Savepoint name must be a valid identifier"
        );

        await expect(
          createSavepoint(mockClient, "invalid name")
        ).rejects.toThrow("Savepoint name must be a valid identifier");
      });

      it("should accept valid savepoint names", async () => {
        await createSavepoint(mockClient, "valid_name");
        await createSavepoint(mockClient, "_underscore");
        await createSavepoint(mockClient, "Name123");

        expect(mockClient.query).toHaveBeenCalledTimes(3);
      });
    });

    describe("rollbackToSavepoint", () => {
      it("should rollback to a savepoint", async () => {
        await rollbackToSavepoint(mockClient, "my_savepoint");

        expect(mockClient.query).toHaveBeenCalledWith(
          "ROLLBACK TO SAVEPOINT my_savepoint"
        );
      });

      it("should throw error for invalid savepoint name", async () => {
        await expect(
          rollbackToSavepoint(mockClient, "invalid-name")
        ).rejects.toThrow("Savepoint name must be a valid identifier");
      });
    });

    describe("releaseSavepoint", () => {
      it("should release a savepoint", async () => {
        await releaseSavepoint(mockClient, "my_savepoint");

        expect(mockClient.query).toHaveBeenCalledWith(
          "RELEASE SAVEPOINT my_savepoint"
        );
      });

      it("should throw error for invalid savepoint name", async () => {
        await expect(
          releaseSavepoint(mockClient, "invalid-name")
        ).rejects.toThrow("Savepoint name must be a valid identifier");
      });
    });
  });
});
