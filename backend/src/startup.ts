// Simple startup - just start the server
// Migrations and seed are triggered via /health/init-db endpoint
console.log("=== Starting Server ===");
require("./index");
