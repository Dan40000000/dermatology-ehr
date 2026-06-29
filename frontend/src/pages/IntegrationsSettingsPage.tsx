import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  FileCheck2,
  FlaskConical,
  Info,
  KeyRound,
  MessageSquareText,
  Pill,
  RefreshCw,
  ReceiptText,
  Send,
  ShieldCheck,
  Stethoscope,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../utils/apiBase";
import "./IntegrationsSettingsPage.css";

const API_URL = API_BASE_URL;

interface Integration {
  id: string;
  type: "slack" | "teams";
  webhook_url: string;
  channel_name?: string;
  enabled: boolean;
  notification_types: string[];
  created_at: string;
  updated_at: string;
  stats?: {
    total_notifications: string;
    successful_notifications: string;
    failed_notifications: string;
  };
}

interface NotificationLog {
  id: string;
  integration_id: string;
  integration_type: string;
  channel_name?: string;
  notification_type: string;
  success: boolean;
  error_message?: string;
  sent_at: string;
}

type ExternalIntegrationType =
  | "clearinghouse"
  | "eligibility"
  | "eprescribe"
  | "lab"
  | "payment"
  | "fax"
  | "ambient_transcription";

interface ExternalIntegrationStatus {
  type: ExternalIntegrationType;
  provider: string;
  isConfigured: boolean;
  isActive: boolean;
  lastSyncAt?: string;
  syncFrequencyMinutes?: number;
  connectionStatus: "connected" | "disconnected" | "error" | "unknown";
  lastError?: string;
}

interface ExternalIntegrationForm {
  provider: string;
  configJson: string;
  credentialsJson: string;
  isActive: boolean;
  syncFrequencyMinutes: string;
}

interface ExternalIntegrationLog {
  id: string;
  integration_type: ExternalIntegrationType;
  provider: string;
  direction: "inbound" | "outbound";
  endpoint: string;
  method: string;
  status: "success" | "error" | "warning";
  status_code?: number;
  error_message?: string;
  duration_ms?: number;
  created_at: string;
}

interface ExternalIntegrationStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDurationMs: number;
  callsByType: Record<string, number>;
  errorsByType: Record<string, number>;
}

interface StripeConnectStatus {
  mode: "mock" | "test" | "live" | "unknown";
  platformConfigured: boolean;
  publishableKey?: string;
  connectedAccountId?: string;
  accountType?: string;
  onboardingStatus:
    | "not_started"
    | "pending"
    | "complete"
    | "restricted"
    | "mock";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  destinationChargesEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason?: string | null;
  lastSyncedAt?: string | null;
  subscription: {
    status:
      | "not_started"
      | "checkout_started"
      | "active"
      | "trialing"
      | "past_due"
      | "canceled"
      | "unpaid"
      | "mock";
    customerId?: string;
    subscriptionId?: string;
    priceId?: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    checkoutSessionId?: string;
  };
}

type IntegrationsTab = "notifications" | "external" | "logs";

const notificationTypeLabels: Record<string, string> = {
  appointment_booked: "Appointment Booked",
  appointment_cancelled: "Appointment Cancelled",
  patient_checked_in: "Patient Checked In",
  prior_auth_approved: "Prior Auth Approved",
  prior_auth_denied: "Prior Auth Denied",
  lab_results_ready: "Lab Results Ready",
  urgent_message: "Urgent Message Received",
  daily_schedule_summary: "Daily Schedule Summary",
  end_of_day_report: "End of Day Report",
};

const allNotificationTypes = Object.keys(notificationTypeLabels);

const externalTypeOrder: ExternalIntegrationType[] = [
  "payment",
  "clearinghouse",
  "eligibility",
  "eprescribe",
  "lab",
  "ambient_transcription",
  "fax",
];

const externalTypeLabels: Record<ExternalIntegrationType, string> = {
  clearinghouse: "Claims Clearinghouse",
  eligibility: "Eligibility",
  eprescribe: "E-Prescribing",
  lab: "Labs",
  ambient_transcription: "AI Scribe Transcription",
  payment: "Payments",
  fax: "Fax",
};

const defaultExternalProviders: Record<ExternalIntegrationType, string> = {
  clearinghouse: "stedi",
  eligibility: "stedi",
  eprescribe: "surescripts",
  lab: "labcorp",
  ambient_transcription: "abridge",
  payment: "stripe",
  fax: "phaxio",
};

const externalProviderOptions: Partial<
  Record<ExternalIntegrationType, Array<{ value: string; label: string }>>
> = {
  clearinghouse: [
    { value: "stedi", label: "Stedi" },
    { value: "change_healthcare", label: "Change Healthcare" },
    { value: "availity", label: "Availity" },
    { value: "trizetto", label: "Trizetto" },
    { value: "waystar", label: "Waystar" },
    { value: "custom", label: "Custom" },
  ],
  eligibility: [
    { value: "stedi", label: "Stedi" },
    { value: "availity", label: "Availity" },
    { value: "custom", label: "Custom" },
  ],
};

type AmbientProvider = "abridge" | "nabla" | "aws_healthscribe" | "wispr_flow";

const ambientProviderOptions: Array<{ value: AmbientProvider; label: string }> =
  [
    { value: "abridge", label: "Abridge" },
    { value: "nabla", label: "Nabla" },
    { value: "aws_healthscribe", label: "AWS HealthScribe" },
    { value: "wispr_flow", label: "Wispr Flow" },
  ];

const ambientDocsLinks: Record<AmbientProvider, string> = {
  abridge:
    "https://support.abridge.com/hc/en-us/articles/30287281533715-Get-Started-Using-Abridge",
  nabla: "https://docs.nabla.com/next/guides/intro",
  aws_healthscribe:
    "https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html",
  wispr_flow: "https://api-docs.wisprflow.ai/rest_api_quickstart",
};

const normalizeAmbientProvider = (provider?: string): AmbientProvider => {
  const normalized = String(provider || "")
    .trim()
    .toLowerCase();
  if (normalized === "nabla") return "nabla";
  if (
    normalized === "aws" ||
    normalized === "aws_healthscribe" ||
    normalized === "healthscribe"
  ) {
    return "aws_healthscribe";
  }
  if (normalized === "wispr" || normalized === "wispr_flow")
    return "wispr_flow";
  return "abridge";
};

const buildAmbientConfigTemplate = (
  provider: AmbientProvider,
): Record<string, unknown> => {
  switch (provider) {
    case "nabla":
      return {
        baseUrl: "https://us.api.nabla.com",
        tokenPath: "/oauth/token",
        transcribePath: "/v1/core/server/transcribe",
        apiVersion: "2025-05-21",
        requestParameters: {
          speech_locale: "ENGLISH_US",
          split_by_sentence: true,
        },
        responseSegmentsPath: "transcript",
        segmentTextField: "text",
        segmentSpeakerField: "speaker",
        segmentStartField: "start_offset_ms",
        segmentEndField: "end_offset_ms",
        segmentTimeUnit: "milliseconds",
        extraFields: {},
        enableLiveChunks: true,
        environment: "production",
      };
    case "aws_healthscribe":
      return {
        region: "us-east-1",
        inputBucket: "",
        outputBucket: "",
        dataAccessRoleArn: "",
        inputPrefix: "healthscribe/input",
        outputPrefix: "healthscribe/output",
        noteTemplate: "PHYSICAL_SOAP",
        showSpeakerLabels: true,
        maxSpeakerLabels: 2,
        pollIntervalMs: 5000,
        timeoutMs: 300000,
        responseSegmentsPath: "Conversation.TranscriptSegments",
        segmentTextField: "Content",
        segmentSpeakerField: "ParticipantRole",
        segmentStartField: "BeginOffsetMillis",
        segmentEndField: "EndOffsetMillis",
        segmentTimeUnit: "milliseconds",
        enableLiveChunks: false,
        environment: "production",
      };
    case "wispr_flow":
      return {
        baseUrl: "https://api.wisprflow.ai",
        transcribePath: "/api/v1/voice-dictation/transcribe",
        language: "en",
        fileFieldName: "file",
        languageFieldName: "language",
        workflowId: "",
        workflowIdFieldName: "workflowId",
        translateTo: "",
        translateToFieldName: "translate_to",
        responseTextPath: "text",
        responseSegmentsPath: "segments",
        segmentTextField: "text",
        segmentSpeakerField: "speaker",
        segmentStartField: "start",
        segmentEndField: "end",
        segmentConfidenceField: "confidence",
        extraFields: {},
        enableLiveChunks: true,
        environment: "production",
      };
    case "abridge":
    default:
      return {
        baseUrl: "https://api.abridge.com",
        transcribePath: "/v1/transcriptions",
        language: "en",
        fileFieldName: "file",
        languageFieldName: "language",
        workflowId: "",
        workflowIdFieldName: "workflowId",
        translateTo: "",
        translateToFieldName: "translate_to",
        responseTextPath: "text",
        responseSegmentsPath: "segments",
        segmentTextField: "text",
        segmentSpeakerField: "speaker",
        segmentStartField: "start",
        segmentEndField: "end",
        segmentConfidenceField: "confidence",
        extraFields: {},
        enableLiveChunks: true,
        environment: "production",
      };
  }
};

