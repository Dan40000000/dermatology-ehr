import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../utils/apiBase";

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
  onboardingStatus: "not_started" | "pending" | "complete" | "restricted" | "mock";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  destinationChargesEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason?: string | null;
  lastSyncedAt?: string | null;
  subscription: {
    status: "not_started" | "checkout_started" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "mock";
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

const ambientProviderOptions: Array<{ value: AmbientProvider; label: string }> = [
  { value: "abridge", label: "Abridge" },
  { value: "nabla", label: "Nabla" },
  { value: "aws_healthscribe", label: "AWS HealthScribe" },
  { value: "wispr_flow", label: "Wispr Flow" },
];

const ambientDocsLinks: Record<AmbientProvider, string> = {
  abridge: "https://support.abridge.com/hc/en-us/articles/30287281533715-Get-Started-Using-Abridge",
  nabla: "https://docs.nabla.com/next/guides/intro",
  aws_healthscribe: "https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html",
  wispr_flow: "https://api-docs.wisprflow.ai/rest_api_quickstart",
};

const normalizeAmbientProvider = (provider?: string): AmbientProvider => {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === "nabla") return "nabla";
  if (normalized === "aws" || normalized === "aws_healthscribe" || normalized === "healthscribe") {
    return "aws_healthscribe";
  }
  if (normalized === "wispr" || normalized === "wispr_flow") return "wispr_flow";
  return "abridge";
};

