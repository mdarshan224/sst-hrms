import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
// Executes the actual generated migrations and service SQL against real SQLite.
// D1 batch semantics are represented by a single atomic transaction.
export function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  class Statement {
    constructor(query, args = []) {
      this.query = query;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.query, args);
    }
    async first() {
      return sql.prepare(this.query).get(...this.args) ?? null;
    }
    async all() {
      return {
        results: sql.prepare(this.query).all(...this.args),
        success: true,
      };
    }
    async run() {
      const statement = sql.prepare(this.query);
      if (statement.columns().length) {
        return {
          success: true,
          results: statement.all(...this.args),
          meta: { changes: 0 },
        };
      }
      const result = statement.run(...this.args);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes) },
      };
    }
  }
  return {
    sql,
    db: {
      prepare: (query) => new Statement(query),
      batch: async (commands) => {
        sql.exec("BEGIN");
        try {
          const results = [];
          for (const c of commands) results.push(await c.run());
          sql.exec("COMMIT");
          return results;
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
      },
    },
  };
}
