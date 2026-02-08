/**
 * QueryBuilder - Type-safe SQL query construction
 *
 * Provides a fluent interface for building parameterized SQL queries.
 * All queries use parameter placeholders ($1, $2, etc.) to prevent SQL injection.
 *
 * @example
 * const { text, values } = new QueryBuilder()
 *   .select(['id', 'name', 'email'])
 *   .from('users')
 *   .where({ tenant_id: 'abc', deleted_at: null })
 *   .orderBy('created_at', 'DESC')
 *   .limit(10)
 *   .build();
 */

import type { ComparisonOperator, WhereCondition } from "./types.js";

export class QueryBuilder {
  private selectColumns: string[] = ["*"];
  private fromTable: string = "";
  private whereConditions: WhereCondition[] = [];
  private orderByClause: { column: string; direction: "ASC" | "DESC" } | null =
    null;
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private joinClauses: string[] = [];
  private groupByColumns: string[] = [];
  private havingConditions: WhereCondition[] = [];
  private isCountQuery: boolean = false;

  private assertNoUnsafeTokens(value: string, context: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`QueryBuilder: ${context} cannot be empty`);
    }
    if (/;|--|\/\*|\*\//.test(trimmed)) {
      throw new Error(`QueryBuilder: ${context} contains unsafe tokens`);
    }
    return trimmed;
  }

  private assertSafeIdentifier(value: string, context: string): string {
    const trimmed = this.assertNoUnsafeTokens(value, context);
    const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
    const numericPattern = /^\d+$/;
    if (!identifierPattern.test(trimmed) && !numericPattern.test(trimmed)) {
      throw new Error(`QueryBuilder: ${context} must be a simple identifier`);
    }
    return trimmed;
  }

  private assertSafeSelectColumn(value: string): string {
    const trimmed = this.assertNoUnsafeTokens(value, "select column");
    const safePattern = /^[A-Za-z0-9_.*(),\s]+$/;
    if (!safePattern.test(trimmed)) {
      throw new Error("QueryBuilder: select column contains unsafe characters");
    }
    return trimmed;
  }

  private assertSafeCountColumn(value: string): string {
    const trimmed = this.assertNoUnsafeTokens(value, "count column");
    if (trimmed === "*") {
      return trimmed;
    }
    const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
    const distinctPattern =
      /^distinct\s+[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/i;
    if (!identifierPattern.test(trimmed) && !distinctPattern.test(trimmed)) {
      throw new Error(
        "QueryBuilder: count column must be '*' or a simple identifier"
      );
    }
    return trimmed;
  }

  private assertSafeTable(value: string): string {
    const trimmed = this.assertNoUnsafeTokens(value, "table");
    const parts = trimmed.split(/\s+/);
    const basePattern = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
    const aliasPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

    if (parts.length === 1) {
      const tableName = parts[0] ?? '';
      if (!basePattern.test(tableName)) {
        throw new Error("QueryBuilder: table must be a simple identifier");
      }
      return trimmed;
    }

    if (parts.length === 2) {
      const tableName = parts[0] ?? '';
      const alias = parts[1] ?? '';
      if (!basePattern.test(tableName) || !aliasPattern.test(alias)) {
        throw new Error("QueryBuilder: table alias is invalid");
      }
      return `${tableName} ${alias}`;
    }

    if (parts.length === 3) {
      const tableName = parts[0] ?? '';
      const asKeyword = parts[1] ?? '';
      const alias = parts[2] ?? '';
      if (
        asKeyword.toLowerCase() !== "as" ||
        !basePattern.test(tableName) ||
        !aliasPattern.test(alias)
      ) {
        throw new Error("QueryBuilder: table alias is invalid");
      }
      return `${tableName} ${asKeyword} ${alias}`;
    }

    throw new Error("QueryBuilder: table format is invalid");
  }

  private assertSafeJoinCondition(value: string): string {
    const trimmed = this.assertNoUnsafeTokens(value, "join condition");
    const safePattern = /^[A-Za-z0-9_\s.=<>]+$/;
    if (!safePattern.test(trimmed)) {
      throw new Error("QueryBuilder: join condition contains unsafe characters");
    }
    return trimmed;
  }

  /**
   * Set columns to select
   * @param columns - Array of column names (use explicit columns, not '*')
   */
  select(columns: string[]): this {
    if (columns.length === 0) {
      throw new Error("QueryBuilder: select() requires at least one column");
    }
    this.selectColumns = columns.map((column) =>
      this.assertSafeSelectColumn(column)
    );
    this.isCountQuery = false;
    return this;
  }

  /**
   * Set the query to return a count
   * @param column - Column to count (default: '*')
   */
  selectCount(column: string = "*"): this {
    const safeColumn = this.assertSafeCountColumn(column);
    this.selectColumns = [`COUNT(${safeColumn}) as count`];
    this.isCountQuery = true;
    return this;
  }

  /**
   * Set the table to query from
   * @param table - Table name
   */
  from(table: string): this {
    if (!table || table.trim() === "") {
      throw new Error("QueryBuilder: from() requires a table name");
    }
    this.fromTable = this.assertSafeTable(table);
    return this;
  }

  /**
   * Add a JOIN clause
   * @param type - Type of join (INNER, LEFT, RIGHT)
   * @param table - Table to join
   * @param condition - Join condition (e.g., 'users.id = orders.user_id')
   */
  join(
    type: "INNER" | "LEFT" | "RIGHT",
    table: string,
    condition: string
  ): this {
    const safeTable = this.assertSafeTable(table);
    const safeCondition = this.assertSafeJoinCondition(condition);
    this.joinClauses.push(`${type} JOIN ${safeTable} ON ${safeCondition}`);
    return this;
  }

  /**
   * Add WHERE conditions from an object (equality only)
   * @param conditions - Object of column -> value pairs
   */
  where(conditions: Record<string, unknown>): this {
    for (const [column, value] of Object.entries(conditions)) {
      if (value === undefined) {
        continue;
      }
      const safeColumn = this.assertSafeIdentifier(column, "where column");
      if (value === null) {
        this.whereConditions.push({
          column: safeColumn,
          operator: "IS NULL",
          value: null,
        });
      } else if (Array.isArray(value)) {
        this.whereConditions.push({
          column: safeColumn,
          operator: "IN",
          value,
        });
      } else {
        this.whereConditions.push({
          column: safeColumn,
          operator: "=",
          value,
        });
      }
    }
    return this;
  }

  /**
   * Add a WHERE condition with a specific operator
   * @param column - Column name
   * @param operator - Comparison operator
   * @param value - Value to compare against
   */
  whereOp(column: string, operator: ComparisonOperator, value: unknown): this {
    const safeColumn = this.assertSafeIdentifier(column, "where column");
    this.whereConditions.push({ column: safeColumn, operator, value });
    return this;
  }

  /**
   * Add a WHERE condition for non-null values
   * @param column - Column name
   */
  whereNotNull(column: string): this {
    const safeColumn = this.assertSafeIdentifier(column, "where column");
    this.whereConditions.push({
      column: safeColumn,
      operator: "IS NOT NULL",
      value: null,
    });
    return this;
  }

  /**
   * Add a WHERE condition for null values
   * @param column - Column name
   */
  whereNull(column: string): this {
    const safeColumn = this.assertSafeIdentifier(column, "where column");
    this.whereConditions.push({
      column: safeColumn,
      operator: "IS NULL",
      value: null,
    });
    return this;
  }

  /**
   * Add a WHERE IN condition
   * @param column - Column name
   * @param values - Array of values
   */
  whereIn(column: string, values: unknown[]): this {
    if (values.length === 0) {
      // WHERE column IN () is invalid SQL - use FALSE instead
      this.whereConditions.push({
        column: "1",
        operator: "=",
        value: 0,
      });
    } else {
      const safeColumn = this.assertSafeIdentifier(column, "where column");
      this.whereConditions.push({
        column: safeColumn,
        operator: "IN",
        value: values,
      });
    }
    return this;
  }

  /**
   * Add ORDER BY clause
   * @param column - Column to order by
   * @param direction - Sort direction (ASC or DESC)
   */
  orderBy(column: string, direction: "ASC" | "DESC" = "ASC"): this {
    const safeColumn = this.assertSafeIdentifier(column, "orderBy column");
    this.orderByClause = { column: safeColumn, direction };
    return this;
  }

  /**
   * Set LIMIT clause
   * @param count - Maximum number of rows to return
   */
  limit(count: number): this {
    if (count < 0) {
      throw new Error("QueryBuilder: limit() requires a non-negative number");
    }
    this.limitValue = count;
    return this;
  }

  /**
   * Set OFFSET clause
   * @param count - Number of rows to skip
   */
  offset(count: number): this {
    if (count < 0) {
      throw new Error("QueryBuilder: offset() requires a non-negative number");
    }
    this.offsetValue = count;
    return this;
  }

  /**
   * Add GROUP BY clause
   * @param columns - Columns to group by
   */
  groupBy(columns: string[]): this {
    this.groupByColumns = columns.map((column) =>
      this.assertSafeIdentifier(column, "groupBy column")
    );
    return this;
  }

  /**
   * Add HAVING conditions (for use with GROUP BY)
   * @param conditions - Object of column -> value pairs
   */
  having(conditions: Record<string, unknown>): this {
    for (const [column, value] of Object.entries(conditions)) {
      const safeColumn = this.assertSafeIdentifier(column, "having column");
      this.havingConditions.push({
        column: safeColumn,
        operator: "=",
        value,
      });
    }
    return this;
  }

  /**
   * Build the final SQL query with parameterized values
   * @returns Object containing query text and values array
   */
  build(): { text: string; values: unknown[] } {
    if (!this.fromTable) {
      throw new Error("QueryBuilder: from() must be called before build()");
    }

    const values: unknown[] = [];
    let paramIndex = 1;

    // SELECT clause
    const selectClause = `SELECT ${this.selectColumns.join(", ")}`;

    // FROM clause
    const fromClause = `FROM ${this.fromTable}`;

    // JOIN clauses
    const joinClause =
      this.joinClauses.length > 0 ? this.joinClauses.join(" ") : "";

    // WHERE clause
    let whereClause = "";
    if (this.whereConditions.length > 0) {
      const conditions = this.whereConditions.map((cond) => {
        if (cond.operator === "IS NULL" || cond.operator === "IS NOT NULL") {
          return `${cond.column} ${cond.operator}`;
        }
        if (cond.operator === "IN" || cond.operator === "NOT IN") {
          const arr = cond.value as unknown[];
          const placeholders = arr.map(() => `$${paramIndex++}`);
          values.push(...arr);
          return `${cond.column} ${cond.operator} (${placeholders.join(", ")})`;
        }
        values.push(cond.value);
        return `${cond.column} ${cond.operator} $${paramIndex++}`;
      });
      whereClause = `WHERE ${conditions.join(" AND ")}`;
    }

    // GROUP BY clause
    const groupByClause =
      this.groupByColumns.length > 0
        ? `GROUP BY ${this.groupByColumns.join(", ")}`
        : "";

    // HAVING clause
    let havingClause = "";
    if (this.havingConditions.length > 0) {
      const conditions = this.havingConditions.map((cond) => {
        values.push(cond.value);
        return `${cond.column} ${cond.operator} $${paramIndex++}`;
      });
      havingClause = `HAVING ${conditions.join(" AND ")}`;
    }

    // ORDER BY clause
    const orderByClause = this.orderByClause
      ? `ORDER BY ${this.orderByClause.column} ${this.orderByClause.direction}`
      : "";

    // LIMIT clause
    const limitClause =
      this.limitValue !== null ? `LIMIT ${this.limitValue}` : "";

    // OFFSET clause
    const offsetClause =
      this.offsetValue !== null ? `OFFSET ${this.offsetValue}` : "";

    // Combine all parts
    const parts = [
      selectClause,
      fromClause,
      joinClause,
      whereClause,
      groupByClause,
      havingClause,
      orderByClause,
      limitClause,
      offsetClause,
    ].filter((part) => part !== "");

    return {
      text: parts.join(" "),
      values,
    };
  }

  /**
   * Reset the builder to initial state
   */
  reset(): this {
    this.selectColumns = ["*"];
    this.fromTable = "";
    this.whereConditions = [];
    this.orderByClause = null;
    this.limitValue = null;
    this.offsetValue = null;
    this.joinClauses = [];
    this.groupByColumns = [];
    this.havingConditions = [];
    this.isCountQuery = false;
    return this;
  }

  /**
   * Clone this builder
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder();
    cloned.selectColumns = [...this.selectColumns];
    cloned.fromTable = this.fromTable;
    cloned.whereConditions = [...this.whereConditions];
    cloned.orderByClause = this.orderByClause
      ? { ...this.orderByClause }
      : null;
    cloned.limitValue = this.limitValue;
    cloned.offsetValue = this.offsetValue;
    cloned.joinClauses = [...this.joinClauses];
    cloned.groupByColumns = [...this.groupByColumns];
    cloned.havingConditions = [...this.havingConditions];
    cloned.isCountQuery = this.isCountQuery;
    return cloned;
  }
}

/**
 * Factory function to create a new QueryBuilder instance
 */
export function createQueryBuilder(): QueryBuilder {
  return new QueryBuilder();
}