const buildAmbientConfigTemplate = (provider: AmbientProvider): Record<string, any> => {
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

const buildAmbientCredentialsTemplate = (provider: AmbientProvider): Record<string, any> => {
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
  provider?: string
): Record<string, any> => {
  const normalizedProvider = String(provider || defaultExternalProviders[type] || "").trim().toLowerCase();

  switch (type) {
    case "clearinghouse":
      if (normalizedProvider === "stedi") {
        return {
          baseUrl: "https://healthcare.us.stedi.com/2024-04-01",
          professionalClaimsPath: "/change/medicalnetwork/professionalclaims/v3",
          claimStatusPath: "/change/medicalnetwork/claim/status/v3",
          eraReportPath: "/reports/835",
          environment: "mock",
          notes: "Claims remain in internal mock mode until Stedi production claim enrollment and 837P mapping are enabled.",
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
        scope: "healthcare-hipaa-transactions-demo-demo healthcare-hipaa-transactions-demo",
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
  provider?: string
): Record<string, any> => {
  const normalizedProvider = String(provider || defaultExternalProviders[type] || "").trim().toLowerCase();

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
      return buildAmbientCredentialsTemplate(normalizeAmbientProvider(provider));
    default:
      return {};
  }
};

const getAmbientSetupCopy = (provider: AmbientProvider): { title: string; body: string[] } => {
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

const getExternalDocsLink = (type: ExternalIntegrationType, provider?: string): string | undefined => {
  const normalizedProvider = String(provider || "").trim().toLowerCase();

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

const getEligibilitySetupCopy = (provider?: string): { title: string; body: string[] } => {
  const normalizedProvider = String(provider || "").trim().toLowerCase();

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

const getClearinghouseSetupCopy = (provider?: string): { title: string; body: string[] } | null => {
  const normalizedProvider = String(provider || "").trim().toLowerCase();

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

const parseError = (err: any, fallback: string): string => {
  const payload = err?.response?.data;
  if (typeof payload?.error === "string") {
    return payload.error;
  }

  if (Array.isArray(payload?.error)) {
    const messages = payload.error
      .map((issue: any) => {
        if (typeof issue === "string") return issue;
        if (typeof issue?.message === "string") return issue.message;
        return "";
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(", ");
    }
  }

  if (typeof err?.message === "string" && err.message) {
    return err.message;
  }

  return fallback;
};

const seedExternalStatus = (
  type: ExternalIntegrationType,
  partial?: Partial<ExternalIntegrationStatus>
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

const buildDefaultExternalForms = (): Record<ExternalIntegrationType, ExternalIntegrationForm> => ({
  clearinghouse: {
    provider: defaultExternalProviders.clearinghouse,
    configJson: JSON.stringify(buildDefaultConfigTemplate("clearinghouse"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("clearinghouse"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  eligibility: {
    provider: defaultExternalProviders.eligibility,
    configJson: JSON.stringify(buildDefaultConfigTemplate("eligibility"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("eligibility"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  eprescribe: {
    provider: defaultExternalProviders.eprescribe,
    configJson: JSON.stringify(buildDefaultConfigTemplate("eprescribe"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("eprescribe"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  lab: {
    provider: defaultExternalProviders.lab,
    configJson: JSON.stringify(buildDefaultConfigTemplate("lab"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("lab"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  ambient_transcription: {
    provider: defaultExternalProviders.ambient_transcription,
    configJson: JSON.stringify(buildDefaultConfigTemplate("ambient_transcription"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("ambient_transcription"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  payment: {
    provider: defaultExternalProviders.payment,
    configJson: JSON.stringify(buildDefaultConfigTemplate("payment"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("payment"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
  fax: {
    provider: defaultExternalProviders.fax,
    configJson: JSON.stringify(buildDefaultConfigTemplate("fax"), null, 2),
    credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate("fax"), null, 2),
    isActive: false,
    syncFrequencyMinutes: "60",
  },
});

const parseJsonObject = (label: string, raw: string): Record<string, any> => {
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

  return parsed as Record<string, any>;
};

const parseSyncFrequencyMinutes = (raw: string): number | null => {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 5 || parsed > 1440) {
    return null;
  }
  return parsed;
};

const connectionBadgeClass: Record<ExternalIntegrationStatus["connectionStatus"], string> = {
  connected: "bg-green-100 text-green-700",
  disconnected: "bg-gray-100 text-gray-700",
  error: "bg-red-100 text-red-700",
  unknown: "bg-yellow-100 text-yellow-700",
};

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
  const [externalIntegrations, setExternalIntegrations] = useState<ExternalIntegrationStatus[]>(
    externalTypeOrder.map((type) => seedExternalStatus(type))
  );
  const [externalForms, setExternalForms] =
    useState<Record<ExternalIntegrationType, ExternalIntegrationForm>>(buildDefaultExternalForms());
  const [externalLogs, setExternalLogs] = useState<ExternalIntegrationLog[]>([]);
  const [externalStats, setExternalStats] = useState<ExternalIntegrationStats | null>(null);
  const [stripeConnectStatus, setStripeConnectStatus] = useState<StripeConnectStatus | null>(null);

  // UI state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingExternalType, setSavingExternalType] = useState<ExternalIntegrationType | null>(null);
  const [testingExternalType, setTestingExternalType] = useState<ExternalIntegrationType | null>(null);
  const [syncingExternalType, setSyncingExternalType] = useState<ExternalIntegrationType | null>(null);
  const [refreshingExternal, setRefreshingExternal] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [configuringStripe, setConfiguringStripe] = useState(false);
  const [enablingMockPayments, setEnablingMockPayments] = useState(false);
  const [startingStripeConnect, setStartingStripeConnect] = useState(false);
  const [refreshingStripeConnect, setRefreshingStripeConnect] = useState(false);
  const [startingStripeSubscription, setStartingStripeSubscription] = useState(false);
  const [refreshingStripeSubscription, setRefreshingStripeSubscription] = useState(false);

  const fetchIntegrations = async () => {
    const response = await axios.get(`${API_URL}/api/integrations`, authConfig);
    setIntegrations(response.data.integrations || []);
  };

  const fetchLogs = async () => {
    const response = await axios.get(`${API_URL}/api/integrations/logs?limit=20`, authConfig);
    setLogs(response.data.logs || []);
  };

  const fetchExternalIntegrations = async () => {
    const response = await axios.get(`${API_URL}/api/external-integrations`, authConfig);
    const payload = (response.data?.integrations || {}) as Partial<
      Record<ExternalIntegrationType, Partial<ExternalIntegrationStatus>>
    >;

    const mapped = externalTypeOrder.map((type) =>
      seedExternalStatus(type, {
        ...payload[type],
        type,
      })
    );

    setExternalIntegrations(mapped);

    setExternalForms((prev) => {
      const next = { ...prev };
      for (const item of mapped) {
        const current = next[item.type];
        next[item.type] = {
          ...current,
          provider: current.provider || item.provider || defaultExternalProviders[item.type],
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
    const response = await axios.get(`${API_URL}/api/external-integrations/logs?limit=20`, authConfig);
    setExternalLogs(response.data.logs || []);
  };

  const fetchExternalStats = async () => {
    const response = await axios.get(`${API_URL}/api/external-integrations/stats?days=7`, authConfig);
    setExternalStats(response.data.stats || null);
  };

  const fetchStripeConnectStatus = async () => {
    const response = await axios.get(
      `${API_URL}/api/external-integrations/payments/stripe/connect/status`,
      authConfig
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
      } catch (err: any) {
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
        authConfig
      );
      setSuccess("Slack integration created successfully!");
      setShowSlackSetup(false);
      setSlackWebhook("");
      setSlackChannel("");
      setSlackNotifications([]);
      await fetchIntegrations();
    } catch (err: any) {
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
        authConfig
      );
      setSuccess("Teams integration created successfully!");
      setShowTeamsSetup(false);
      setTeamsWebhook("");
      setTeamsChannel("");
      setTeamsNotifications([]);
      await fetchIntegrations();
    } catch (err: any) {
      setError(parseError(err, "Failed to create Teams integration"));
    }
  };

  const testIntegration = async (integrationId: string) => {
    setTestingId(integrationId);
    setError(null);
    try {
      await axios.post(`${API_URL}/api/integrations/${integrationId}/test`, {}, authConfig);
      setSuccess("Test notification sent successfully!");
      await fetchLogs();
    } catch (err: any) {
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
        authConfig
      );
      await fetchIntegrations();
    } catch (err: any) {
      setError(parseError(err, "Failed to toggle integration"));
    }
  };

  const deleteIntegration = async (integrationId: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/integrations/${integrationId}`, authConfig);
      setSuccess("Integration deleted successfully");
      await fetchIntegrations();
    } catch (err: any) {
      setError(parseError(err, "Failed to delete integration"));
    }
  };

  const updateNotificationTypes = async (integrationId: string, types: string[]) => {
    try {
      await axios.patch(
        `${API_URL}/api/integrations/${integrationId}`,
        { notificationTypes: types },
        authConfig
      );
      await fetchIntegrations();
      setSuccess("Notification types updated");
    } catch (err: any) {
      setError(parseError(err, "Failed to update notification types"));
    }
  };

  const updateExternalForm = (
    type: ExternalIntegrationType,
    patch: Partial<ExternalIntegrationForm>
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

    let config: Record<string, any>;
    let credentials: Record<string, any>;

    try {
      config = parseJsonObject("Config", form.configJson);
      credentials = parseJsonObject("Credentials", form.credentialsJson);
    } catch (err: any) {
      setError(err.message || "Invalid JSON");
      return;
    }

    const syncFrequencyMinutes = parseSyncFrequencyMinutes(form.syncFrequencyMinutes);
    if (syncFrequencyMinutes === null) {
      setError("Sync frequency must be between 5 and 1440 minutes");
      return;
    }

    const body: Record<string, any> = {
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
      await axios.patch(`${API_URL}/api/external-integrations/${type}`, body, authConfig);
      setSuccess(`${externalTypeLabels[type]} integration saved`);
      await refreshExternalData();
    } catch (err: any) {
      setError(parseError(err, `Failed to save ${externalTypeLabels[type]} integration`));
    } finally {
      setSavingExternalType(null);
    }
  };

  const configureStripePayment = async () => {
    const secretKey = stripeSecretKey.trim();
    const publishableKey = stripePublishableKey.trim();
    const syncFrequencyMinutes = parseSyncFrequencyMinutes(externalForms.payment.syncFrequencyMinutes);

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
        authConfig
      );
      const message = response.data?.message || "Stripe configured successfully";
      const mode = response.data?.mode;
      setSuccess(mode === "test" ? `${message} (test mode, no live charges)` : message);
      setStripeSecretKey("");
      setStripePublishableKey("");
      await refreshExternalData();
    } catch (err: any) {
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
        authConfig
      );
      const message = response.data?.message || "Mock payment mode enabled";
      setSuccess(`${message} (no real charges)`);
      setStripeSecretKey("");
      setStripePublishableKey("");
      await refreshExternalData();
    } catch (err: any) {
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
        authConfig
      );
      const url = response.data?.url;
      if (!url) {
        throw new Error("Stripe did not return an onboarding link");
      }
      window.location.assign(url);
    } catch (err: any) {
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
        authConfig
      );
      setStripeConnectStatus(response.data.status || null);
      setSuccess("Stripe payout account status refreshed");
      await refreshExternalData();
    } catch (err: any) {
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
        authConfig
      );
      const url = response.data?.url;
      if (!url) {
        throw new Error("Stripe did not return a checkout link");
      }
      window.location.assign(url);
    } catch (err: any) {
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
        authConfig
      );
      setStripeConnectStatus(response.data.status || null);
      setSuccess("Stripe subscription status refreshed");
      await refreshExternalData();
    } catch (err: any) {
      setError(parseError(err, "Failed to refresh Stripe subscription"));
    } finally {
      setRefreshingStripeSubscription(false);
    }
  };

  const testExternalIntegration = async (type: ExternalIntegrationType) => {
    setError(null);
    setTestingExternalType(type);

    try {
      const response = await axios.post(`${API_URL}/api/external-integrations/${type}/test`, {}, authConfig);
      const message = response.data?.message || `${externalTypeLabels[type]} test succeeded`;
      setSuccess(message);
      await refreshExternalData();
    } catch (err: any) {
      setError(parseError(err, `Failed to test ${externalTypeLabels[type]} integration`));
    } finally {
      setTestingExternalType(null);
    }
  };

  const syncExternalIntegration = async (type: ExternalIntegrationType) => {
    setError(null);
    setSyncingExternalType(type);

    try {
      const response = await axios.post(`${API_URL}/api/external-integrations/${type}/sync`, {}, authConfig);
      const items = response.data?.itemsProcessed;
      const suffix = Number.isFinite(items) ? ` (${items} items)` : "";
      setSuccess(`${externalTypeLabels[type]} sync completed${suffix}`);
      await refreshExternalData();
    } catch (err: any) {
      setError(parseError(err, `Failed to sync ${externalTypeLabels[type]} integration`));
    } finally {
      setSyncingExternalType(null);
    }
  };

  const slackIntegration = integrations.find((i) => i.type === "slack");
  const teamsIntegration = integrations.find((i) => i.type === "teams");

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-600 mt-2">
          Connect messaging channels and external clinical vendors from one page.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <div className="font-semibold">Professional review mode: not live-linked</div>
        <div className="mt-1 text-sm">
          Insurance, Rx/eRx, text messaging, and payments are available for demo workflow testing only.
          Do not use real patient data or expect live payer, pharmacy, SMS carrier, or card network activity from this environment.
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">
            &times;
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
          <button onClick={() => setSuccess(null)} className="float-right font-bold">
            &times;
          </button>
        </div>
      )}

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("external")}
            className={`${
              activeTab === "external"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium`}
          >
            External Vendors
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`${
              activeTab === "notifications"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium`}
          >
            Slack / Teams
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`${
              activeTab === "logs"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium`}
          >
            Notification Logs
          </button>
        </nav>
      </div>

      {activeTab === "external" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              Configure and test claims, eligibility, eRx, labs, payments, and fax providers.
            </div>
            <button
              onClick={() => {
                void refreshExternalData();
              }}
              disabled={refreshingExternal}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {refreshingExternal ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {externalStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Total Calls (7d)</p>
                <p className="text-2xl font-semibold text-gray-900">{externalStats.totalCalls}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Successful</p>
                <p className="text-2xl font-semibold text-green-600">{externalStats.successfulCalls}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Failed</p>
                <p className="text-2xl font-semibold text-red-600">{externalStats.failedCalls}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Avg Duration</p>
                <p className="text-2xl font-semibold text-gray-900">{externalStats.averageDurationMs} ms</p>
              </div>
            </div>
          )}

          {externalIntegrations.map((integration) => {
            const form = externalForms[integration.type];
            const isSaving = savingExternalType === integration.type;
            const isTesting = testingExternalType === integration.type;
            const isSyncing = syncingExternalType === integration.type;
            const ambientProvider = integration.type === "ambient_transcription"
              ? normalizeAmbientProvider(form.provider || integration.provider)
              : null;
            const ambientSetup = ambientProvider ? getAmbientSetupCopy(ambientProvider) : null;
            const eligibilitySetup = integration.type === "eligibility"
              ? getEligibilitySetupCopy(form.provider || integration.provider)
              : null;
            const clearinghouseSetup = integration.type === "clearinghouse"
              ? getClearinghouseSetupCopy(form.provider || integration.provider)
              : null;
            const docsLink = integration.type === "ambient_transcription" && ambientProvider
              ? ambientDocsLinks[ambientProvider]
              : getExternalDocsLink(integration.type, form.provider || integration.provider);
            const providerOptions = externalProviderOptions[integration.type];

            return (
              <div
                key={integration.type}
                id={integration.type === "payment" ? "stripe-payments" : undefined}
                className="bg-white border border-gray-200 rounded-lg shadow-sm"
              >
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {externalTypeLabels[integration.type]}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Provider: {integration.provider || defaultExternalProviders[integration.type]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${connectionBadgeClass[integration.connectionStatus]}`}
                      >
                        {integration.connectionStatus}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          integration.isConfigured
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {integration.isConfigured ? "Configured" : "Not configured"}
                      </span>
                    </div>
                  </div>

                  {integration.lastError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                      {integration.lastError}
                    </div>
                  )}

                  {eligibilitySetup && (
                    <div className="bg-sky-50 border border-sky-200 text-sky-900 px-4 py-3 rounded-lg text-sm space-y-1">
                      <p className="font-medium">{eligibilitySetup.title}</p>
                      {eligibilitySetup.body.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  )}

                  {clearinghouseSetup && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm space-y-1">
                      <p className="font-medium">{clearinghouseSetup.title}</p>
                      {clearinghouseSetup.body.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  )}

                  {integration.type === "ambient_transcription" && ambientSetup && (
                    <div className="bg-violet-50 border border-violet-200 text-violet-900 px-4 py-3 rounded-lg text-sm space-y-1">
                      <p className="font-medium">{ambientSetup.title}</p>
                      {ambientSetup.body.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                      {integration.type === "ambient_transcription" ? (
                        <div className="space-y-2">
                          <select
                            value={ambientProvider || "abridge"}
                            onChange={(e) => {
                              const provider = normalizeAmbientProvider(e.target.value);
                              updateExternalForm(integration.type, {
                                provider,
                                configJson: JSON.stringify(buildAmbientConfigTemplate(provider), null, 2),
                                credentialsJson: JSON.stringify(buildAmbientCredentialsTemplate(provider), null, 2),
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {ambientProviderOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500">Changing the provider reloads the config and credential templates for that provider.</p>
                        </div>
                      ) : providerOptions ? (
                        <div className="space-y-2">
                          <select
                            value={form.provider}
                            onChange={(e) => {
                              const provider = e.target.value;
                              updateExternalForm(integration.type, {
                                provider,
                                configJson: JSON.stringify(buildDefaultConfigTemplate(integration.type, provider), null, 2),
                                credentialsJson: JSON.stringify(buildDefaultCredentialsTemplate(integration.type, provider), null, 2),
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {providerOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500">Changing the provider reloads the config and credential templates for that provider.</p>
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sync Frequency (minutes)
                      </label>
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div className="flex items-end">
                      <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(e) =>
                            updateExternalForm(integration.type, {
                              isActive: e.target.checked,
                            })
                          }
                          className="rounded border-gray-300"
                        />
                        <span>Active</span>
                      </label>
                    </div>
                  </div>

                  {integration.type === "payment" ? (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg text-sm space-y-1">
                        <p className="font-medium">Stripe is split into three separate jobs.</p>
                        <p>Practice payout banking is handled inside Stripe-hosted onboarding. The app stores only account IDs and readiness flags.</p>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">Practice Payout Account</p>
                              <p className="text-xs text-gray-500">Bank/KYC handled by Stripe</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              stripeConnectStatus?.onboardingStatus === "complete"
                                ? "bg-green-100 text-green-700"
                                : stripeConnectStatus?.onboardingStatus === "mock"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {stripeConnectStatus?.onboardingStatus || "not_started"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-gray-500">Charges</p>
                              <p className={stripeConnectStatus?.chargesEnabled ? "text-green-700 font-medium" : "text-gray-700"}>
                                {stripeConnectStatus?.chargesEnabled ? "Enabled" : "Not ready"}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Payouts</p>
                              <p className={stripeConnectStatus?.payoutsEnabled ? "text-green-700 font-medium" : "text-gray-700"}>
                                {stripeConnectStatus?.payoutsEnabled ? "Enabled" : "Not ready"}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 break-all">
                            {stripeConnectStatus?.connectedAccountId || "No connected account yet"}
                          </p>
                          {stripeConnectStatus?.requirementsDue?.length ? (
                            <p className="text-xs text-amber-700">
                              Needs: {stripeConnectStatus.requirementsDue.slice(0, 3).join(", ")}
                              {stripeConnectStatus.requirementsDue.length > 3 ? "..." : ""}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                void startStripeConnectOnboarding();
                              }}
                              disabled={startingStripeConnect}
                              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                            >
                              {startingStripeConnect ? "Opening..." : "Connect Stripe"}
                            </button>
                            <button
                              onClick={() => {
                                void refreshStripeConnect();
                              }}
                              disabled={refreshingStripeConnect}
                              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
                            >
                              {refreshingStripeConnect ? "Refreshing..." : "Refresh"}
                            </button>
                          </div>
                        </div>

                        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">Office Subscription</p>
                              <p className="text-xs text-gray-500">The practice pays us</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              stripeConnectStatus?.subscription.status === "active" || stripeConnectStatus?.subscription.status === "trialing"
                                ? "bg-green-100 text-green-700"
                                : stripeConnectStatus?.subscription.status === "past_due" || stripeConnectStatus?.subscription.status === "unpaid"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}>
                              {stripeConnectStatus?.subscription.status || "not_started"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 break-all">
                            {stripeConnectStatus?.subscription.subscriptionId || stripeConnectStatus?.subscription.checkoutSessionId || "No subscription checkout yet"}
                          </p>
                          {stripeConnectStatus?.subscription.currentPeriodEnd && (
                            <p className="text-xs text-gray-600">
                              Renews {new Date(stripeConnectStatus.subscription.currentPeriodEnd).toLocaleDateString()}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                void startStripeSubscriptionCheckout();
                              }}
                              disabled={startingStripeSubscription}
                              className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
                            >
                              {startingStripeSubscription ? "Opening..." : "Start Subscription"}
                            </button>
                            <button
                              onClick={() => {
                                void refreshStripeSubscription();
                              }}
                              disabled={refreshingStripeSubscription}
                              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
                            >
                              {refreshingStripeSubscription ? "Refreshing..." : "Refresh"}
                            </button>
                          </div>
                        </div>

                        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Patient & Store Payments</p>
                            <p className="text-xs text-gray-500">Checkout, receipts, refunds, revenue posting</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-gray-500">Mode</p>
                              <p className="font-medium text-gray-900">{stripeConnectStatus?.mode || "unknown"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Platform Key</p>
                              <p className={stripeConnectStatus?.platformConfigured ? "text-green-700 font-medium" : "text-amber-700 font-medium"}>
                                {stripeConnectStatus?.platformConfigured ? "Configured" : "Needed"}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Destination</p>
                              <p className={stripeConnectStatus?.destinationChargesEnabled ? "text-green-700 font-medium" : "text-amber-700 font-medium"}>
                                {stripeConnectStatus?.destinationChargesEnabled
                                  ? "Practice account"
                                  : stripeConnectStatus?.mode === "mock"
                                  ? "Mock ledger"
                                  : "Platform only"}
                              </p>
                            </div>
                          </div>
                          {stripeConnectStatus?.disabledReason && (
                            <p className="text-xs text-amber-700">{stripeConnectStatus.disabledReason}</p>
                          )}
                          <p className="text-xs text-gray-500">
                            Store orders continue posting through the existing Stripe webhook and revenue ledger.
                            {stripeConnectStatus?.destinationChargesEnabled
                              ? " Live charges route to the connected practice account."
                              : " Finish payout onboarding before live charges route to the practice bank account."}
                          </p>
                        </div>
                      </div>

                      <details className="border border-gray-200 rounded-lg p-4">
                        <summary className="cursor-pointer text-sm font-medium text-gray-800">
                          Platform key setup
                        </summary>
                        <div className="mt-4 space-y-4">
                          <p className="text-xs text-gray-500">
                            These are platform Stripe keys for this software environment. Provider banking still happens in Stripe Connect onboarding.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Stripe Secret Key
                              </label>
                              <input
                                type="password"
                                value={stripeSecretKey}
                                onChange={(e) => setStripeSecretKey(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                                placeholder="sk_test_..."
                                autoComplete="off"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Stripe Publishable Key
                              </label>
                              <input
                                type="text"
                                value={stripePublishableKey}
                                onChange={(e) => setStripePublishableKey(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                                placeholder="pk_test_..."
                                autoComplete="off"
                              />
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Config (JSON object)
                        </label>
                        <textarea
                          value={form.configJson}
                          onChange={(e) =>
                            updateExternalForm(integration.type, {
                              configJson: e.target.value,
                            })
                          }
                          rows={6}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                          placeholder='{"baseUrl":"https://..."}'
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Credentials (JSON object)
                        </label>
                        <textarea
                          value={form.credentialsJson}
                          onChange={(e) =>
                            updateExternalForm(integration.type, {
                              credentialsJson: e.target.value,
                            })
                          }
                          rows={6}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                          placeholder='{"apiKey":"...","apiSecret":"..."}'
                        />
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    Last sync: {integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : "Never"}
                  </div>

                  {docsLink && (
                    <div className="text-xs">
                      <a
                        href={docsLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Open provider docs
                      </a>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    {integration.type === "payment" ? (
                      <>
                        <button
                          onClick={() => {
                            void configureStripePayment();
                          }}
                          disabled={
                            configuringStripe || !stripeSecretKey.trim() || !stripePublishableKey.trim()
                          }
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {configuringStripe ? "Saving..." : "Save Platform Keys"}
                        </button>
                        <button
                          onClick={() => {
                            void enableMockPaymentMode();
                          }}
                          disabled={enablingMockPayments}
                          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                        >
                          {enablingMockPayments ? "Switching..." : "Use Mock Payments"}
                        </button>
                        <button
                          onClick={() => {
                            void testExternalIntegration(integration.type);
                          }}
                          disabled={isTesting}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
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
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save Configuration"}
                        </button>
                        <button
                          onClick={() => {
                            void testExternalIntegration(integration.type);
                          }}
                          disabled={isTesting}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isTesting ? "Testing..." : "Test Connection"}
                        </button>
                        <button
                          onClick={() => {
                            void syncExternalIntegration(integration.type);
                          }}
                          disabled={isSyncing}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {isSyncing ? "Syncing..." : "Run Sync"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">External Integration Logs</h3>
              {externalLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-6">No external integration logs yet</p>
              ) : (
                <div className="space-y-3">
                  {externalLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-4 rounded-lg border ${
                        log.status === "success"
                          ? "bg-green-50 border-green-200"
                          : log.status === "error"
                          ? "bg-red-50 border-red-200"
                          : "bg-yellow-50 border-yellow-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">
                            {externalTypeLabels[log.integration_type] || log.integration_type} · {log.method} {log.endpoint}
                          </p>
                          <p className="text-sm text-gray-600">
                            {log.provider} · {log.direction}
                            {typeof log.duration_ms === "number" ? ` · ${log.duration_ms}ms` : ""}
                          </p>
                          {log.error_message && (
                            <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <span className="uppercase font-medium">{log.status}</span>
                          <div>{new Date(log.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl font-bold">#</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Slack</h3>
                    <p className="text-sm text-gray-600">
                      {slackIntegration ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
                {slackIntegration ? (
                  <button
                    onClick={() => toggleIntegration(slackIntegration.id, slackIntegration.enabled)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      slackIntegration.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {slackIntegration.enabled ? "Enabled" : "Disabled"}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSlackSetup(!showSlackSetup)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Connect Slack
                  </button>
                )}
              </div>

              {slackIntegration && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Channel:</strong> {slackIntegration.channel_name || "Default"}
                    </p>
                    {slackIntegration.stats && (
                      <div className="mt-2 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="text-lg font-semibold">
                            {slackIntegration.stats.total_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Successful</p>
                          <p className="text-lg font-semibold text-green-600">
                            {slackIntegration.stats.successful_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Failed</p>
                          <p className="text-lg font-semibold text-red-600">
                            {slackIntegration.stats.failed_notifications}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Notification Types</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={slackIntegration.notification_types.includes(type)}
                            onChange={(e) => {
                              const newTypes = e.target.checked
                                ? [...slackIntegration.notification_types, type]
                                : slackIntegration.notification_types.filter((t) => t !== type);
                              void updateNotificationTypes(slackIntegration.id, newTypes);
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{notificationTypeLabels[type]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        void testIntegration(slackIntegration.id);
                      }}
                      disabled={testingId === slackIntegration.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {testingId === slackIntegration.id ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                      onClick={() => {
                        void deleteIntegration(slackIntegration.id);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {showSlackSetup && !slackIntegration && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                    <input
                      type="url"
                      value={slackWebhook}
                      onChange={(e) => setSlackWebhook(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Create an incoming webhook in your Slack workspace
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Channel Name (optional)
                    </label>
                    <input
                      type="text"
                      value={slackChannel}
                      onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="#general"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notification Types
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={slackNotifications.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSlackNotifications([...slackNotifications, type]);
                              } else {
                                setSlackNotifications(slackNotifications.filter((t) => t !== type));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{notificationTypeLabels[type]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        void createSlackIntegration();
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Integration
                    </button>
                    <button
                      onClick={() => setShowSlackSetup(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">T</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Microsoft Teams</h3>
                    <p className="text-sm text-gray-600">
                      {teamsIntegration ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
                {teamsIntegration ? (
                  <button
                    onClick={() => toggleIntegration(teamsIntegration.id, teamsIntegration.enabled)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      teamsIntegration.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {teamsIntegration.enabled ? "Enabled" : "Disabled"}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowTeamsSetup(!showTeamsSetup)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Connect Teams
                  </button>
                )}
              </div>

              {teamsIntegration && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Channel:</strong> {teamsIntegration.channel_name || "Default"}
                    </p>
                    {teamsIntegration.stats && (
                      <div className="mt-2 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="text-lg font-semibold">
                            {teamsIntegration.stats.total_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Successful</p>
                          <p className="text-lg font-semibold text-green-600">
                            {teamsIntegration.stats.successful_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Failed</p>
                          <p className="text-lg font-semibold text-red-600">
                            {teamsIntegration.stats.failed_notifications}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Notification Types</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={teamsIntegration.notification_types.includes(type)}
                            onChange={(e) => {
                              const newTypes = e.target.checked
                                ? [...teamsIntegration.notification_types, type]
                                : teamsIntegration.notification_types.filter((t) => t !== type);
                              void updateNotificationTypes(teamsIntegration.id, newTypes);
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{notificationTypeLabels[type]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        void testIntegration(teamsIntegration.id);
                      }}
                      disabled={testingId === teamsIntegration.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {testingId === teamsIntegration.id ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                      onClick={() => {
                        void deleteIntegration(teamsIntegration.id);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {showTeamsSetup && !teamsIntegration && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                    <input
                      type="url"
                      value={teamsWebhook}
                      onChange={(e) => setTeamsWebhook(e.target.value)}
                      placeholder="https://...webhook.office.com/..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Create an incoming webhook in your Teams channel
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Channel Name (optional)
                    </label>
                    <input
                      type="text"
                      value={teamsChannel}
                      onChange={(e) => setTeamsChannel(e.target.value)}
                      placeholder="General"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notification Types
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={teamsNotifications.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTeamsNotifications([...teamsNotifications, type]);
                              } else {
                                setTeamsNotifications(teamsNotifications.filter((t) => t !== type));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{notificationTypeLabels[type]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        void createTeamsIntegration();
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Integration
                    </button>
                    <button
                      onClick={() => setShowTeamsSetup(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Notifications</h3>
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No notifications sent yet</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border ${
                      log.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">
                            {log.integration_type === "slack" ? "Slack" : "Microsoft Teams"}
                          </span>
                          {log.channel_name && (
                            <span className="text-sm text-gray-600">#{log.channel_name}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {notificationTypeLabels[log.notification_type] || log.notification_type}
                        </p>
                        {!log.success && log.error_message && (
                          <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.success ? "Sent" : "Failed"}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(log.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
