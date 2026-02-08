/**
 * Field Selection Middleware (Sparse Fieldsets)
 *
 * Allows clients to request specific fields to reduce payload size
 * Usage: GET /api/patients?fields=id,firstName,lastName,email
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Parse fields parameter from query string
 */
export function parseFields(req: Request): string[] | null {
  const fieldsParam = req.query.fields as string;

  if (!fieldsParam) {
    return null;
  }

  return fieldsParam
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Filter object to include only requested fields
 */
export function filterFields<T extends Record<string, any>>(
  obj: T,
  fields: string[] | null
): Partial<T> {
  if (!fields || fields.length === 0) {
    return obj;
  }

  const filtered: Partial<T> = {};

  for (const field of fields) {
    if (field in obj) {
      filtered[field as keyof T] = obj[field];
    }
  }

  return filtered;
}

/**
 * Filter array of objects to include only requested fields
 */
export function filterFieldsArray<T extends Record<string, any>>(
  array: T[],
  fields: string[] | null
): Partial<T>[] {
  if (!fields || fields.length === 0) {
    return array;
  }

  return array.map((item) => filterFields(item, fields));
}

/**
 * Middleware to attach field selection to request
 */
export function fieldSelectionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  (req as any).selectedFields = parseFields(req);
  next();
}

/**
 * Build SQL SELECT clause from field selection
 * Maps camelCase to snake_case for database columns
 */
export function buildSelectClause(
  fields: string[] | null,
  defaultFields: string,
  fieldMap?: Record<string, string>,
  allowedFields?: string[]
): string {
  if (!fields || fields.length === 0) {
    return defaultFields;
  }

  if (allowedFields && allowedFields.length > 0) {
    const invalidFields = fields.filter((field) => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
      throw new Error(`Invalid fields requested: ${invalidFields.join(", ")}`);
    }
  }

  const mappedFields = fields.map((field) => {
    // Use custom mapping if provided
    if (fieldMap && fieldMap[field]) {
      return fieldMap[field];
    }

    // Convert camelCase to snake_case
    const snakeCase = field.replace(/([A-Z])/g, '_$1').toLowerCase();

    // Add alias for camelCase output
    if (snakeCase !== field) {
      return `${snakeCase} as "${field}"`;
    }

    return snakeCase;
  });

  return mappedFields.join(', ');
}
