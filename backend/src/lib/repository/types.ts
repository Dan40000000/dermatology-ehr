/**
 * Repository Pattern Types
 *
 * Common types and interfaces for the repository pattern implementation.
 * These types ensure type-safety across all repository operations.
 */

import type { Pool, PoolClient } from "pg";

/**
 * Base entity interface - all database entities should extend this
 */
export interface BaseEntity {
  id: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

/**
 * Options for find operations with pagination, sorting, and filtering
 */
export interface FindOptions {
  /** Column to order results by */
  orderBy?: string;
  /** Sort direction */
  direction?: "ASC" | "DESC";
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
  /** Include soft-deleted records in results */
  includeDeleted?: boolean;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Comparison operators for where conditions
 */
export type ComparisonOperator =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "NOT IN"
  | "IS NULL"
  | "IS NOT NULL";

/**
 * Where condition with operator support
 */
export interface WhereCondition {
  column: string;
  operator: ComparisonOperator;
  value: unknown;
}

/**
 * Type for simple equality conditions (column -> value)
 */
export type SimpleConditions<T> = Partial<Record<keyof T, unknown>>;

/**
 * Repository configuration options
 */
export interface RepositoryConfig {
  /** Name of the database table */
  tableName: string;
  /** Database connection pool */
  pool: Pool;
  /** Explicit list of columns (no SELECT *) */
  columns: string[];
  /** Primary key column name (default: 'id') */
  primaryKey?: string;
  /** Tenant ID column name (default: 'tenant_id') */
  tenantColumn?: string;
  /** Soft delete column name (default: 'deleted_at') */
  softDeleteColumn?: string;
  /** Whether the table supports soft delete (default: true) */
  supportsSoftDelete?: boolean;
}

/**
 * Query execution context - either pool or client for transactions
 */
export type QueryExecutor = Pool | PoolClient;

/**
 * Result of a mutation operation (create/update/delete)
 */
export interface MutationResult<T> {
  success: boolean;
  data?: T;
  rowsAffected?: number;
}

/**
 * Transaction callback function type
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Type guard to check if executor is a PoolClient
 */
export function isPoolClient(executor: QueryExecutor): executor is PoolClient {
  return "release" in executor;
}
