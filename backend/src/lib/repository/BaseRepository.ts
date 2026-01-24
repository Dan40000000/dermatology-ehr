/**
 * BaseRepository - Generic repository pattern for database operations
 *
 * Provides a type-safe, consistent interface for CRUD operations with:
 * - Multi-tenant safety (always filters by tenant_id)
 * - Explicit column selection (no SELECT *)
 * - Soft delete support
 * - Parameterized queries (SQL injection safe)
 * - Transaction support
 *
 * @example
 * interface Patient {
 *   id: string;
 *   tenant_id: string;
 *   first_name: string;
 *   last_name: string;
 *   email: string;
 *   created_at: Date;
 *   updated_at: Date;
 *   deleted_at: Date | null;
 * }
 *
 * interface CreatePatientDTO {
 *   first_name: string;
 *   last_name: string;
 *   email: string;
 * }
 *
 * interface UpdatePatientDTO {
 *   first_name?: string;
 *   last_name?: string;
 *   email?: string;
 * }
 *
 * class PatientRepository extends BaseRepository<Patient, CreatePatientDTO, UpdatePatientDTO> {
 *   constructor(pool: Pool) {
 *     super({
 *       tableName: 'patients',
 *       pool,
 *       columns: ['id', 'tenant_id', 'first_name', 'last_name', 'email', 'created_at', 'updated_at', 'deleted_at'],
 *     });
 *   }
 * }
 */

import type { Pool, PoolClient, QueryResult } from "pg";
import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import { QueryBuilder, createQueryBuilder } from "./QueryBuilder.js";
import type {
  BaseEntity,
  FindOptions,
  PaginatedResult,
  QueryExecutor,
  RepositoryConfig,
  SimpleConditions,
} from "./types.js";

/**
 * Abstract base repository class for database entities
 *
 * @typeParam T - The entity type (database row shape)
 * @typeParam CreateDTO - Shape of data for creating new entities
 * @typeParam UpdateDTO - Shape of data for updating entities
 */
export abstract class BaseRepository<
  T extends BaseEntity,
  CreateDTO extends Record<string, unknown>,
  UpdateDTO extends Record<string, unknown>,
