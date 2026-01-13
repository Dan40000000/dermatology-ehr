import { execSync } from "child_process";

async function startup() {
  console.log("Running database migrations...");
  try {
    // Run migrations
    execSync("node dist/db/migrate.js", { stdio: "inherit" });
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    // Don't exit - migrations might already be applied
  }

  console.log("Running database seed...");
  try {
    // Run seed
    execSync("node dist/db/seed.js", { stdio: "inherit" });
    console.log("Seed complete.");
  } catch (err) {
    console.error("Seed failed:", err);
    // Don't exit - seed might already be applied
  }

  console.log("Starting server...");
  // Import and run the main server
  require("./index");
}

startup();
