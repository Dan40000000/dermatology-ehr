import { runMigrations } from "./db/migrate";
import { runSeed } from "./db/seed";

async function startup() {
  console.log("=== Database Initialization ===");

  try {
    console.log("Running database migrations...");
    await runMigrations();
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration error (may already be applied):", (err as Error).message);
  }

  try {
    console.log("Running database seed...");
    await runSeed();
    console.log("Seed complete.");
  } catch (err) {
    console.error("Seed error (may already be applied):", (err as Error).message);
  }

  console.log("=== Starting Server ===");
  // Import server after DB is ready
  require("./index");
}

startup().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
