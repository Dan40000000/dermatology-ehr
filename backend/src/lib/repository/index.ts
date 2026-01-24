/**
 * Repository Pattern Module
 *
 * Provides a consistent, type-safe interface for database operations with:
 * - Multi-tenant safety (always filters by tenant_id)
 * - Explicit column selection (no SELECT *)
 * - Soft delete support
 * - Parameterized queries (SQL injection safe)
 * - Transaction support
 *
 * @example
 * import {
 *   BaseRepository,
 *   withTransaction,
 *   QueryBuilder,
 *   type FindOptions,
 * } from '../lib/repository';
 *
 * // Define your entity types
 * interface Patient extends BaseEntity {
 *   first_name: string;
 *   last_name: string;
 *   email: string;
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
 * // Create your repository
 * class PatientRepository extends BaseRepository<Patient, CreatePatientDTO, UpdatePatientDTO> {
 *   constructor(pool: Pool) {
 *     super({
 *       tableName: 'patients',
 *       pool,
 *       columns: ['id', 'tenant_id', 'first_name', 'last_name', 'email', 'created_at', 'updated_at', 'deleted_at'],
 *     });
 *   }
 *
 *   // Add custom methods
 *   async findByEmail(email: string, tenantId: string): Promise<Patient | null> {
 *     return this.findOneWhere({ email }, tenantId);
 *   }
 * }
 *
 * // Use in routes
 * const patientRepo = new PatientRepository(pool);
 *
 * // Simple operations
 * const patient = await patientRepo.findById(id, tenantId);
 * const patients = await patientRepo.findAll(tenantId, { orderBy: 'created_at', direction: 'DESC' });
 * const newPatient = await patientRepo.create({ first_name: 'John', last_name: 'Doe', email: 'john@example.com' }, tenantId);
 *
 * // With transactions
 * const result = await withTransaction(pool, async (client) => {
 *   const patient = await patientRepo.create(patientData, tenantId, client);
 *   await insuranceRepo.create({ patient_id: patient.id, ...insuranceData }, tenantId, client);
 *   return patient;
 * });
 */

// Core repository class
export { BaseRepository } from "./BaseRepository.js";

// Query builder
export { QueryBuilder, createQueryBuilder } from "./QueryBuilder.js";

// Transaction helpers
export {
  withTransaction,
  withTransactionClient,
  withParallelTransaction,
  createSavepoint,
  rollbackToSavepoint,
  releaseSavepoint,
  type IsolationLevel,
  type TransactionOptions,
} from "./TransactionHelper.js";

// Types
export type {
  BaseEntity,
  FindOptions,
  PaginatedResult,
  ComparisonOperator,
  WhereCondition,
  SimpleConditions,
  RepositoryConfig,
  QueryExecutor,
  MutationResult,
  TransactionCallback,
} from "./types.js";

export { isPoolClient } from "./types.js";
