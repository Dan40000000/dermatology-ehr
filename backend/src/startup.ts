// Simple startup - run migrations for deploys, then start the server.
console.log("=== Starting Server ===");

// Log environment for debugging
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("PORT:", process.env.PORT);
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

function shouldRunMigrationsOnStartup(): boolean {
  if (String(process.env.RUN_MIGRATIONS_ON_STARTUP || "").toLowerCase() === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT);
}

async function start() {
  console.log("Loading index.ts...");
  if (shouldRunMigrationsOnStartup()) {
    console.log("Running startup database migrations...");
    const { runMigrations } = require("./db/migrate");
    await runMigrations();
    console.log("Startup database migrations complete");
  }
  require("./index");
  console.log("Index loaded successfully");
}

start().catch((error) => {
  console.error("STARTUP ERROR:", error);
  process.exit(1);
});
