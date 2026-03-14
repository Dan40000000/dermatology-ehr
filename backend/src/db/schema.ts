import { pool } from './pool';

const tableColumnsCache = new Map<string, Set<string>>();

function buildCacheKey(schemaName: string, tableName: string): string {
  return `${schemaName}.${tableName}`;
}

/**
 * Read and cache table column names for lightweight runtime schema checks.
 * This keeps handlers resilient when optional columns are not present yet.
 */
export async function getTableColumns(
  tableName: string,
  schemaName = 'public',
): Promise<Set<string>> {
  const cacheKey = buildCacheKey(schemaName, tableName);
  const cached = tableColumnsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await pool.query(
    `select column_name
     from information_schema.columns
     where table_schema = $1 and table_name = $2`,
    [schemaName, tableName],
  );

  const columns = new Set<string>(
    result.rows
      .map((row: { column_name?: unknown }) => row.column_name)
      .filter((column): column is string => typeof column === 'string'),
  );

  tableColumnsCache.set(cacheKey, columns);
  return columns;
}

export function clearTableColumnsCache(tableName?: string, schemaName = 'public') {
  if (!tableName) {
    tableColumnsCache.clear();
    return;
  }

  tableColumnsCache.delete(buildCacheKey(schemaName, tableName));
}
