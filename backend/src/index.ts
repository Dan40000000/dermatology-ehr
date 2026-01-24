import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { swaggerSpec } from "./config/swagger";
import { securityHeaders } from "./middleware/security";
import { sanitizeInputs } from "./middleware/sanitization";
import { initializeWebSocket } from "./websocket";
import { registerRoutes } from "./routes/registerRoutes";
import path from "path";
import fs from "fs";
import { waitlistAutoFillService } from "./services/waitlistAutoFillService";

const app = express();

// Trust proxy for Railway/cloud deployments (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware (apply early in the chain)
app.use(securityHeaders);
app.use(cookieParser());
app.use(sanitizeInputs);

// CORS configuration - support multiple dev ports
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/:\d+$/, '')))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', env.tenantHeader],
}));

// Body parsing
app.use(express.json({ limit: "10mb" })); // Increased limit for base64 images
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Setup upload directory
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
// File serving is handled via signed routes (see serveUploadsRouter).

// Request logging middleware
app.use((req, _res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Swagger API Documentation
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Dermatology EHR API Documentation",
  customCss: '.swagger-ui .topbar { display: none }',
}));

// Serve OpenAPI JSON spec
app.get("/api/openapi.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

registerRoutes(app);

// Frontend is served by separate derm-frontend service on Railway
// No need for backend to serve static files in production

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(err.status || 500).json({ error: message });
});

// Create HTTP server (required for Socket.IO)
const httpServer = http.createServer(app);

// Initialize WebSocket server
initializeWebSocket(httpServer);

httpServer.listen(env.port, () => {
  logger.info(`API server started on port ${env.port}`, {
    nodeEnv: process.env.NODE_ENV,
    port: env.port,
  });

  // Start waitlist hold expiration worker (runs every 15 minutes)
  waitlistAutoFillService.startExpirationWorker(15).then(() => {
    logger.info('Waitlist hold expiration worker started');
  }).catch((error: any) => {
    logger.error('Failed to start waitlist hold expiration worker', {
      error: error.message,
    });
  });
});
