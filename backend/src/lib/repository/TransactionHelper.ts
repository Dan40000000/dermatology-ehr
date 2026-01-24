/**
 * TransactionHelper - Centralized transaction management
 *
 * Provides a consistent, safe way to handle database transactions
 * with automatic commit/rollback and proper client cleanup.
 *
 * @example
 * // Simple transaction
 * const result = await withTransaction(pool, async (client) => {
 *   await client.query('INSERT INTO users ...');
 *   await client.query('INSERT INTO profiles ...');
 *   return { success: true };
 * });
 *
 * @example
 * // Nested transaction (uses existing client)
 * const result = await withTransactionClient(existingClient, async () => {
 *   await existingClient.query('UPDATE ...');
 *   return { updated: true };
 * });
 */

import type { Pool, PoolClient } from "pg";
import { logger } from "../logger.js";

/**
 * Transaction isolation levels supported by PostgreSQL
 */
export type IsolationLevel =
  | "READ UNCOMMITTED"
  | "READ COMMITTED"
  | "REPEATABLE READ"
  | "SERIALIZABLE";

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /** Isolation level for the transaction */
  isolationLevel?: IsolationLevel;
  /** Whether the transaction is read-only */
  readOnly?: boolean;
  /** Maximum time (ms) to wait for transaction to complete */
  timeout?: number;
}

/**
 * Execute a callback within a database transaction.
 *
 * Handles:
 * - Acquiring a client from the pool
 * - BEGIN transaction
 * - COMMIT on success
 * - ROLLBACK on error
 * - Releasing client back to pool (always)
 *
 * @param pool - Database connection pool
 * @param callback - Function to execute within the transaction
 * @param options - Optional transaction configuration
 * @returns The result of the callback function
 * @throws Re-throws any error from the callback after rollback
 *
 * @example
 * const user = await withTransaction(pool, async (client) => {
 *   const { rows: [user] } = await client.query(
 *     'INSERT INTO users (name) VALUES ($1) RETURNING *',
 *     ['Alice']
 *   );
 *   await client.query(
 *     'INSERT INTO user_settings (user_id) VALUES ($1)',
 *     [user.id]
 *   );
 *   return user;
 * });
 */
export async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Build BEGIN statement with options
    let beginStatement = "BEGIN";
    if (options?.isolationLevel) {
      beginStatement += ` ISOLATION LEVEL ${options.isolationLevel}`;
    }
    if (options?.readOnly) {
      beginStatement += " READ ONLY";
    }

    await client.query(beginStatement);

    // Set statement timeout if specified
    if (options?.timeout) {
      await client.query(`SET LOCAL statement_timeout = ${options.timeout}`);
    }

    // Execute the callback
    const result = await callback(client);

    // Commit on success
    await client.query("COMMIT");

    const duration = Date.now() - startTime;
    logger.debug("Transaction committed", {
      duration,
      isolationLevel: options?.isolationLevel,
    });

    return result;
  } catch (error) {
    // Rollback on error
    try {
      await client.query("ROLLBACK");
      const duration = Date.now() - startTime;
      logger.debug("Transaction rolled back", {
        duration,
        error: (error as Error).message,
      });
    } catch (rollbackError) {
      // Log rollback failure but throw original error
      logger.error("Failed to rollback transaction", {
        originalError: (error as Error).message,
        rollbackError: (rollbackError as Error).message,
      });
    }

    throw error;
  } finally {
    // Always release client back to pool
    client.release();
  }
}

/**
 * Execute a callback within an existing transaction client context.
 *
 * Use this when you already have a transaction in progress and want
 * to execute additional operations within the same transaction.
 * Does NOT create a new transaction - relies on the caller's transaction.
 *
 * This is useful for:
 * - Composing repository operations that each need transaction support
 * - Calling helper functions from within a transaction
 *
 * @param client - Existing pool client with active transaction
 * @param callback - Function to execute
 * @returns The result of the callback function
 * @throws Re-throws any error from the callback (caller handles rollback)
 *
 * @example
 * await withTransaction(pool, async (client) => {
 *   const user = await withTransactionClient(client, () =>
 *     userRepository.create(userData, client)
 *   );
 *   await withTransactionClient(client, () =>
 *     settingsRepository.createDefaults(user.id, client)
 *   );
 * });
 */
export async function withTransactionClient<T>(
  client: PoolClient,
  callback: () => Promise<T>
): Promise<T> {
  // Simply execute the callback - transaction management is caller's responsibility
  return callback();
}

/**
 * Execute multiple callbacks in parallel within a single transaction.
 *
 * Useful when you have independent operations that can run concurrently
 * but must all succeed or fail together.
 *
 * @param pool - Database connection pool
 * @param callbacks - Array of functions to execute
 * @param options - Optional transaction configuration
 * @returns Array of results from each callback
 *
 * @example
 * const [users, products] = await withParallelTransaction(pool, [
 *   (client) => client.query('SELECT * FROM users WHERE active = true'),
 *   (client) => client.query('SELECT * FROM products WHERE in_stock = true'),
 * ]);
 */
export async function withParallelTransaction<T extends unknown[]>(
  pool: Pool,
  callbacks: { [K in keyof T]: (client: PoolClient) => Promise<T[K]> },
  options?: TransactionOptions
): Promise<T> {
  return withTransaction(
    pool,
    async (client) => {
      // Run all callbacks in parallel with the same client
      // Note: PostgreSQL handles concurrent queries on same connection sequentially
      // but this allows for cleaner code organization
      const results = await Promise.all(
        callbacks.map((callback) => callback(client))
      );
      return results as T;
    },
    options
  );
}

/**
 * Create a savepoint within an existing transaction.
 *
 * Savepoints allow partial rollback within a transaction.
 *
 * @param client - Pool client with active transaction
 * @param name - Savepoint name (must be unique within transaction)
 *
 * @example
 * await withTransaction(pool, async (client) => {
 *   await client.query('INSERT INTO users ...');
 *   await createSavepoint(client, 'before_optional');
 *   try {
 *     await client.query('INSERT INTO optional_data ...');
 *   } catch {
 *     await rollbackToSavepoint(client, 'before_optional');
 *   }
 * });
 */
export async function createSavepoint(
  client: PoolClient,
  name: string
): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Savepoint name must be a valid identifier");
  }
  await client.query(`SAVEPOINT ${name}`);
}

/**
 * Rollback to a savepoint within an existing transaction.
 *
 * @param client - Pool client with active transaction
 * @param name - Savepoint name to rollback to
 */
export async function rollbackToSavepoint(
  client: PoolClient,
  name: string
): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Savepoint name must be a valid identifier");
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
}

/**
 * Release a savepoint within an existing transaction.
 *
 * Releases the savepoint, freeing up resources. The savepoint
 * cannot be rolled back to after release.
 *
 * @param client - Pool client with active transaction
 * @param name - Savepoint name to release
 */
export async function releaseSavepoint(
  client: PoolClient,
  name: string
): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Savepoint name must be a valid identifier");
  }
  await client.query(`RELEASE SAVEPOINT ${name}`);
}