> {
  protected readonly tableName: string;
  protected readonly pool: Pool;
  protected readonly columns: string[];
  protected readonly primaryKey: string;
  protected readonly tenantColumn: string;
  protected readonly softDeleteColumn: string;
  protected readonly supportsSoftDelete: boolean;

  constructor(config: RepositoryConfig) {
    this.tableName = config.tableName;
    this.pool = config.pool;
    this.columns = config.columns;
    this.primaryKey = config.primaryKey ?? "id";
    this.tenantColumn = config.tenantColumn ?? "tenant_id";
    this.softDeleteColumn = config.softDeleteColumn ?? "deleted_at";
    this.supportsSoftDelete = config.supportsSoftDelete ?? true;

    // Validate configuration
    if (!this.tableName) {
      throw new Error("BaseRepository: tableName is required");
    }
    if (!this.columns || this.columns.length === 0) {
      throw new Error("BaseRepository: columns array is required and must not be empty");
    }
    if (this.columns.includes("*")) {
      throw new Error("BaseRepository: columns must be explicit, not '*'");
    }
  }

  /**
   * Columns that should never be set by caller-provided data
   */
  private getReservedColumns(): Set<string> {
    const reserved = new Set<string>([
      this.primaryKey,
      this.tenantColumn,
      "created_at",
      "updated_at",
    ]);
    if (this.supportsSoftDelete) {
      reserved.add(this.softDeleteColumn);
    }
    return reserved;
  }

  /**
   * Remove reserved columns from caller-provided data
   */
  private stripReservedFields(data: Record<string, unknown>): Record<string, unknown> {
    const reserved = this.getReservedColumns();
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!reserved.has(key)) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Get the column selection string for queries
   */
  protected getSelectColumns(): string {
    return this.columns.map((col) => `${this.tableName}.${col}`).join(", ");
  }

  /**
   * Execute a query using the provided executor (pool or client)
   */
  protected async query<R = T>(
    executor: QueryExecutor,
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<R>> {
    const startTime = Date.now();
    try {
      const result = await executor.query<R>(text, values);
      const duration = Date.now() - startTime;
      logger.debug("Repository query executed", {
        table: this.tableName,
        duration,
        rowCount: result.rowCount,
      });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error("Repository query failed", {
        table: this.tableName,
        duration,
        query: text.substring(0, 200),
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Create a new QueryBuilder pre-configured for this table
   */
  protected createQueryBuilder(): QueryBuilder {
    return createQueryBuilder().select(this.columns).from(this.tableName);
  }

  /**
   * Find a single entity by ID
   *
   * @param id - Entity primary key
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns Entity or null if not found
   */
  async findById(
    id: string,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<T | null> {
    const builder = this.createQueryBuilder()
      .where({
        [this.primaryKey]: id,
        [this.tenantColumn]: tenantId,
      });

    if (this.supportsSoftDelete) {
      builder.whereNull(this.softDeleteColumn);
    }

    const { text, values } = builder.build();
    const result = await this.query<T>(executor, text, values);
    return result.rows[0] ?? null;
  }

  /**
   * Find all entities for a tenant
   *
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param options - Query options (sorting, pagination, etc.)
   * @param executor - Optional query executor (for transactions)
   * @returns Array of entities
   */
  async findAll(
    tenantId: string,
    options?: FindOptions,
    executor: QueryExecutor = this.pool
  ): Promise<T[]> {
    const builder = this.createQueryBuilder().where({
      [this.tenantColumn]: tenantId,
    });

    if (this.supportsSoftDelete && !options?.includeDeleted) {
      builder.whereNull(this.softDeleteColumn);
    }

    if (options?.orderBy) {
      builder.orderBy(options.orderBy, options.direction ?? "ASC");
    }

    if (options?.limit !== undefined) {
      builder.limit(options.limit);
    }

    if (options?.offset !== undefined) {
      builder.offset(options.offset);
    }

    const { text, values } = builder.build();
    const result = await this.query<T>(executor, text, values);
    return result.rows;
  }

  /**
   * Find all entities matching conditions
   *
   * @param conditions - Object of column -> value equality conditions
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param options - Query options (sorting, pagination, etc.)
   * @param executor - Optional query executor (for transactions)
   * @returns Array of matching entities
   */
  async findWhere(
    conditions: SimpleConditions<T>,
    tenantId: string,
    options?: FindOptions,
    executor: QueryExecutor = this.pool
  ): Promise<T[]> {
    const builder = this.createQueryBuilder().where({
      ...conditions,
      [this.tenantColumn]: tenantId,
    });

    if (this.supportsSoftDelete && !options?.includeDeleted) {
      builder.whereNull(this.softDeleteColumn);
    }

    if (options?.orderBy) {
      builder.orderBy(options.orderBy, options.direction ?? "ASC");
    }

    if (options?.limit !== undefined) {
      builder.limit(options.limit);
    }

    if (options?.offset !== undefined) {
      builder.offset(options.offset);
    }

    const { text, values } = builder.build();
    const result = await this.query<T>(executor, text, values);
    return result.rows;
  }

  /**
   * Find a single entity matching conditions
   *
   * @param conditions - Object of column -> value equality conditions
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns Entity or null if not found
   */
  async findOneWhere(
    conditions: SimpleConditions<T>,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<T | null> {
    const results = await this.findWhere(conditions, tenantId, { limit: 1 }, executor);
    return results[0] ?? null;
  }

  /**
   * Find entities with pagination
   *
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param options - Query options including limit and offset
   * @param executor - Optional query executor (for transactions)
   * @returns Paginated result with total count
   */
  async findPaginated(
    tenantId: string,
    options: FindOptions = {},
    executor: QueryExecutor = this.pool
  ): Promise<PaginatedResult<T>> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    // Get total count
    const total = await this.count(tenantId, undefined, options.includeDeleted, executor);

    // Get paginated data
    const data = await this.findAll(tenantId, { ...options, limit, offset }, executor);

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Count entities for a tenant
   *
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param where - Optional filter conditions
   * @param includeDeleted - Include soft-deleted records
   * @param executor - Optional query executor (for transactions)
   * @returns Count of matching entities
   */
  async count(
    tenantId: string,
    where?: SimpleConditions<T>,
    includeDeleted?: boolean,
    executor: QueryExecutor = this.pool
  ): Promise<number> {
    const builder = createQueryBuilder()
      .selectCount()
      .from(this.tableName)
      .where({
        ...(where ?? {}),
        [this.tenantColumn]: tenantId,
      });

    if (this.supportsSoftDelete && !includeDeleted) {
      builder.whereNull(this.softDeleteColumn);
    }

    const { text, values } = builder.build();
    const result = await this.query<{ count: string }>(executor, text, values);
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  /**
   * Check if an entity exists
   *
   * @param id - Entity primary key
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns True if entity exists
   */
  async exists(
    id: string,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<boolean> {
    const builder = createQueryBuilder()
      .selectCount()
      .from(this.tableName)
      .where({
        [this.primaryKey]: id,
        [this.tenantColumn]: tenantId,
      });

    if (this.supportsSoftDelete) {
      builder.whereNull(this.softDeleteColumn);
    }

    const { text, values } = builder.build();
    const result = await this.query<{ count: string }>(executor, text, values);
    return parseInt(result.rows[0]?.count ?? "0", 10) > 0;
  }

  /**
   * Create a new entity
   *
   * @param data - Entity data (without id, tenant_id, timestamps)
   * @param tenantId - Tenant ID for multi-tenant assignment
   * @param executor - Optional query executor (for transactions)
   * @returns Created entity
   */
  async create(
    data: CreateDTO,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<T> {
    const id = randomUUID();
    const now = new Date();

    // Build column and value lists
    const safeData = this.stripReservedFields(data as Record<string, unknown>);
    const insertData: Record<string, unknown> = {
      ...safeData,
      [this.primaryKey]: id,
      [this.tenantColumn]: tenantId,
      created_at: now,
      updated_at: now,
    };

    const insertColumns = Object.keys(insertData);
    const insertValues = Object.values(insertData);
    const placeholders = insertColumns.map((_, i) => `$${i + 1}`);

    const text = `
      INSERT INTO ${this.tableName} (${insertColumns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.query<T>(executor, text, insertValues);

    if (!result.rows[0]) {
      throw new Error(`Failed to create ${this.tableName} record`);
    }

    return result.rows[0];
  }

  /**
   * Create multiple entities in a single query
   *
   * @param dataArray - Array of entity data
   * @param tenantId - Tenant ID for multi-tenant assignment
   * @param executor - Optional query executor (for transactions)
   * @returns Array of created entities
   */
  async createMany(
    dataArray: CreateDTO[],
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<T[]> {
    if (dataArray.length === 0) {
      return [];
    }

    const now = new Date();
    const results: T[] = [];

    // For simplicity, we insert one at a time but in a single connection
    // A more optimized version would use multi-row INSERT
    for (const data of dataArray) {
      const entity = await this.create(data, tenantId, executor);
      results.push(entity);
    }

    return results;
  }

  /**
   * Update an entity by ID
   *
   * @param id - Entity primary key
   * @param data - Fields to update
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns Updated entity or null if not found
   */
  async update(
    id: string,
    data: UpdateDTO,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<T | null> {
    const safeData = this.stripReservedFields(data as Record<string, unknown>);
    const updateData: Record<string, unknown> = {
      ...safeData,
      updated_at: new Date(),
    };

    const updateColumns = Object.keys(updateData);
    const updateValues = Object.values(updateData);

    if (updateColumns.length === 0) {
      // Nothing to update, just return current entity
      return this.findById(id, tenantId, executor);
    }

    // Build SET clause: col1 = $1, col2 = $2, ...
    const setClause = updateColumns
      .map((col, i) => `${col} = $${i + 1}`)
      .join(", ");

    // Parameters: update values + id + tenant_id
    const params = [...updateValues, id, tenantId];
    const idParamIndex = updateValues.length + 1;
    const tenantParamIndex = updateValues.length + 2;

    let whereClause = `${this.primaryKey} = $${idParamIndex} AND ${this.tenantColumn} = $${tenantParamIndex}`;

    if (this.supportsSoftDelete) {
      whereClause += ` AND ${this.softDeleteColumn} IS NULL`;
    }

    const text = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE ${whereClause}
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.query<T>(executor, text, params);
    return result.rows[0] ?? null;
  }

  /**
   * Hard delete an entity (permanent removal)
   *
   * @param id - Entity primary key
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns True if entity was deleted
   */
  async delete(
    id: string,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<boolean> {
    const text = `
      DELETE FROM ${this.tableName}
      WHERE ${this.primaryKey} = $1 AND ${this.tenantColumn} = $2
    `;

    const result = await this.query(executor, text, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Soft delete an entity (set deleted_at timestamp)
   *
   * @param id - Entity primary key
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns True if entity was soft deleted
   */
  async softDelete(
    id: string,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<boolean> {
    if (!this.supportsSoftDelete) {
      throw new Error(`Table ${this.tableName} does not support soft delete`);
    }

    const text = `
      UPDATE ${this.tableName}
      SET ${this.softDeleteColumn} = NOW(), updated_at = NOW()
      WHERE ${this.primaryKey} = $1 AND ${this.tenantColumn} = $2 AND ${this.softDeleteColumn} IS NULL
    `;

    const result = await this.query(executor, text, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Restore a soft-deleted entity
   *
   * @param id - Entity primary key
   * @param tenantId - Tenant ID for multi-tenant filtering
   * @param executor - Optional query executor (for transactions)
   * @returns Restored entity or null if not found
   */
  async restore(
    id: string,
    tenantId: string,
    executor: QueryExecutor = this.pool
  ): Promise<T | null> {
    if (!this.supportsSoftDelete) {
      throw new Error(`Table ${this.tableName} does not support soft delete`);
    }

    const text = `
      UPDATE ${this.tableName}
      SET ${this.softDeleteColumn} = NULL, updated_at = NOW()
      WHERE ${this.primaryKey} = $1 AND ${this.tenantColumn} = $2 AND ${this.softDeleteColumn} IS NOT NULL
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.query<T>(executor, text, [id, tenantId]);
    return result.rows[0] ?? null;
  }

  /**
   * Upsert (insert or update on conflict)
   *
   * @param data - Entity data
   * @param tenantId - Tenant ID for multi-tenant assignment
   * @param conflictColumns - Columns that determine uniqueness
   * @param executor - Optional query executor (for transactions)
   * @returns Upserted entity
   */
  async upsert(
    data: CreateDTO & { [key: string]: unknown },
    tenantId: string,
    conflictColumns: string[],
    executor: QueryExecutor = this.pool
  ): Promise<T> {
    const id = randomUUID();
    const now = new Date();

    const safeData = this.stripReservedFields(data as Record<string, unknown>);
    const insertData: Record<string, unknown> = {
      ...safeData,
      [this.primaryKey]: id,
      [this.tenantColumn]: tenantId,
      created_at: now,
      updated_at: now,
    };

    const insertColumns = Object.keys(insertData);
    const insertValues = Object.values(insertData);
    const placeholders = insertColumns.map((_, i) => `$${i + 1}`);

    // Build update clause for conflict (exclude primary key and tenant_id)
    const updateColumns = insertColumns.filter(
      (col) =>
        col !== this.primaryKey &&
        col !== this.tenantColumn &&
        col !== "created_at" &&
        col !== "updated_at" &&
        !conflictColumns.includes(col)
    );
    const updateClause = updateColumns.map((col) => `${col} = EXCLUDED.${col}`);
    const updateSet =
      updateClause.length > 0
        ? `${updateClause.join(", ")}, updated_at = NOW()`
        : "updated_at = NOW()";

    const text = `
      INSERT INTO ${this.tableName} (${insertColumns.join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (${conflictColumns.join(", ")})
      DO UPDATE SET ${updateSet}
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.query<T>(executor, text, insertValues);

    if (!result.rows[0]) {
      throw new Error(`Failed to upsert ${this.tableName} record`);
    }

    return result.rows[0];
  }

  /**
   * Execute a raw query with the repository's pool
   *
   * Use sparingly - prefer the built-in methods for type safety.
   *
   * @param text - SQL query text with $1, $2, etc. placeholders
   * @param values - Parameter values
   * @param executor - Optional query executor (for transactions)
   * @returns Query result
   */
  async rawQuery<R = T>(
    text: string,
    values?: unknown[],
    executor: QueryExecutor = this.pool
  ): Promise<QueryResult<R>> {
    return this.query<R>(executor, text, values);
  }
}