const buildAmbientCredentialsTemplate = (
  provider: AmbientProvider,
): Record<string, unknown> => {
  switch (provider) {
    case "nabla":
      return {
        clientId: "",
        privateKeyPem: "",
        keyId: "",
      };
    case "aws_healthscribe":
      return {
        accessKeyId: "",
        secretAccessKey: "",
        sessionToken: "",
      };
    case "wispr_flow":
    case "abridge":
    default:
      return {
        apiKey: "",
      };
  }
};

const buildDefaultConfigTemplate = (
  type: ExternalIntegrationType,
  provider?: string,
): Record<string, unknown> => {
  const normalizedProvider = String(
    provider || defaultExternalProviders[type] || "",
  )
    .trim()
    .toLowerCase();

  switch (type) {
    case "clearinghouse":
      if (normalizedProvider === "stedi") {
        return {
          baseUrl: "https://healthcare.us.stedi.com/2024-04-01",
          professionalClaimsPath:
            "/change/medicalnetwork/professionalclaims/v3",
          claimStatusPath: "/change/medicalnetwork/claim/status/v3",
          eraReportPath: "/reports/835",
          environment: "mock",
          notes:
            "Claims remain in internal mock mode until Stedi production claim enrollment and 837P mapping are enabled.",
        };
      }
      return {};
    case "eligibility":
      if (normalizedProvider === "stedi") {
        return {
          baseUrl: "https://healthcare.us.stedi.com/2024-04-01",
          eligibilityPath: "/change/medicalnetwork/eligibility/v3",
          environment: "test",
          defaultServiceType: "30",
          amountUnit: "dollars",
          useApprovedMockRequestForEligibility: true,
          mapTestResponseToRequestedPatient: true,
          provider: {
            organizationName: "Dermatology Test Clinic",
            npi: "1999999984",
          },
          testRequest: {
            encounter: {
              serviceTypeCodes: ["30"],
            },
            externalPatientId: "STEDI-TEST-PATIENT",
            provider: {
              npi: "1999999984",
              organizationName: "Provider Name",
            },
            subscriber: {
              firstName: "John",
              lastName: "Doe",
              memberId: "AETNA9wcSu",
            },
            dependents: [
              {
                firstName: "Jordan",
                lastName: "Doe",
                dateOfBirth: "20010714",
              },
            ],
            tradingPartnerServiceId: "60054",
          },
        };
      }

      return {
        baseUrl: "https://api.availity.com",
        tokenPath: "/v1/token",
        coveragesPath: "/v1/coverages",
        tokenAuthMethod: "client_secret_post",
        scope:
          "healthcare-hipaa-transactions-demo-demo healthcare-hipaa-transactions-demo",
        amountUnit: "dollars",
        environment: "production",
        defaultServiceType: "30",
      };
    case "ambient_transcription":
      return buildAmbientConfigTemplate(normalizeAmbientProvider(provider));
    default:
      return {};
  }
};

const buildDefaultCredentialsTemplate = (
  type: ExternalIntegrationType,
  provider?: string,
): Record<string, unknown> => {
  const normalizedProvider = String(
    provider || defaultExternalProviders[type] || "",
  )
    .trim()
    .toLowerCase();

  switch (type) {
    case "clearinghouse":
      if (normalizedProvider === "stedi") {
        return {
          apiKey: "",
        };
      }
      return {};
    case "eligibility":
      if (normalizedProvider === "stedi") {
        return {
          apiKey: "",
        };
      }

      return {
        clientId: "",
        clientSecret: "",
      };
    case "ambient_transcription":
      return buildAmbientCredentialsTemplate(
        normalizeAmbientProvider(provider),
      );
    default:
      return {};
  }
};

const getAmbientSetupCopy = (
  provider: AmbientProvider,
): { title: string; body: string[] } => {
  switch (provider) {
    case "nabla":
      return {
        title: "Nabla setup",
        body: [
          "This powers the ambient transcription layer. The separate in-chart AI Assistant/chat layer uses OpenAI.",
          "Nabla uses server-side OAuth credentials, not a simple static API key. Load the Nabla template, then fill in clientId and privateKeyPem or paste a server access token if Nabla issued one.",
          "The default path uses Nabla's synchronous server transcription endpoint. Live chunk updates stay enabled because the app can post short browser-recorded chunks as files.",
        ],
      };
    case "aws_healthscribe":
      return {
        title: "AWS HealthScribe setup",
        body: [
          "This powers the ambient transcription layer. The separate in-chart AI Assistant/chat layer uses OpenAI.",
          "AWS HealthScribe is an S3 + IAM job workflow. You need region, input/output buckets, and a data access role ARN before live testing will work.",
          "The app uses AWS HealthScribe for recorded encounter uploads. Live chunk updates fall back to OpenAI because HealthScribe is not wired into the browser chunk path here.",
        ],
      };
    case "wispr_flow":
      return {
        title: "Wispr Flow setup",
        body: [
          "This powers the ambient transcription layer. The separate in-chart AI Assistant/chat layer uses OpenAI.",
          "The backend records audio locally in-browser, then posts a multipart upload to the configured Wispr endpoint.",
          "If Wispr gives you different request or response field names, update the config JSON here rather than changing code.",
        ],
      };
    case "abridge":
    default:
      return {
        title: "Abridge setup",
        body: [
          "This powers the ambient transcription layer. The separate in-chart AI Assistant/chat layer uses OpenAI.",
          "The backend records audio locally in-browser, then posts a multipart upload to the configured Abridge endpoint. If your Abridge team gives you different request or response field names, update the config JSON here rather than changing code.",
          "If you only have Abridge product access and not partner/API credentials yet, keep this integration in demo/mock mode until Abridge provides the endpoint details and API key.",
        ],
      };
  }
};

const getExternalDocsLink = (
  type: ExternalIntegrationType,
  provider?: string,
): string | undefined => {
  const normalizedProvider = String(provider || "")
    .trim()
    .toLowerCase();

  if (type === "eligibility" && normalizedProvider === "stedi") {
    return "https://www.stedi.com/docs/healthcare/api-reference/post-healthcare-eligibility";
  }

  if (type === "clearinghouse" && normalizedProvider === "stedi") {
    return "https://www.stedi.com/docs/healthcare/api-reference";
  }

  if (type === "eligibility") {
    return "https://developer.availity.com/blog/2025/3/25/hipaa-transactions";
  }

  if (type === "ambient_transcription") {
    return undefined;
  }

  return undefined;
};

const getEligibilitySetupCopy = (
  provider?: string,
): { title: string; body: string[] } => {
  const normalizedProvider = String(provider || "")
    .trim()
    .toLowerCase();

  if (normalizedProvider === "stedi") {
    return {
      title: "Stedi test-mode setup",
      body: [
        "Create a Stedi test API key in the Stedi portal and paste it into credentials.apiKey.",
        "The connection test sends Stedi's approved mock eligibility request, so it can validate the key without sending real patient data to a payer.",
        "In test mode, patient eligibility checks also use an approved Stedi mock request and map the returned benefits onto the requested patient so the office workflow can be tested safely.",
        "For real office eligibility checks, keep the same adapter and switch the Stedi key/config to production only after payer enrollment is complete.",
      ],
    };
  }

  return {
    title: "Availity setup",
    body: [
      "Use your Availity client credentials here. The app will exchange them for an OAuth token and run live coverages checks through the configured endpoint.",
      "Keep amountUnit set to dollars unless your Availity payload is already returning cents.",
    ],
  };
};

