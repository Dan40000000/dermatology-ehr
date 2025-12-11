import { Pool } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected PG error", err);
});
