// Simple startup - just start the server
// Migrations and seed are triggered via /health/init-db endpoint
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

try {
  console.log("Loading index.ts...");
  require("./index");
  console.log("Index loaded successfully");
} catch (error) {
  console.error("STARTUP ERROR:", error);
  process.exit(1);
}
