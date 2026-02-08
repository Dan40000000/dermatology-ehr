/**
 * QueryBuilder Tests
 */

import { QueryBuilder, createQueryBuilder } from "../QueryBuilder.js";

describe("QueryBuilder", () => {
  describe("basic queries", () => {
    it("should build a simple SELECT query", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name", "email"])
        .from("users")
        .build();

      expect(text).toBe("SELECT id, name, email FROM users");
      expect(values).toEqual([]);
    });

    it("should build a COUNT query", () => {
      const { text, values } = new QueryBuilder()
        .selectCount()
        .from("users")
        .build();

      expect(text).toBe("SELECT COUNT(*) as count FROM users");
      expect(values).toEqual([]);
    });

    it("should build a COUNT query with specific column", () => {
      const { text, values } = new QueryBuilder()
        .selectCount("id")
        .from("users")
        .build();

      expect(text).toBe("SELECT COUNT(id) as count FROM users");
      expect(values).toEqual([]);
    });
  });

  describe("WHERE conditions", () => {
    it("should build query with equality conditions", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ tenant_id: "tenant-1", active: true })
        .build();

      expect(text).toBe(
        "SELECT id, name FROM users WHERE tenant_id = $1 AND active = $2"
      );
      expect(values).toEqual(["tenant-1", true]);
    });

    it("should handle null values as IS NULL", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ deleted_at: null })
        .build();

      expect(text).toBe("SELECT id, name FROM users WHERE deleted_at IS NULL");
      expect(values).toEqual([]);
    });

    it("should ignore undefined values", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ deleted_at: undefined })
        .build();

      expect(text).toBe("SELECT id, name FROM users");
      expect(values).toEqual([]);
    });

    it("should handle array values as IN", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ status: ["active", "pending"] })
        .build();

      expect(text).toBe(
        "SELECT id, name FROM users WHERE status IN ($1, $2)"
      );
      expect(values).toEqual(["active", "pending"]);
    });

    it("should build query with whereOp for custom operators", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .whereOp("age", ">=", 18)
        .build();

      expect(text).toBe("SELECT id, name FROM users WHERE age >= $1");
      expect(values).toEqual([18]);
    });

    it("should build query with whereNotNull", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .whereNotNull("email")
        .build();

      expect(text).toBe("SELECT id, name FROM users WHERE email IS NOT NULL");
      expect(values).toEqual([]);
    });

    it("should build query with whereNull", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .whereNull("deleted_at")
        .build();

      expect(text).toBe("SELECT id, name FROM users WHERE deleted_at IS NULL");
      expect(values).toEqual([]);
    });

    it("should build query with whereIn", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .whereIn("id", ["a", "b", "c"])
        .build();

      expect(text).toBe("SELECT id, name FROM users WHERE id IN ($1, $2, $3)");
      expect(values).toEqual(["a", "b", "c"]);
    });

    it("should handle empty whereIn array", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .whereIn("id", [])
        .build();

      // Empty IN clause should result in FALSE condition
      expect(text).toBe("SELECT id, name FROM users WHERE 1 = $1");
      expect(values).toEqual([0]);
    });

    it("should combine multiple WHERE conditions with AND", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ tenant_id: "tenant-1" })
        .whereNull("deleted_at")
        .whereOp("created_at", ">=", "2024-01-01")
        .build();

      expect(text).toBe(
        "SELECT id, name FROM users WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2"
      );
      expect(values).toEqual(["tenant-1", "2024-01-01"]);
    });
  });

  describe("ORDER BY", () => {
    it("should build query with ORDER BY ASC (default)", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .orderBy("name")
        .build();

      expect(text).toBe("SELECT id, name FROM users ORDER BY name ASC");
      expect(values).toEqual([]);
    });

    it("should build query with ORDER BY DESC", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .orderBy("created_at", "DESC")
        .build();

      expect(text).toBe("SELECT id, name FROM users ORDER BY created_at DESC");
      expect(values).toEqual([]);
    });
  });

  describe("LIMIT and OFFSET", () => {
    it("should build query with LIMIT", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .limit(10)
        .build();

      expect(text).toBe("SELECT id, name FROM users LIMIT 10");
      expect(values).toEqual([]);
    });

    it("should build query with OFFSET", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .offset(20)
        .build();

      expect(text).toBe("SELECT id, name FROM users OFFSET 20");
      expect(values).toEqual([]);
    });

    it("should build query with both LIMIT and OFFSET", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .limit(10)
        .offset(20)
        .build();

      expect(text).toBe("SELECT id, name FROM users LIMIT 10 OFFSET 20");
      expect(values).toEqual([]);
    });
  });

  describe("JOINs", () => {
    it("should build query with INNER JOIN", () => {
      const { text, values } = new QueryBuilder()
        .select(["users.id", "users.name", "orders.total"])
        .from("users")
        .join("INNER", "orders", "users.id = orders.user_id")
        .build();

      expect(text).toBe(
        "SELECT users.id, users.name, orders.total FROM users INNER JOIN orders ON users.id = orders.user_id"
      );
      expect(values).toEqual([]);
    });

    it("should build query with LEFT JOIN", () => {
      const { text, values } = new QueryBuilder()
        .select(["users.id", "users.name", "profiles.bio"])
        .from("users")
        .join("LEFT", "profiles", "users.id = profiles.user_id")
        .build();

      expect(text).toBe(
        "SELECT users.id, users.name, profiles.bio FROM users LEFT JOIN profiles ON users.id = profiles.user_id"
      );
      expect(values).toEqual([]);
    });

    it("should build query with multiple JOINs", () => {
      const { text, values } = new QueryBuilder()
        .select(["u.id", "u.name", "o.total", "p.bio"])
        .from("users u")
        .join("LEFT", "orders o", "u.id = o.user_id")
        .join("LEFT", "profiles p", "u.id = p.user_id")
        .build();

      expect(text).toBe(
        "SELECT u.id, u.name, o.total, p.bio FROM users u LEFT JOIN orders o ON u.id = o.user_id LEFT JOIN profiles p ON u.id = p.user_id"
      );
      expect(values).toEqual([]);
    });
  });

  describe("GROUP BY and HAVING", () => {
    it("should build query with GROUP BY", () => {
      const { text, values } = new QueryBuilder()
        .select(["status", "COUNT(*) as count"])
        .from("users")
        .groupBy(["status"])
        .build();

      expect(text).toBe(
        "SELECT status, COUNT(*) as count FROM users GROUP BY status"
      );
      expect(values).toEqual([]);
    });

    it("should build query with GROUP BY and HAVING", () => {
      const { text, values } = new QueryBuilder()
        .select(["tenant_id", "COUNT(*) as count"])
        .from("users")
        .groupBy(["tenant_id"])
        .having({ count: 5 })
        .build();

      expect(text).toBe(
        "SELECT tenant_id, COUNT(*) as count FROM users GROUP BY tenant_id HAVING count = $1"
      );
      expect(values).toEqual([5]);
    });
  });

  describe("complex queries", () => {
    it("should build a complete complex query", () => {
      const { text, values } = new QueryBuilder()
        .select(["id", "name", "email", "created_at"])
        .from("users")
        .where({ tenant_id: "tenant-1", role: "admin" })
        .whereNull("deleted_at")
        .orderBy("created_at", "DESC")
        .limit(10)
        .offset(0)
        .build();

      expect(text).toBe(
        "SELECT id, name, email, created_at FROM users " +
          "WHERE tenant_id = $1 AND role = $2 AND deleted_at IS NULL " +
          "ORDER BY created_at DESC LIMIT 10 OFFSET 0"
      );
      expect(values).toEqual(["tenant-1", "admin"]);
    });

    it("should handle parameter indexing correctly with multiple conditions", () => {
      const { text, values } = new QueryBuilder()
        .select(["id"])
        .from("users")
        .where({ a: 1, b: 2 })
        .whereIn("c", [3, 4, 5])
        .whereOp("d", ">=", 6)
        .build();

      expect(text).toBe(
        "SELECT id FROM users WHERE a = $1 AND b = $2 AND c IN ($3, $4, $5) AND d >= $6"
      );
      expect(values).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe("error handling", () => {
    it("should throw error if select is called with empty array", () => {
      expect(() => {
        new QueryBuilder().select([]);
      }).toThrow("QueryBuilder: select() requires at least one column");
    });

    it("should throw error if from is called with empty string", () => {
      expect(() => {
        new QueryBuilder().select(["id"]).from("");
      }).toThrow("QueryBuilder: from() requires a table name");
    });

    it("should throw error if build is called without from", () => {
      expect(() => {
        new QueryBuilder().select(["id"]).build();
      }).toThrow("QueryBuilder: from() must be called before build()");
    });

    it("should throw error if limit is negative", () => {
      expect(() => {
        new QueryBuilder().select(["id"]).from("users").limit(-1);
      }).toThrow("QueryBuilder: limit() requires a non-negative number");
    });

    it("should throw error if offset is negative", () => {
      expect(() => {
        new QueryBuilder().select(["id"]).from("users").offset(-1);
      }).toThrow("QueryBuilder: offset() requires a non-negative number");
    });
  });

  describe("clone", () => {
    it("should create an independent copy", () => {
      const original = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ tenant_id: "tenant-1" });

      const cloned = original.clone();
      cloned.where({ active: true });

      const originalResult = original.build();
      const clonedResult = cloned.build();

      expect(originalResult.text).toBe(
        "SELECT id, name FROM users WHERE tenant_id = $1"
      );
      expect(clonedResult.text).toBe(
        "SELECT id, name FROM users WHERE tenant_id = $1 AND active = $2"
      );
    });
  });

  describe("reset", () => {
    it("should reset builder to initial state", () => {
      const builder = new QueryBuilder()
        .select(["id", "name"])
        .from("users")
        .where({ tenant_id: "tenant-1" })
        .orderBy("name")
        .limit(10);

      builder.reset();

      const { text, values } = builder.select(["id"]).from("other_table").build();

      expect(text).toBe("SELECT id FROM other_table");
      expect(values).toEqual([]);
    });
  });

  describe("createQueryBuilder factory", () => {
    it("should create a new QueryBuilder instance", () => {
      const builder = createQueryBuilder();
      expect(builder).toBeInstanceOf(QueryBuilder);
    });
  });
});
