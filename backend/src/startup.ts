import { runMigrations } from "./db/migrate";
import { runSeed } from "./db/seed";

async function startup() {
  console.log("=== Starting Server First (for health checks) ===");

  // Start server FIRST so health checks pass while DB initializes
  require("./index");

  // Give server a moment to bind to port
  await new Promise(resolve => setTimeout(resolve, 1000));

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

  console.log("=== Startup Complete ===");
}

startup().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