const getClearinghouseSetupCopy = (
  provider?: string,
): { title: string; body: string[] } | null => {
  const normalizedProvider = String(provider || "")
    .trim()
    .toLowerCase();

  if (normalizedProvider !== "stedi") {
    return null;
  }

  return {
    title: "Stedi claims setup",
    body: [
      "Stedi is selected as the clearinghouse vendor, but claim submission stays in internal mock mode here until production payer enrollment and the 837P JSON mapping are turned on.",
      "Use eligibility first; it is the fastest test-mode connection to validate the account and payer workflow.",
    ],
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const parseError = (err: unknown, fallback: string): string => {
  const response = isRecord(err) ? err.response : undefined;
  const payload =
    isRecord(response) && isRecord(response.data) ? response.data : undefined;
  const errorPayload = payload?.error;

  if (typeof errorPayload === "string") {
    return errorPayload;
  }

  if (Array.isArray(errorPayload)) {
    const messages = errorPayload
      .map((issue: unknown) => {
        if (typeof issue === "string") return issue;
        if (isRecord(issue) && typeof issue.message === "string") {
          return issue.message;
        }
        return "";
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(", ");
    }
  }

  if (isRecord(err) && typeof err.message === "string" && err.message) {
    return err.message;
  }

  return fallback;
};

const seedExternalStatus = (
  type: ExternalIntegrationType,
  partial?: Partial<ExternalIntegrationStatus>,
): ExternalIntegrationStatus => ({
  type,
  provider: partial?.provider || defaultExternalProviders[type],
  isConfigured: Boolean(partial?.isConfigured),
  isActive: Boolean(partial?.isActive),
  lastSyncAt: partial?.lastSyncAt,
  syncFrequencyMinutes: partial?.syncFrequencyMinutes,
  connectionStatus: partial?.connectionStatus || "disconnected",
  lastError: partial?.lastError,
});

const buildDefaultExternalForms = (): Record<
  ExternalIntegrationType,
  ExternalIntegrationForm
> => ({
  clearinghouse: {
    provider: defaultExternalProviders.clearinghouse,
    configJson: JSON.stringify(
      buildDefaultConfigTemplate("clearinghouse"),
      null,
      2,
    ),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("clearinghouse"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  eligibility: {
    provider: defaultExternalProviders.eligibility,
    configJson: JSON.stringify(
      buildDefaultConfigTemplate("eligibility"),
      null,
      2,
    ),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("eligibility"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  eprescribe: {
    provider: defaultExternalProviders.eprescribe,
    configJson: JSON.stringify(
      buildDefaultConfigTemplate("eprescribe"),
      null,
      2,
    ),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("eprescribe"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  lab: {
    provider: defaultExternalProviders.lab,
    configJson: JSON.stringify(buildDefaultConfigTemplate("lab"), null, 2),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("lab"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  ambient_transcription: {
    provider: defaultExternalProviders.ambient_transcription,
    configJson: JSON.stringify(
      buildDefaultConfigTemplate("ambient_transcription"),
      null,
      2,
    ),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("ambient_transcription"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  payment: {
    provider: defaultExternalProviders.payment,
    configJson: JSON.stringify(buildDefaultConfigTemplate("payment"), null, 2),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("payment"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  fax: {
    provider: defaultExternalProviders.fax,
    configJson: JSON.stringify(buildDefaultConfigTemplate("fax"), null, 2),
    credentialsJson: JSON.stringify(
      buildDefaultCredentialsTemplate("fax"),
      null,
      2,
    ),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
});

const parseJsonObject = (label: string, raw: string): Record<string, unknown> => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed as Record<string, unknown>;
};

const parseSyncFrequencyMinutes = (raw: string): number | null => {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 5 || parsed > 1440) {
    return null;
  }
  return parsed;
};

type Tone = "good" | "warning" | "danger" | "neutral" | "info";

const toneClasses: Record<Tone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const softIconClasses: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-100 text-sky-700",
};

const externalTypeIcons: Record<ExternalIntegrationType, LucideIcon> = {
  payment: CreditCard,
  clearinghouse: FileCheck2,
  eligibility: ShieldCheck,
  eprescribe: Pill,
  lab: FlaskConical,
  ambient_transcription: Stethoscope,
  fax: Send,
};

const externalTypeDescriptions: Record<ExternalIntegrationType, string> = {
  payment:
    "Stripe platform keys, practice payout onboarding, subscriptions, patient checkout, store orders, and refunds.",
  clearinghouse:
    "Claim release, EDI submission, scrub status, acknowledgements, and payer responses.",
  eligibility:
    "Live or demo insurance checks before visits, procedures, prescriptions, and patient estimates.",
  eprescribe:
    "Electronic prescriptions and refill workflows once the vendor account is approved.",
  lab: "Electronic lab and pathology orders, inbound results, and provider review routing.",
  ambient_transcription:
    "AI visit transcription that turns encounter audio into structured clinical notes.",
  fax: "Inbound and outbound fax routing for referrals, authorizations, records, and outside documents.",
};

const externalTypeInstructions: Record<ExternalIntegrationType, string[]> = {
  payment: [
    "Paste the Stripe platform keys or use mock mode for demos.",
    "Start the office subscription if this practice should be billed.",
    "Connect the practice payout account so patient and store payments route correctly.",
    "Run Test Payments and check the logs before using live cards.",
  ],
  clearinghouse: [
    "Select the clearinghouse vendor.",
    "Paste the vendor credentials and payer routing settings.",
    "Save, test the connection, then run sync before releasing claims.",
  ],
  eligibility: [
    "Select the eligibility vendor.",
    "Paste the API credentials and payer endpoint settings.",
    "Save and test before relying on insurance checks at check-in.",
  ],
  eprescribe: [
    "Enter the eRx vendor account details.",
    "Keep it inactive until provider identity proofing and pharmacy routing are approved.",
    "Test before allowing live prescriptions.",
  ],
  lab: [
    "Enter the lab or pathology vendor details.",
    "Confirm order codes, result routing, and provider review queues.",
    "Test before sending electronic orders.",
  ],
  ambient_transcription: [
    "Pick the transcription vendor.",
    "Paste the API key and endpoint settings.",
    "Test with demo audio before enabling it during visits.",
  ],
  fax: [
    "Enter the fax vendor credentials and assigned fax number.",
    "Test outbound fax first, then confirm inbound routing.",
    "Keep logs open while testing delivery failures.",
  ],
};

const formatStatusLabel = (value?: string | null) =>
  value ? value.replace(/_/g, " ") : "not started";

const toneForConnection = (
  status: ExternalIntegrationStatus["connectionStatus"],
): Tone => {
  if (status === "connected") return "good";
  if (status === "error") return "danger";
  if (status === "unknown") return "warning";
  return "neutral";
};

const stripeSubscriptionReady = (status: StripeConnectStatus | null) =>
  Boolean(
    status &&
      ["active", "trialing", "mock"].includes(status.subscription.status),
  );

const stripePayoutReady = (status: StripeConnectStatus | null) =>
  Boolean(status && ["complete", "mock"].includes(status.onboardingStatus));

const stripeRoutingReady = (status: StripeConnectStatus | null) =>
  Boolean(
    status && (status.destinationChargesEnabled || status.mode === "mock"),
  );

function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const { headers } = useAuth();
  const authConfig = { headers, withCredentials: true };
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<IntegrationsTab>("external");

  // Slack setup
  const [showSlackSetup, setShowSlackSetup] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [slackNotifications, setSlackNotifications] = useState<string[]>([]);

  // Teams setup
  const [showTeamsSetup, setShowTeamsSetup] = useState(false);
  const [teamsWebhook, setTeamsWebhook] = useState("");
  const [teamsChannel, setTeamsChannel] = useState("");
  const [teamsNotifications, setTeamsNotifications] = useState<string[]>([]);

  // External integrations
  const [externalIntegrations, setExternalIntegrations] = useState<
    ExternalIntegrationStatus[]
  >(externalTypeOrder.map((type) => seedExternalStatus(type)));
  const [externalForms, setExternalForms] = useState<
    Record<ExternalIntegrationType, ExternalIntegrationForm>
  >(buildDefaultExternalForms());
  const [externalLogs, setExternalLogs] = useState<ExternalIntegrationLog[]>(
    [],
  );
  const [externalStats, setExternalStats] =
    useState<ExternalIntegrationStats | null>(null);
  const [stripeConnectStatus, setStripeConnectStatus] =
    useState<StripeConnectStatus | null>(null);

  // UI state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingExternalType, setSavingExternalType] =
    useState<ExternalIntegrationType | null>(null);
  const [testingExternalType, setTestingExternalType] =
    useState<ExternalIntegrationType | null>(null);
  const [syncingExternalType, setSyncingExternalType] =
    useState<ExternalIntegrationType | null>(null);
  const [refreshingExternal, setRefreshingExternal] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [configuringStripe, setConfiguringStripe] = useState(false);
  const [enablingMockPayments, setEnablingMockPayments] = useState(false);
  const [startingStripeConnect, setStartingStripeConnect] = useState(false);
  const [refreshingStripeConnect, setRefreshingStripeConnect] = useState(false);
  const [startingStripeSubscription, setStartingStripeSubscription] =
    useState(false);
  const [refreshingStripeSubscription, setRefreshingStripeSubscription] =
    useState(false);

  const fetchIntegrations = async () => {
    const response = await axios.get(`${API_URL}/api/integrations`, authConfig);
    setIntegrations(response.data.integrations || []);
  };

  const fetchLogs = async () => {
    const response = await axios.get(
      `${API_URL}/api/integrations/logs?limit=20`,
      authConfig,
    );
    setLogs(response.data.logs || []);
  };

  const fetchExternalIntegrations = async () => {
    const response = await axios.get(
      `${API_URL}/api/external-integrations`,
      authConfig,
    );
    const payload = (response.data?.integrations || {}) as Partial<
      Record<ExternalIntegrationType, Partial<ExternalIntegrationStatus>>
    >;

    const mapped = externalTypeOrder.map((type) =>
      seedExternalStatus(type, {
        ...payload[type],
        type,
      }),
    );

    setExternalIntegrations(mapped);

    setExternalForms((prev) => {
      const next = { ...prev };
      for (const item of mapped) {
        const current = next[item.type];
        next[item.type] = {
          ...current,
          provider:
            current.provider ||
            item.provider ||
            defaultExternalProviders[item.type],
          isActive: item.isActive,
          syncFrequencyMinutes: item.syncFrequencyMinutes
            ? String(item.syncFrequencyMinutes)
            : current.syncFrequencyMinutes || "60",
        };
      }
      return next;
    });
  };

  const fetchExternalLogs = async () => {
    const response = await axios.get(
      `${API_URL}/api/external-integrations/logs?limit=20`,
      authConfig,
    );
    setExternalLogs(response.data.logs || []);
  };

  const fetchExternalStats = async () => {
    const response = await axios.get(
      `${API_URL}/api/external-integrations/stats?days=7`,
      authConfig,
    );
    setExternalStats(response.data.stats || null);
  };

  const fetchStripeConnectStatus = async () => {
    const response = await axios.get(
      `${API_URL}/api/external-integrations/payments/stripe/connect/status`,
      authConfig,
    );
    setStripeConnectStatus(response.data.status || null);
  };

  const refreshExternalData = async () => {
    setRefreshingExternal(true);
    try {
      await Promise.all([
        fetchExternalIntegrations(),
        fetchExternalLogs(),
        fetchExternalStats(),
        fetchStripeConnectStatus(),
      ]);
    } finally {
      setRefreshingExternal(false);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchIntegrations(),
          fetchLogs(),
          fetchExternalIntegrations(),
          fetchExternalLogs(),
          fetchExternalStats(),
          fetchStripeConnectStatus(),
        ]);
      } catch (err: unknown) {
        setError(parseError(err, "Failed to load integrations"));
      } finally {
        setLoading(false);
      }
    };

    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createSlackIntegration = async () => {
    if (!slackWebhook.startsWith("https://hooks.slack.com/")) {
      setError("Invalid Slack webhook URL");
      return;
    }

    if (slackNotifications.length === 0) {
      setError("Please select at least one notification type");
      return;
    }

    try {
      setError(null);
      await axios.post(
        `${API_URL}/api/integrations/slack`,
        {
          webhookUrl: slackWebhook,
          channelName: slackChannel,
          notificationTypes: slackNotifications,
        },
        authConfig,
      );
      setSuccess("Slack integration created successfully!");
      setShowSlackSetup(false);
      setSlackWebhook("");
      setSlackChannel("");
      setSlackNotifications([]);
      await fetchIntegrations();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to create Slack integration"));
    }
  };

  const createTeamsIntegration = async () => {
    if (!teamsWebhook.includes("webhook.office.com")) {
      setError("Invalid Microsoft Teams webhook URL");
      return;
    }

    if (teamsNotifications.length === 0) {
      setError("Please select at least one notification type");
      return;
    }

    try {
      setError(null);
      await axios.post(
        `${API_URL}/api/integrations/teams`,
        {
          webhookUrl: teamsWebhook,
          channelName: teamsChannel,
          notificationTypes: teamsNotifications,
        },
        authConfig,
      );
      setSuccess("Teams integration created successfully!");
      setShowTeamsSetup(false);
      setTeamsWebhook("");
      setTeamsChannel("");
      setTeamsNotifications([]);
      await fetchIntegrations();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to create Teams integration"));
    }
  };

  const testIntegration = async (integrationId: string) => {
    setTestingId(integrationId);
    setError(null);
    try {
      await axios.post(
        `${API_URL}/api/integrations/${integrationId}/test`,
        {},
        authConfig,
      );
      setSuccess("Test notification sent successfully!");
      await fetchLogs();
    } catch (err: unknown) {
      setError("Test failed: " + parseError(err, "Unknown error"));
    } finally {
      setTestingId(null);
    }
  };

  const toggleIntegration = async (integrationId: string, enabled: boolean) => {
    try {
      await axios.patch(
        `${API_URL}/api/integrations/${integrationId}`,
        { enabled: !enabled },
        authConfig,
      );
      await fetchIntegrations();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to toggle integration"));
    }
  };

  const deleteIntegration = async (integrationId: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) {
      return;
    }

    try {
      await axios.delete(
        `${API_URL}/api/integrations/${integrationId}`,
        authConfig,
      );
      setSuccess("Integration deleted successfully");
      await fetchIntegrations();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to delete integration"));
    }
  };

  const updateNotificationTypes = async (
    integrationId: string,
    types: string[],
  ) => {
    try {
      await axios.patch(
        `${API_URL}/api/integrations/${integrationId}`,
        { notificationTypes: types },
        authConfig,
      );
      await fetchIntegrations();
      setSuccess("Notification types updated");
    } catch (err: unknown) {
      setError(parseError(err, "Failed to update notification types"));
    }
  };

  const updateExternalForm = (
    type: ExternalIntegrationType,
    patch: Partial<ExternalIntegrationForm>,
  ) => {
    setExternalForms((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...patch,
      },
    }));
  };

  const saveExternalIntegration = async (type: ExternalIntegrationType) => {
    setError(null);
    const form = externalForms[type];

    let config: Record<string, unknown>;
    let credentials: Record<string, unknown>;

    try {
      config = parseJsonObject("Config", form.configJson);
      credentials = parseJsonObject("Credentials", form.credentialsJson);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }

    const syncFrequencyMinutes = parseSyncFrequencyMinutes(
      form.syncFrequencyMinutes,
    );
    if (syncFrequencyMinutes === null) {
      setError("Sync frequency must be between 5 and 1440 minutes");
      return;
    }

    const body: Record<string, unknown> = {
      provider: form.provider.trim() || defaultExternalProviders[type],
      config,
      isActive: form.isActive,
      syncFrequencyMinutes,
    };

    if (Object.keys(credentials).length > 0) {
      body.credentials = credentials;
    }

    setSavingExternalType(type);

    try {
      await axios.patch(
        `${API_URL}/api/external-integrations/${type}`,
        body,
        authConfig,
      );
      setSuccess(`${externalTypeLabels[type]} integration saved`);
      await refreshExternalData();
    } catch (err: unknown) {
      setError(
        parseError(
          err,
          `Failed to save ${externalTypeLabels[type]} integration`,
        ),
      );
    } finally {
      setSavingExternalType(null);
    }
  };

  const configureStripePayment = async () => {
    const secretKey = stripeSecretKey.trim();
    const publishableKey = stripePublishableKey.trim();
    const syncFrequencyMinutes = parseSyncFrequencyMinutes(
      externalForms.payment.syncFrequencyMinutes,
    );

    if (!secretKey || !publishableKey) {
      setError("Enter both Stripe secret key and publishable key");
      return;
    }

    if (syncFrequencyMinutes === null) {
      setError("Sync frequency must be between 5 and 1440 minutes");
      return;
    }

    setError(null);
    setConfiguringStripe(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/external-integrations/payments/stripe/configure`,
        {
          secretKey,
          publishableKey,
          syncFrequencyMinutes,
        },
        authConfig,
      );
      const message =
        response.data?.message || "Stripe configured successfully";
      const mode = response.data?.mode;
      setSuccess(
        mode === "test" ? `${message} (test mode, no live charges)` : message,
      );
      setStripeSecretKey("");
      setStripePublishableKey("");
      await refreshExternalData();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to configure Stripe"));
    } finally {
      setConfiguringStripe(false);
    }
  };

  const enableMockPaymentMode = async () => {
    setError(null);
    setEnablingMockPayments(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/external-integrations/payments/stripe/use-mock`,
        {},
        authConfig,
      );
      const message = response.data?.message || "Mock payment mode enabled";
      setSuccess(`${message} (no real charges)`);
      setStripeSecretKey("");
      setStripePublishableKey("");
      await refreshExternalData();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to enable mock payments"));
    } finally {
      setEnablingMockPayments(false);
    }
  };

  const startStripeConnectOnboarding = async () => {
    setError(null);
    setStartingStripeConnect(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?tab=external&stripe_connect=return`;
      const refreshUrl = `${window.location.origin}${window.location.pathname}?tab=external&stripe_connect=refresh`;
      const response = await axios.post(
        `${API_URL}/api/external-integrations/payments/stripe/connect/onboarding-link`,
        { returnUrl, refreshUrl },
        authConfig,
      );
      const url = response.data?.url;
      if (!url) {
        throw new Error("Stripe did not return an onboarding link");
      }
      window.location.assign(url);
    } catch (err: unknown) {
      setError(parseError(err, "Failed to start Stripe onboarding"));
      setStartingStripeConnect(false);
    }
  };

  const refreshStripeConnect = async () => {
    setError(null);
    setRefreshingStripeConnect(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/external-integrations/payments/stripe/connect/refresh`,
        {},
        authConfig,
      );
      setStripeConnectStatus(response.data.status || null);
      setSuccess("Stripe payout account status refreshed");
      await refreshExternalData();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to refresh Stripe payout account"));
    } finally {
      setRefreshingStripeConnect(false);
    }
  };

  const startStripeSubscriptionCheckout = async () => {
    setError(null);
    setStartingStripeSubscription(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?tab=external&stripe_subscription=success`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?tab=external&stripe_subscription=cancelled`;
      const response = await axios.post(
        `${API_URL}/api/external-integrations/payments/stripe/subscription/checkout`,
        { returnUrl, cancelUrl },
        authConfig,
      );
      const url = response.data?.url;
      if (!url) {
        throw new Error("Stripe did not return a checkout link");
      }
      window.location.assign(url);
    } catch (err: unknown) {
      setError(parseError(err, "Failed to start subscription checkout"));
      setStartingStripeSubscription(false);
    }
  };

  const refreshStripeSubscription = async () => {
    setError(null);
    setRefreshingStripeSubscription(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/external-integrations/payments/stripe/subscription/refresh`,
        {},
        authConfig,
      );
      setStripeConnectStatus(response.data.status || null);
      setSuccess("Stripe subscription status refreshed");
      await refreshExternalData();
    } catch (err: unknown) {
      setError(parseError(err, "Failed to refresh Stripe subscription"));
    } finally {
      setRefreshingStripeSubscription(false);
    }
  };

  const testExternalIntegration = async (type: ExternalIntegrationType) => {
    setError(null);
    setTestingExternalType(type);

    try {
      const response = await axios.post(
        `${API_URL}/api/external-integrations/${type}/test`,
        {},
        authConfig,
      );
      const message =
        response.data?.message || `${externalTypeLabels[type]} test succeeded`;
      setSuccess(message);
      await refreshExternalData();
    } catch (err: unknown) {
      setError(
        parseError(
          err,
          `Failed to test ${externalTypeLabels[type]} integration`,
        ),
      );
    } finally {
      setTestingExternalType(null);
    }
  };

  const syncExternalIntegration = async (type: ExternalIntegrationType) => {
    setError(null);
    setSyncingExternalType(type);

    try {
      const response = await axios.post(
        `${API_URL}/api/external-integrations/${type}/sync`,
        {},
        authConfig,
      );
      const items = response.data?.itemsProcessed;
      const suffix = Number.isFinite(items) ? ` (${items} items)` : "";
      setSuccess(`${externalTypeLabels[type]} sync completed${suffix}`);
      await refreshExternalData();
    } catch (err: unknown) {
      setError(
        parseError(
          err,
          `Failed to sync ${externalTypeLabels[type]} integration`,
        ),
      );
    } finally {
      setSyncingExternalType(null);
    }
  };

  const slackIntegration = integrations.find((i) => i.type === "slack");
  const teamsIntegration = integrations.find((i) => i.type === "teams");
  const activeExternalCount = externalIntegrations.filter(
    (item) => item.isActive,
  ).length;
  const connectedExternalCount = externalIntegrations.filter(
    (item) => item.connectionStatus === "connected",
  ).length;
  const needsAttentionCount = externalIntegrations.filter(
    (item) =>
      item.connectionStatus === "error" ||
      (item.isActive && !item.isConfigured),
  ).length;
  const stripeSteps = [
    {
      title: "Platform keys",
      body: "Save the Stripe secret and publishable keys for this software environment.",
      done: Boolean(stripeConnectStatus?.platformConfigured),
    },
    {
      title: "Office subscription",
      body: "Start subscription checkout so the practice can be billed by Perry Software.",
      done: stripeSubscriptionReady(stripeConnectStatus),
    },
    {
      title: "Practice payout account",
      body: "Use Stripe Connect so patient and store payments can route to the practice bank account.",
      done: stripePayoutReady(stripeConnectStatus),
    },
    {
      title: "Payment routing",
      body: "Confirm live destination charges or mock ledger mode before taking payments.",
      done: stripeRoutingReady(stripeConnectStatus),
    },
  ];
  const tabs: Array<{
    id: IntegrationsTab;
    label: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      id: "external",
      label: "External Vendors",
      description: "Stripe, Stedi, eRx, labs, fax, and AI transcription",
      icon: Database,
    },
    {
      id: "notifications",
      label: "Team Alerts",
      description: "Slack and Microsoft Teams webhooks",
      icon: Bell,
    },
    {
      id: "logs",
      label: "Logs",
      description: "Recent alert delivery attempts",
      icon: Activity,
    },
  ];
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
  const buttonBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  const renderNotificationTypeGrid = (
    selectedTypes: string[],
    onToggle: (type: string, checked: boolean) => void,
  ) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {allNotificationTypes.map((type) => (
        <label
          key={type}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <input
            type="checkbox"
            checked={selectedTypes.includes(type)}
            onChange={(e) => onToggle(type, e.target.checked)}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span>{notificationTypeLabels[type]}</span>
        </label>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div className="integrations-page min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col lg:flex-row">
            <div className="p-6 sm:p-8 lg:basis-3/5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="info">Admin setup</StatusPill>
                <StatusPill tone={needsAttentionCount ? "warning" : "good"}>
                  {needsAttentionCount
                    ? `${needsAttentionCount} need attention`
                    : "No blocking vendor errors"}
                </StatusPill>
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-normal text-slate-950">
                Integration Command Center
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Connect the outside systems that make the practice work:
                payments, insurance, claims, prescriptions, labs, fax, AI
                transcription, and team alerts. Each section tells you what to
                do first, what is connected, and which test to run before
                turning it on.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payments
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {formatStatusLabel(stripeConnectStatus?.mode)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Stripe mode for this environment
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vendors
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {connectedExternalCount}/{externalIntegrations.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Connected external systems
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Active
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {activeExternalCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Enabled integrations
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Team alerts
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {
                      [slackIntegration, teamsIntegration].filter(Boolean)
                        .length
                    }
                    /2
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Slack and Teams destinations
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 bg-slate-900 p-6 text-white sm:p-8 lg:basis-2/5 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Plain setup order</p>
                  <p className="text-xs text-slate-300">
                    Follow this before live use
                  </p>
                </div>
              </div>
              <ol className="mt-5 space-y-3 text-sm text-slate-200">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
                    1
                  </span>
                  Start with Stripe: keys, subscription, payout account, then
                  test payments.
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
                    2
                  </span>
                  Add eligibility and clearinghouse credentials before relying
                  on insurance workflows.
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
                    3
                  </span>
                  Turn on eRx, labs, fax, and AI transcription only after vendor
                  approval is complete.
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
                    4
                  </span>
                  Press Test Connection and check logs every time you change
                  credentials.
                </li>
              </ol>
            </div>
          </div>
        </section>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Environment reminder</p>
              <p className="mt-1">
                Each Railway environment can be mock, test, or live depending on
                the credentials saved here. Use synthetic patients in demo
                environments unless the owner has explicitly connected live
                vendor accounts.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="rounded p-1 text-rose-700 hover:bg-rose-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{success}</p>
              </div>
              <button
                onClick={() => setSuccess(null)}
                className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                  isActive
                    ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isActive
                      ? "bg-sky-100 text-sky-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <TabIcon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{tab.label}</span>
                  <span className="mt-0.5 block text-xs opacity-80">
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {activeTab === "external" && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <aside className="space-y-4 lg:w-72 lg:shrink-0">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <BadgeCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">
                      What to do first
                    </h2>
                    <p className="text-xs text-slate-500">
                      A safe setup path for owners
                    </p>
                  </div>
                </div>
                <ol className="mt-4 space-y-3 text-sm text-slate-700">
                  {[
                    "Save Stripe keys or enable mock payments.",
                    "Connect the practice payout account.",
                    "Add Stedi or eligibility credentials.",
                    "Press Test Connection on each active vendor.",
                    "Open logs after every test and sync.",
                  ].map((item, index) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-950">
                    Last 7 days
                  </h2>
                  <button
                    onClick={() => {
                      void refreshExternalData();
                    }}
                    disabled={refreshingExternal}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${refreshingExternal ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Calls</p>
                    <p className="mt-1 text-xl font-bold text-slate-950">
                      {externalStats?.totalCalls || 0}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Successful</p>
                    <p className="mt-1 text-xl font-bold text-emerald-800">
                      {externalStats?.successfulCalls || 0}
                    </p>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-3">
                    <p className="text-xs text-rose-700">Failed</p>
                    <p className="mt-1 text-xl font-bold text-rose-800">
                      {externalStats?.failedCalls || 0}
                    </p>
                  </div>
                  <div className="rounded-lg bg-sky-50 p-3">
                    <p className="text-xs text-sky-700">Avg speed</p>
                    <p className="mt-1 text-xl font-bold text-sky-800">
                      {externalStats?.averageDurationMs || 0} ms
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div className="space-y-5 lg:min-w-0 lg:flex-1">
              {externalIntegrations.map((integration) => {
                const form = externalForms[integration.type];
                const isSaving = savingExternalType === integration.type;
                const isTesting = testingExternalType === integration.type;
                const isSyncing = syncingExternalType === integration.type;
                const IntegrationIcon = externalTypeIcons[integration.type];
                const connectionTone = toneForConnection(
                  integration.connectionStatus,
                );
                const ambientProvider =
                  integration.type === "ambient_transcription"
                    ? normalizeAmbientProvider(
                        form.provider || integration.provider,
                      )
                    : null;
                const ambientSetup = ambientProvider
                  ? getAmbientSetupCopy(ambientProvider)
                  : null;
                const eligibilitySetup =
                  integration.type === "eligibility"
                    ? getEligibilitySetupCopy(
                        form.provider || integration.provider,
                      )
                    : null;
                const clearinghouseSetup =
                  integration.type === "clearinghouse"
                    ? getClearinghouseSetupCopy(
                        form.provider || integration.provider,
                      )
                    : null;
                const docsLink =
                  integration.type === "ambient_transcription" &&
                  ambientProvider
                    ? ambientDocsLinks[ambientProvider]
                    : getExternalDocsLink(
                        integration.type,
                        form.provider || integration.provider,
                      );
                const providerOptions =
                  externalProviderOptions[integration.type];

                return (
                  <section
                    key={integration.type}
                    id={
                      integration.type === "payment"
                        ? "stripe-payments"
                        : undefined
                    }
                    className="rounded-lg border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="border-b border-slate-200 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 gap-4">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${softIconClasses[connectionTone]}`}
                          >
                            <IntegrationIcon className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-bold text-slate-950">
                                {externalTypeLabels[integration.type]}
                              </h2>
                              <StatusPill tone={connectionTone}>
                                {formatStatusLabel(
                                  integration.connectionStatus,
                                )}
                              </StatusPill>
                              <StatusPill
                                tone={
                                  integration.isConfigured ? "good" : "neutral"
                                }
                              >
                                {integration.isConfigured
                                  ? "configured"
                                  : "not configured"}
                              </StatusPill>
                              {form.isActive ? (
                                <StatusPill tone="info">active</StatusPill>
                              ) : null}
                            </div>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                              {externalTypeDescriptions[integration.type]}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Last sync:{" "}
                              {integration.lastSyncAt
                                ? new Date(
                                    integration.lastSyncAt,
                                  ).toLocaleString()
                                : "Never"}
                            </p>
                          </div>
                        </div>
                        {docsLink && (
                          <a
                            href={docsLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Provider docs
                            <ArrowRight className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="space-y-5 p-5">
                      {integration.lastError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                          <div className="flex gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            <p>{integration.lastError}</p>
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Zap className="h-4 w-4 text-amber-600" />
                          Plain instructions
                        </div>
                        <ol className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                          {externalTypeInstructions[integration.type].map(
                            (item, index) => (
                              <li key={item} className="flex gap-2">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                                  {index + 1}
                                </span>
                                {item}
                              </li>
                            ),
                          )}
                        </ol>
                      </div>

                      {(eligibilitySetup ||
                        clearinghouseSetup ||
                        ambientSetup) && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                          <p className="font-semibold">
                            {eligibilitySetup?.title ||
                              clearinghouseSetup?.title ||
                              ambientSetup?.title}
                          </p>
                          {(
                            eligibilitySetup?.body ||
                            clearinghouseSetup?.body ||
                            ambientSetup?.body ||
                            []
                          ).map((line) => (
                            <p key={line} className="mt-1">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-slate-700">
                            Vendor
                          </label>
                          {integration.type === "ambient_transcription" ? (
                            <div className="space-y-2">
                              <select
                                value={ambientProvider || "abridge"}
                                onChange={(e) => {
                                  const provider = normalizeAmbientProvider(
                                    e.target.value,
                                  );
                                  updateExternalForm(integration.type, {
                                    provider,
                                    configJson: JSON.stringify(
                                      buildAmbientConfigTemplate(provider),
                                      null,
                                      2,
                                    ),
                                    credentialsJson: JSON.stringify(
                                      buildAmbientCredentialsTemplate(provider),
                                      null,
                                      2,
                                    ),
                                  });
                                }}
                                className={inputClass}
                              >
                                {ambientProviderOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-slate-500">
                                Changing the vendor reloads starter config and
                                credential templates.
                              </p>
                            </div>
                          ) : providerOptions ? (
                            <div className="space-y-2">
                              <select
                                value={form.provider}
                                onChange={(e) => {
                                  const provider = e.target.value;
                                  updateExternalForm(integration.type, {
                                    provider,
                                    configJson: JSON.stringify(
                                      buildDefaultConfigTemplate(
                                        integration.type,
                                        provider,
                                      ),
                                      null,
                                      2,
                                    ),
                                    credentialsJson: JSON.stringify(
                                      buildDefaultCredentialsTemplate(
                                        integration.type,
                                        provider,
                                      ),
                                      null,
                                      2,
                                    ),
                                  });
                                }}
                                className={inputClass}
                              >
                                {providerOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-slate-500">
                                Changing the vendor reloads starter config and
                                credential templates.
                              </p>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={form.provider}
                              onChange={(e) =>
                                updateExternalForm(integration.type, {
                                  provider: e.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          )}
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-semibold text-slate-700">
                            Sync every
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={5}
                              max={1440}
                              value={form.syncFrequencyMinutes}
                              onChange={(e) =>
                                updateExternalForm(integration.type, {
                                  syncFrequencyMinutes: e.target.value,
                                })
                              }
                              className={`${inputClass} pr-20`}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                              minutes
                            </span>
                          </div>
                        </div>

                        <div className="flex items-end">
                          <label className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <span>
                              <span className="block font-semibold">
                                Enable workflow
                              </span>
                              <span className="text-xs text-slate-500">
                                Use after credentials test cleanly
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={form.isActive}
                              onChange={(e) =>
                                updateExternalForm(integration.type, {
                                  isActive: e.target.checked,
                                })
                              }
                              className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                          </label>
                        </div>
                      </div>

                      {integration.type === "payment" ? (
                        <div className="space-y-5">
                          <div className="grid gap-3 lg:grid-cols-4">
                            {stripeSteps.map((step) => (
                              <div
                                key={step.title}
                                className={`rounded-lg border p-4 ${
                                  step.done
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-slate-200 bg-white"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <CheckCircle2
                                    className={`h-5 w-5 ${step.done ? "text-emerald-700" : "text-slate-300"}`}
                                  />
                                  <p className="text-sm font-bold text-slate-950">
                                    {step.title}
                                  </p>
                                </div>
                                <p className="mt-2 text-xs leading-5 text-slate-600">
                                  {step.body}
                                </p>
                              </div>
                            ))}
                          </div>

                          <div className="grid gap-4 lg:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                                    <WalletCards className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-950">
                                      Practice payout account
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Banking and KYC happen in Stripe
                                    </p>
                                  </div>
                                </div>
                                <StatusPill
                                  tone={
                                    stripePayoutReady(stripeConnectStatus)
                                      ? "good"
                                      : "warning"
                                  }
                                >
                                  {formatStatusLabel(
                                    stripeConnectStatus?.onboardingStatus,
                                  )}
                                </StatusPill>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                <div className="rounded-lg bg-slate-50 p-3">
                                  <p className="text-slate-500">Charges</p>
                                  <p
                                    className={
                                      stripeConnectStatus?.chargesEnabled
                                        ? "font-semibold text-emerald-700"
                                        : "font-semibold text-slate-700"
                                    }
                                  >
                                    {stripeConnectStatus?.chargesEnabled
                                      ? "Enabled"
                                      : "Not ready"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-slate-50 p-3">
                                  <p className="text-slate-500">Payouts</p>
                                  <p
                                    className={
                                      stripeConnectStatus?.payoutsEnabled
                                        ? "font-semibold text-emerald-700"
                                        : "font-semibold text-slate-700"
                                    }
                                  >
                                    {stripeConnectStatus?.payoutsEnabled
                                      ? "Enabled"
                                      : "Not ready"}
                                  </p>
                                </div>
                              </div>
                              <p className="mt-3 break-all text-xs text-slate-500">
                                {stripeConnectStatus?.connectedAccountId ||
                                  "No connected account yet"}
                              </p>
                              {stripeConnectStatus?.requirementsDue?.length ? (
                                <p className="mt-2 text-xs text-amber-700">
                                  Needs:{" "}
                                  {stripeConnectStatus.requirementsDue
                                    .slice(0, 3)
                                    .join(", ")}
                                  {stripeConnectStatus.requirementsDue.length >
                                  3
                                    ? "..."
                                    : ""}
                                </p>
                              ) : null}
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    void startStripeConnectOnboarding();
                                  }}
                                  disabled={startingStripeConnect}
                                  className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                                >
                                  <Building2 className="h-4 w-4" />
                                  {startingStripeConnect
                                    ? "Opening..."
                                    : "Connect Stripe"}
                                </button>
                                <button
                                  onClick={() => {
                                    void refreshStripeConnect();
                                  }}
                                  disabled={refreshingStripeConnect}
                                  className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                                >
                                  <RefreshCw
                                    className={`h-4 w-4 ${refreshingStripeConnect ? "animate-spin" : ""}`}
                                  />
                                  Refresh
                                </button>
                              </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                                    <ReceiptText className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-950">
                                      Office subscription
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      The practice pays Perry Software
                                    </p>
                                  </div>
                                </div>
                                <StatusPill
                                  tone={
                                    stripeSubscriptionReady(stripeConnectStatus)
                                      ? "good"
                                      : "neutral"
                                  }
                                >
                                  {formatStatusLabel(
                                    stripeConnectStatus?.subscription.status,
                                  )}
                                </StatusPill>
                              </div>
                              <p className="mt-4 break-all text-xs text-slate-500">
                                {stripeConnectStatus?.subscription
                                  .subscriptionId ||
                                  stripeConnectStatus?.subscription
                                    .checkoutSessionId ||
                                  "No subscription checkout yet"}
                              </p>
                              {stripeConnectStatus?.subscription
                                .currentPeriodEnd && (
                                <p className="mt-2 text-xs text-slate-600">
                                  Renews{" "}
                                  {new Date(
                                    stripeConnectStatus.subscription.currentPeriodEnd,
                                  ).toLocaleDateString()}
                                </p>
                              )}
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    void startStripeSubscriptionCheckout();
                                  }}
                                  disabled={startingStripeSubscription}
                                  className={`${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`}
                                >
                                  <CreditCard className="h-4 w-4" />
                                  {startingStripeSubscription
                                    ? "Opening..."
                                    : "Start Subscription"}
                                </button>
                                <button
                                  onClick={() => {
                                    void refreshStripeSubscription();
                                  }}
                                  disabled={refreshingStripeSubscription}
                                  className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                                >
                                  <RefreshCw
                                    className={`h-4 w-4 ${refreshingStripeSubscription ? "animate-spin" : ""}`}
                                  />
                                  Refresh
                                </button>
                              </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                                  <KeyRound className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-950">
                                    Patient and store payments
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Checkout, receipts, refunds, and revenue
                                    posting
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                <div className="rounded-lg bg-slate-50 p-3">
                                  <p className="text-slate-500">Mode</p>
                                  <p className="font-semibold text-slate-950">
                                    {formatStatusLabel(
                                      stripeConnectStatus?.mode,
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-slate-50 p-3">
                                  <p className="text-slate-500">Routing</p>
                                  <p
                                    className={
                                      stripeRoutingReady(stripeConnectStatus)
                                        ? "font-semibold text-emerald-700"
                                        : "font-semibold text-amber-700"
                                    }
                                  >
                                    {stripeConnectStatus?.destinationChargesEnabled
                                      ? "Practice account"
                                      : stripeConnectStatus?.mode === "mock"
                                        ? "Mock ledger"
                                        : "Needs payout"}
                                  </p>
                                </div>
                              </div>
                              {stripeConnectStatus?.disabledReason && (
                                <p className="mt-3 text-xs text-amber-700">
                                  {stripeConnectStatus.disabledReason}
                                </p>
                              )}
                              <p className="mt-3 text-xs leading-5 text-slate-500">
                                Store orders post through the Stripe webhook and
                                revenue ledger. Finish payout onboarding before
                                live charges route to the practice bank account.
                              </p>
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center gap-2">
                              <KeyRound className="h-4 w-4 text-slate-600" />
                              <p className="text-sm font-bold text-slate-950">
                                Platform key setup
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">
                              These are platform Stripe keys for this software
                              environment. Practice banking still happens inside
                              Stripe Connect onboarding.
                            </p>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-sm font-semibold text-slate-700">
                                  Stripe secret key
                                </label>
                                <input
                                  type="password"
                                  value={stripeSecretKey}
                                  onChange={(e) =>
                                    setStripeSecretKey(e.target.value)
                                  }
                                  className={`${inputClass} font-mono`}
                                  placeholder="sk_test_..."
                                  autoComplete="off"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-sm font-semibold text-slate-700">
                                  Stripe publishable key
                                </label>
                                <input
                                  type="text"
                                  value={stripePublishableKey}
                                  onChange={(e) =>
                                    setStripePublishableKey(e.target.value)
                                  }
                                  className={`${inputClass} font-mono`}
                                  placeholder="pk_test_..."
                                  autoComplete="off"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">
                              Configuration JSON
                            </label>
                            <textarea
                              value={form.configJson}
                              onChange={(e) =>
                                updateExternalForm(integration.type, {
                                  configJson: e.target.value,
                                })
                              }
                              rows={8}
                              className={`${inputClass} font-mono`}
                              placeholder='{"baseUrl":"https://..."}'
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              Endpoint, feature flags, payer routes, callback
                              paths, and vendor-specific settings.
                            </p>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">
                              Credential JSON
                            </label>
                            <textarea
                              value={form.credentialsJson}
                              onChange={(e) =>
                                updateExternalForm(integration.type, {
                                  credentialsJson: e.target.value,
                                })
                              }
                              rows={8}
                              className={`${inputClass} font-mono`}
                              placeholder='{"apiKey":"...","apiSecret":"..."}'
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              Secrets are sent to the API for storage. Run a
                              test after saving.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
                        {integration.type === "payment" ? (
                          <>
                            <button
                              onClick={() => {
                                void configureStripePayment();
                              }}
                              disabled={
                                configuringStripe ||
                                !stripeSecretKey.trim() ||
                                !stripePublishableKey.trim()
                              }
                              className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                            >
                              <KeyRound className="h-4 w-4" />
                              {configuringStripe
                                ? "Saving..."
                                : "Save Platform Keys"}
                            </button>
                            <button
                              onClick={() => {
                                void enableMockPaymentMode();
                              }}
                              disabled={enablingMockPayments}
                              className={`${buttonBase} bg-slate-800 text-white hover:bg-slate-900`}
                            >
                              <Database className="h-4 w-4" />
                              {enablingMockPayments
                                ? "Switching..."
                                : "Use Mock Payments"}
                            </button>
                            <button
                              onClick={() => {
                                void testExternalIntegration(integration.type);
                              }}
                              disabled={isTesting}
                              className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {isTesting ? "Testing..." : "Test Payments"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                void saveExternalIntegration(integration.type);
                              }}
                              disabled={isSaving}
                              className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                            >
                              <KeyRound className="h-4 w-4" />
                              {isSaving ? "Saving..." : "Save Configuration"}
                            </button>
                            <button
                              onClick={() => {
                                void testExternalIntegration(integration.type);
                              }}
                              disabled={isTesting}
                              className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {isTesting ? "Testing..." : "Test Connection"}
                            </button>
                            <button
                              onClick={() => {
                                void syncExternalIntegration(integration.type);
                              }}
                              disabled={isSyncing}
                              className={`${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`}
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                              />
                              {isSyncing ? "Syncing..." : "Run Sync"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      External integration logs
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Recent vendor tests, syncs, and API calls.
                    </p>
                  </div>
                  <StatusPill tone="neutral">
                    {externalLogs.length} recent
                  </StatusPill>
                </div>
                {externalLogs.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState
                      icon={Activity}
                      title="No external vendor logs yet"
                      body="Save a vendor, run a test, or run sync and the result will show here."
                    />
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {externalLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`rounded-lg border p-4 ${
                          log.status === "success"
                            ? "border-emerald-200 bg-emerald-50"
                            : log.status === "error"
                              ? "border-rose-200 bg-rose-50"
                              : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">
                              {externalTypeLabels[log.integration_type] ||
                                log.integration_type}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {log.provider} | {log.direction} | {log.method}{" "}
                              {log.endpoint}
                              {typeof log.duration_ms === "number"
                                ? ` | ${log.duration_ms} ms`
                                : ""}
                            </p>
                            {log.error_message && (
                              <p className="mt-1 text-xs text-rose-700">
                                {log.error_message}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <StatusPill
                              tone={
                                log.status === "success"
                                  ? "good"
                                  : log.status === "error"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {log.status}
                            </StatusPill>
                            <div className="mt-2">
                              {new Date(log.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Team alert destinations
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Use this only for internal staff alerts. Patient texting
                    lives in the Text Messages workflow.
                  </p>
                </div>
                <StatusPill tone="info">
                  {[slackIntegration, teamsIntegration].filter(Boolean).length}{" "}
                  connected
                </StatusPill>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <MessageSquareText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">
                        Slack
                      </h3>
                      <p className="text-sm text-slate-600">
                        {slackIntegration ? "Connected" : "Not connected"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Paste a Slack incoming webhook and choose which office
                        events go there.
                      </p>
                    </div>
                  </div>
                  {slackIntegration ? (
                    <button
                      onClick={() =>
                        toggleIntegration(
                          slackIntegration.id,
                          slackIntegration.enabled,
                        )
                      }
                      className={`${buttonBase} ${
                        slackIntegration.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {slackIntegration.enabled ? "Enabled" : "Disabled"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowSlackSetup(!showSlackSetup)}
                      className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                    >
                      Connect Slack
                    </button>
                  )}
                </div>

                {slackIntegration && (
                  <div className="mt-5 space-y-5">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">
                        <strong>Channel:</strong>{" "}
                        {slackIntegration.channel_name || "Default"}
                      </p>
                      {slackIntegration.stats && (
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <div>
                            <p className="text-xs text-slate-500">Total</p>
                            <p className="text-lg font-bold text-slate-950">
                              {slackIntegration.stats.total_notifications}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Successful</p>
                            <p className="text-lg font-bold text-emerald-700">
                              {slackIntegration.stats.successful_notifications}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Failed</p>
                            <p className="text-lg font-bold text-rose-700">
                              {slackIntegration.stats.failed_notifications}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-bold text-slate-900">
                        Notification types
                      </h4>
                      {renderNotificationTypeGrid(
                        slackIntegration.notification_types,
                        (type, checked) => {
                          const newTypes = checked
                            ? [...slackIntegration.notification_types, type]
                            : slackIntegration.notification_types.filter(
                                (t) => t !== type,
                              );
                          void updateNotificationTypes(
                            slackIntegration.id,
                            newTypes,
                          );
                        },
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          void testIntegration(slackIntegration.id);
                        }}
                        disabled={testingId === slackIntegration.id}
                        className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                      >
                        {testingId === slackIntegration.id
                          ? "Testing..."
                          : "Test Connection"}
                      </button>
                      <button
                        onClick={() => {
                          void deleteIntegration(slackIntegration.id);
                        }}
                        className={`${buttonBase} bg-rose-600 text-white hover:bg-rose-700`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {showSlackSetup && !slackIntegration && (
                  <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">
                        Webhook URL
                      </label>
                      <input
                        type="url"
                        value={slackWebhook}
                        onChange={(e) => setSlackWebhook(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Create an incoming webhook in your Slack workspace
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">
                        Channel Name (optional)
                      </label>
                      <input
                        type="text"
                        value={slackChannel}
                        onChange={(e) => setSlackChannel(e.target.value)}
                        placeholder="#general"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Notification Types
                      </label>
                      {renderNotificationTypeGrid(
                        slackNotifications,
                        (type, checked) => {
                          if (checked) {
                            setSlackNotifications([
                              ...slackNotifications,
                              type,
                            ]);
                          } else {
                            setSlackNotifications(
                              slackNotifications.filter((t) => t !== type),
                            );
                          }
                        },
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          void createSlackIntegration();
                        }}
                        className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                      >
                        Save Integration
                      </button>
                      <button
                        onClick={() => setShowSlackSetup(false)}
                        className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <MessageSquareText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">
                        Microsoft Teams
                      </h3>
                      <p className="text-sm text-slate-600">
                        {teamsIntegration ? "Connected" : "Not connected"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Paste a Teams incoming webhook and choose which office
                        events go there.
                      </p>
                    </div>
                  </div>
                  {teamsIntegration ? (
                    <button
                      onClick={() =>
                        toggleIntegration(
                          teamsIntegration.id,
                          teamsIntegration.enabled,
                        )
                      }
                      className={`${buttonBase} ${
                        teamsIntegration.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {teamsIntegration.enabled ? "Enabled" : "Disabled"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowTeamsSetup(!showTeamsSetup)}
                      className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                    >
                      Connect Teams
                    </button>
                  )}
                </div>

                {teamsIntegration && (
                  <div className="mt-5 space-y-5">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">
                        <strong>Channel:</strong>{" "}
                        {teamsIntegration.channel_name || "Default"}
                      </p>
                      {teamsIntegration.stats && (
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <div>
                            <p className="text-xs text-slate-500">Total</p>
                            <p className="text-lg font-bold text-slate-950">
                              {teamsIntegration.stats.total_notifications}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Successful</p>
                            <p className="text-lg font-bold text-emerald-700">
                              {teamsIntegration.stats.successful_notifications}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Failed</p>
                            <p className="text-lg font-bold text-rose-700">
                              {teamsIntegration.stats.failed_notifications}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-bold text-slate-900">
                        Notification types
                      </h4>
                      {renderNotificationTypeGrid(
                        teamsIntegration.notification_types,
                        (type, checked) => {
                          const newTypes = checked
                            ? [...teamsIntegration.notification_types, type]
                            : teamsIntegration.notification_types.filter(
                                (t) => t !== type,
                              );
                          void updateNotificationTypes(
                            teamsIntegration.id,
                            newTypes,
                          );
                        },
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          void testIntegration(teamsIntegration.id);
                        }}
                        disabled={testingId === teamsIntegration.id}
                        className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                      >
                        {testingId === teamsIntegration.id
                          ? "Testing..."
                          : "Test Connection"}
                      </button>
                      <button
                        onClick={() => {
                          void deleteIntegration(teamsIntegration.id);
                        }}
                        className={`${buttonBase} bg-rose-600 text-white hover:bg-rose-700`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {showTeamsSetup && !teamsIntegration && (
                  <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">
                        Webhook URL
                      </label>
                      <input
                        type="url"
                        value={teamsWebhook}
                        onChange={(e) => setTeamsWebhook(e.target.value)}
                        placeholder="https://...webhook.office.com/..."
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Create an incoming webhook in your Teams channel
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">
                        Channel Name (optional)
                      </label>
                      <input
                        type="text"
                        value={teamsChannel}
                        onChange={(e) => setTeamsChannel(e.target.value)}
                        placeholder="General"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Notification Types
                      </label>
                      {renderNotificationTypeGrid(
                        teamsNotifications,
                        (type, checked) => {
                          if (checked) {
                            setTeamsNotifications([
                              ...teamsNotifications,
                              type,
                            ]);
                          } else {
                            setTeamsNotifications(
                              teamsNotifications.filter((t) => t !== type),
                            );
                          }
                        },
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          void createTeamsIntegration();
                        }}
                        className={`${buttonBase} bg-sky-600 text-white hover:bg-sky-700`}
                      >
                        Save Integration
                      </button>
                      <button
                        onClick={() => setShowTeamsSetup(false)}
                        className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Recent notification logs
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Slack and Teams delivery history.
                </p>
              </div>
              <StatusPill tone="neutral">{logs.length} recent</StatusPill>
            </div>
            {logs.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Bell}
                  title="No notifications sent yet"
                  body="Test Slack or Teams and the delivery result will show here."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`rounded-lg border p-4 ${
                      log.success
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-rose-200 bg-rose-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-950">
                            {log.integration_type === "slack"
                              ? "Slack"
                              : "Microsoft Teams"}
                          </span>
                          {log.channel_name && (
                            <span className="text-sm text-slate-600">
                              #{log.channel_name}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {notificationTypeLabels[log.notification_type] ||
                            log.notification_type}
                        </p>
                        {!log.success && log.error_message && (
                          <p className="mt-1 text-xs text-rose-700">
                            {log.error_message}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <StatusPill tone={log.success ? "good" : "danger"}>
                          {log.success ? "Sent" : "Failed"}
                        </StatusPill>
                        <p className="mt-2 text-xs text-slate-500">
                          {new Date(log.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
