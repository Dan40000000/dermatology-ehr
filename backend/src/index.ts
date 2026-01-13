import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middleware/security";
import { sanitizeInputs } from "./middleware/sanitization";
import { apiLimiter, authLimiter, portalLimiter, uploadLimiter } from "./middleware/rateLimiter";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { patientsRouter } from "./routes/patients";
import { appointmentsRouter } from "./routes/appointments";
import { providersRouter } from "./routes/providers";
import { locationsRouter } from "./routes/locations";
import { appointmentTypesRouter } from "./routes/appointmentTypes";
import { availabilityRouter } from "./routes/availability";
import { auditRouter } from "./routes/audit";
import { encountersRouter } from "./routes/encounters";
import { documentsRouter } from "./routes/documents";
import { photosRouter } from "./routes/photos";
import { chargesRouter } from "./routes/charges";
import { diagnosesRouter } from "./routes/diagnoses";
import { tasksRouter } from "./routes/tasks";
import { messagesRouter } from "./routes/messages";
import { fhirRouter } from "./routes/fhir";
import { analyticsRouter } from "./routes/analytics";
import { hl7Router } from "./routes/hl7";
import { vitalsRouter } from "./routes/vitals";
import { uploadRouter } from "./routes/upload";
import { vitalsWriteRouter } from "./routes/vitalsWrite";
import { templatesRouter } from "./routes/templates";
import { ordersRouter } from "./routes/orders";
import { interopRouter } from "./routes/interop";
import { reportsRouter } from "./routes/reports";
import { fhirPayloadRouter } from "./routes/fhirPayload";
import { presignRouter } from "./routes/presign";
import { serveUploadsRouter } from "./routes/serveUploads";
import feeSchedulesRouter from "./routes/feeSchedules";
import { cptCodesRouter } from "./routes/cptCodes";
import { icd10CodesRouter } from "./routes/icd10Codes";
import { claimsRouter } from "./routes/claims";
import { adaptiveLearningRouter } from "./routes/adaptiveLearning";
import { noteTemplatesRouter } from "./routes/noteTemplates";
import { messagingRouter } from "./routes/messaging";
import { recallsRouter } from "./routes/recalls";
import { prescriptionsRouter } from "./routes/prescriptions";
import { medicationsRouter } from "./routes/medications";
import { pharmaciesRouter } from "./routes/pharmacies";
import { rxHistoryRouter } from "./routes/rxHistory";
import { kioskRouter } from "./routes/kiosk";
import { consentFormsRouter } from "./routes/consentForms";
import { patientPortalRouter } from "./routes/patientPortal";
import { patientPortalDataRouter } from "./routes/patientPortalData";
import { visitSummariesRouter } from "./routes/visitSummaries";
import { patientMessagesRouter } from "./routes/patientMessages";
import { patientPortalMessagesRouter } from "./routes/patientPortalMessages";
import { cannedResponsesRouter } from "./routes/cannedResponses";
import { patientSchedulingRouter, providerSchedulingRouter } from "./routes/patientScheduling";
import { bodyDiagramRouter } from "./routes/bodyDiagram";
import { smsRouter } from "./routes/sms";
import priorAuthRouter from "./routes/priorAuth";
import timeBlocksRouter from "./routes/timeBlocks";
import waitlistRouter from "./routes/waitlist";
import handoutsRouter from "./routes/handouts";
import aiAnalysisRouter from "./routes/aiAnalysis";
import lesionsRouter from "./routes/lesions";
import aiNoteDraftingRouter from "./routes/aiNoteDrafting";
import voiceTranscriptionRouter from "./routes/voiceTranscription";
import cdsRouter from "./routes/cds";
import { faxRouter } from "./routes/fax";
import { notesRouter } from "./routes/notes";
import { directMessagingRouter } from "./routes/directMessaging";
import { clearinghouseRouter } from "./routes/clearinghouse";
import { qualityMeasuresRouter } from "./routes/qualityMeasures";
import { referralsRouter } from "./routes/referrals";
import { registryRouter } from "./routes/registry";
// import telehealthRouter from "./routes/telehealth"; // TEMPORARILY DISABLED - needs bug fixes
import { portalBillingRouter } from "./routes/portalBilling";
import { portalIntakeRouter } from "./routes/portalIntake";
import { labOrdersRouter } from "./routes/labOrders";
import { labResultsRouter } from "./routes/labResults";
import { labVendorsRouter } from "./routes/labVendors";
import { dermPathRouter } from "./routes/dermPath";
import ambientScribeRouter from "./routes/ambientScribe";
import priorAuthRequestsRouter from "./routes/priorAuthRequests";
import { erxRouter } from "./routes/erx";
import adminRouter from "./routes/admin";
import { aiAgentConfigsRouter } from "./routes/aiAgentConfigs";
import { inventoryRouter } from "./routes/inventory";
import { inventoryUsageRouter } from "./routes/inventoryUsage";
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

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

app.use("/health", healthRouter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/providers", providersRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/appointment-types", appointmentTypesRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/audit", auditRouter);
app.use("/api/encounters", encountersRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/photos", photosRouter);
app.use("/api/charges", chargesRouter);
app.use("/api/diagnoses", diagnosesRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/fhir", fhirRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/hl7", hl7Router);
app.use("/api/vitals", vitalsRouter);
app.use("/api/vitals/write", vitalsWriteRouter);
app.use("/api/upload", uploadLimiter, uploadRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/interop", interopRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/interop/fhir-payloads", fhirPayloadRouter);
app.use("/api/presign", presignRouter);
app.use("/api/uploads", serveUploadsRouter);
app.use("/api/fee-schedules", feeSchedulesRouter);
app.use("/api/cpt-codes", cptCodesRouter);
app.use("/api/icd10-codes", icd10CodesRouter);
app.use("/api/claims", claimsRouter);
app.use("/api/adaptive", adaptiveLearningRouter);
app.use("/api/note-templates", noteTemplatesRouter);
app.use("/api/messaging", messagingRouter);
app.use("/api/recalls", recallsRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/medications", medicationsRouter);
app.use("/api/pharmacies", pharmaciesRouter);
app.use("/api/rx-history", rxHistoryRouter);
app.use("/api/erx", erxRouter);
app.use("/api/admin", adminRouter);
app.use("/api/prior-auth", priorAuthRouter);
app.use("/api/time-blocks", timeBlocksRouter);
app.use("/api/waitlist", waitlistRouter);
app.use("/api/handouts", handoutsRouter);
app.use("/api/kiosk", kioskRouter);
app.use("/api/consent-forms", consentFormsRouter);
app.use("/api/patient-portal", portalLimiter, patientPortalRouter);
app.use("/api/patient-portal-data", portalLimiter, patientPortalDataRouter);
app.use("/api/visit-summaries", visitSummariesRouter);
app.use("/api/patient-messages", patientMessagesRouter);
app.use("/api/patient-portal/messages", patientPortalMessagesRouter);
app.use("/api/canned-responses", cannedResponsesRouter);
app.use("/api/patient-portal/scheduling", portalLimiter, patientSchedulingRouter);
app.use("/api/patient-portal/billing", portalLimiter, portalBillingRouter);
app.use("/api/patient-portal/intake", portalLimiter, portalIntakeRouter);
app.use("/api/scheduling", apiLimiter, providerSchedulingRouter);
app.use("/api/body-diagram", bodyDiagramRouter);
app.use("/api/sms", smsRouter);
app.use("/api/ai-analysis", aiAnalysisRouter);
app.use("/api/lesions", lesionsRouter);
app.use("/api/ai-notes", aiNoteDraftingRouter);
app.use("/api/voice", voiceTranscriptionRouter);
app.use("/api/cds", cdsRouter);
app.use("/api/fax", faxRouter);
app.use("/api/notes", notesRouter);
app.use("/api/direct", directMessagingRouter);
app.use("/api/clearinghouse", clearinghouseRouter);
app.use("/api/quality", qualityMeasuresRouter);
app.use("/api/referrals", referralsRouter);
app.use("/api/registry", registryRouter);
// app.use("/api/telehealth", telehealthRouter); // TEMPORARILY DISABLED - needs bug fixes
app.use("/api/lab-orders", labOrdersRouter);
app.use("/api/lab-results", labResultsRouter);
app.use("/api/lab-vendors", labVendorsRouter);
app.use("/api/dermpath", dermPathRouter);
app.use("/api/ambient", ambientScribeRouter);
app.use("/api/prior-auth-requests", priorAuthRequestsRouter);
app.use("/api/ai-agent-configs", aiAgentConfigsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/inventory-usage", inventoryUsageRouter);

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

app.listen(env.port, () => {
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
