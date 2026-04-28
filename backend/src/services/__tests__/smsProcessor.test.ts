import { processIncomingSMS, updateSMSStatus } from "../smsProcessor";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import { formatPhoneE164 } from "../../utils/phone";
import { processWaitlistSMSReply } from "../waitlistNotificationService";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../utils/phone", () => ({
  formatPhoneE164: jest.fn(),
}));

jest.mock("../waitlistNotificationService", () => ({
  processWaitlistSMSReply: jest.fn(),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const formatPhoneMock = formatPhoneE164 as jest.Mock;
const waitlistMock = processWaitlistSMSReply as jest.Mock;

const patient = { id: "patient-1", first_name: "Pat", last_name: "Lee" };

type ClientConfig = {
  patientRows?: any[];
  prefsRows?: any[];
  consentRows?: any[];
  autoResponseRows?: any[];
  threadRows?: any[];
  tenantRows?: any[];
};

const buildClient = (config: ClientConfig) => {
  const query = jest.fn(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("FROM patients")) {
      return { rows: config.patientRows || [] };
    }

    if (sql.includes("FROM patient_sms_preferences")) {
      const prefsRows = (config.prefsRows ?? [{ optedIn: true }]).map((row) => ({
        ...row,
        optedIn: row.optedIn ?? row.opted_in,
        opted_in: row.opted_in ?? row.optedIn,
      }));
      return { rows: prefsRows };
    }

    if (sql.includes("FROM sms_consent")) {
      return { rows: config.consentRows || [] };
    }

    if (sql.includes("FROM sms_auto_responses")) {
      return { rows: config.autoResponseRows || [] };
    }

    if (sql.includes("FROM tenants")) {
      return { rows: config.tenantRows || [] };
    }

    if (sql.includes("FROM patient_message_threads")) {
      return { rows: config.threadRows || [] };
    }

    return { rows: [], rowCount: 0 };
  });

  return { query, release: jest.fn() };
};

const baseParams = {
  messageSid: "sid-1",
  from: "15550100",
  to: "15550200",
  body: "Hello",
  tenantId: "tenant-1",
};

const twilioService = {
  sendSMS: jest.fn(),
};

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  waitlistMock.mockReset();
  formatPhoneMock.mockReset();
  twilioService.sendSMS.mockReset();
  (logger.info as jest.Mock).mockReset();
  (logger.warn as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();

  formatPhoneMock.mockImplementation((value: string) => (value ? `+${value}` : null));
  waitlistMock.mockResolvedValue({ matched: false });
  queryMock.mockResolvedValue({ rows: [] });
});

describe("smsProcessor", () => {
  it("processes waitlist confirmations", async () => {
    const client = buildClient({ patientRows: [patient] });
    connectMock.mockResolvedValueOnce(client);
    waitlistMock.mockResolvedValueOnce({ matched: true, action: "accepted" });
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-out", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "YES",
      },
      twilioService as any
    );

    expect(result.success).toBe(true);
    expect(result.autoResponseSent).toBe(true);
    expect(result.actionPerformed).toBe("waitlist_accepted");
    expect(twilioService.sendSMS).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("processes waitlist declines", async () => {
    const client = buildClient({ patientRows: [patient] });
    connectMock.mockResolvedValueOnce(client);
    waitlistMock.mockResolvedValueOnce({ matched: true, action: "declined" });
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-out", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "NO",
      },
      twilioService as any
    );

    expect(result.success).toBe(true);
    expect(result.actionPerformed).toBe("waitlist_declined");
    expect(twilioService.sendSMS).toHaveBeenCalled();
  });

  it("logs waitlist confirmation send failures", async () => {
    const client = buildClient({ patientRows: [patient] });
    connectMock.mockResolvedValueOnce(client);
    waitlistMock.mockResolvedValueOnce({ matched: true, action: "accepted" });
    twilioService.sendSMS.mockRejectedValueOnce(new Error("send failed"));

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "YES",
      },
      twilioService as any
    );

    expect(result.success).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it("logs opted-out patient messages without replying", async () => {
    const client = buildClient({
      patientRows: [patient],
      prefsRows: [{ optedIn: false }],
    });
    connectMock.mockResolvedValueOnce(client);

    const result = await processIncomingSMS(baseParams, twilioService as any);

    expect(result.success).toBe(true);
    expect(twilioService.sendSMS).not.toHaveBeenCalled();
  });

  it("sends auto-responses and performs actions", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [{ response_text: "Auto reply", action: "opt_out" }],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-auto", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "STOP please",
      },
      twilioService as any
    );

    const touchedPrefs = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("patient_sms_preferences")
    );

    expect(result.success).toBe(true);
    expect(result.autoResponseSent).toBe(true);
    expect(result.autoResponseText).toContain("opted out of text messages");
    expect(result.actionPerformed).toBe("opted_out");
    expect(touchedPrefs).toBe(true);
  });

  it("handles opt-in auto-responses", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [{ response_text: "Opted in", action: "opt_in" }],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-auto", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "START",
      },
      twilioService as any
    );

    const touchedPrefs = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("patient_sms_preferences")
    );

    expect(result.actionPerformed).toBe("opted_in");
    expect(result.autoResponseSent).toBe(true);
    expect(touchedPrefs).toBe(true);
  });

  it("falls back to the legacy sms_messages schema when newer linkage columns are missing", async () => {
    const client = buildClient({ patientRows: [patient] });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-route", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "Need help with billing",
      },
      twilioService as any
    );

    const legacyInsertUsed = client.query.mock.calls.some(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("INSERT INTO sms_messages") &&
        sql.includes("content") &&
        !sql.includes("related_appointment_id")
    );

    expect(result.success).toBe(true);
    expect(legacyInsertUsed).toBe(true);
  });

  it("prefers the consented patient when duplicate records share the same phone number", async () => {
    const consentedPatient = {
      id: "patient-consented",
      first_name: "Daniel",
      last_name: "Perry",
      phone: "541-231-8693",
      created_at: "2026-01-15T21:24:09.609Z",
    };
    const duplicatePatient = {
      id: "patient-duplicate",
      first_name: "Perry",
      last_name: "Daniel",
      phone: "5412318693",
      created_at: "2026-03-11T20:10:21.556Z",
    };

    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("information_schema.columns") && sql.includes("sms_messages")) {
          return { rows: [] };
        }

        if (sql.includes("FROM patients")) {
          return { rows: [duplicatePatient, consentedPatient] };
        }

        if (sql.includes("FROM patient_sms_preferences")) {
          if (params?.[1] === "patient-consented") {
            return { rows: [{ optedIn: true, opted_in: true }] };
          }
          return { rows: [] };
        }

        if (sql.includes("FROM sms_consent")) {
          if (params?.[1] === "patient-consented") {
            return {
              rows: [
                {
                  id: "consent-1",
                  patientId: "patient-consented",
                  consentGiven: true,
                  consentRevoked: false,
                  expirationDate: null,
                },
              ],
            };
          }
          if (params?.[1] === "patient-duplicate") {
            return {
              rows: [
                {
                  id: "consent-dup",
                  patientId: "patient-duplicate",
                  consentGiven: false,
                  consentRevoked: false,
                  expirationDate: null,
                },
              ],
            };
          }
          return { rows: [] };
        }

        if (sql.includes("FROM patient_message_threads")) {
          if (params?.[1] === "patient-consented") {
            return { rows: [{ id: "thread-1", category: "general", status: "open" }] };
          }
          return { rows: [] };
        }

        return { rows: [], rowCount: 0 };
      }),
    };

    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-route", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "Need billing help",
      },
      twilioService as any
    );

    const inboundInsert = client.query.mock.calls.find(
      ([sql, params]) =>
        typeof sql === "string" &&
        sql.includes("INSERT INTO sms_messages") &&
        Array.isArray(params) &&
        params.includes("Need billing help")
    );

    expect(result.actionPerformed).toBe("routed_billing");
    expect(inboundInsert?.[1]).toContain("patient-consented");
  });

  it.each([
    ["confirm_appointment", "appointment_confirmed"],
    ["cancel_appointment", "appointment_cancel_requested"],
    ["request_reschedule", "appointment_reschedule_requested"],
  ])("handles %s auto-response actions", async (action, expected) => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [{ response_text: "Auto reply", action }],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-auto", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "YES",
      },
      twilioService as any
    );

    const touchedReminders = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("appointment_sms_reminders")
    );

    expect(result.actionPerformed).toBe(expected);
    expect(touchedReminders).toBe(true);
  });

  it("handles unknown auto-response actions", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [{ response_text: "Auto reply", action: "unknown_action" }],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-auto", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(baseParams, twilioService as any);

    expect(result.actionPerformed).toBe("no_action");
    expect(result.autoResponseSent).toBe(true);
  });

  it("continues when auto-response delivery fails", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [{ response_text: "Auto reply", action: "help" }],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockRejectedValueOnce(new Error("send failed"));

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "HELP",
      },
      twilioService as any
    );

    expect(result.success).toBe(true);
    expect(result.autoResponseSent).toBe(false);
  });

  it("creates message threads for patient conversations", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [],
      threadRows: [],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-route", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(baseParams, twilioService as any);

    const createdThread = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO patient_message_threads")
    );

    expect(result.success).toBe(true);
    expect(result.actionPerformed).toBe("triage_requested");
    expect(createdThread).toBe(true);
    expect(twilioService.sendSMS).toHaveBeenCalled();
  });

  it("requests consent before routing when no SMS consent is on file", async () => {
    const client = buildClient({
      patientRows: [patient],
      prefsRows: [],
      autoResponseRows: [],
      threadRows: [],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-consent", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(baseParams, twilioService as any);

    const createdPendingConsent = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO sms_consent")
    );

    expect(result.success).toBe(true);
    expect(result.actionPerformed).toBe("consent_requested");
    expect(createdPendingConsent).toBe(true);
  });

  it("uses existing message thread when available", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [],
      threadRows: [{ id: "thread-1", category: "billing", status: "open" }],
    });
    connectMock.mockResolvedValueOnce(client);

    const result = await processIncomingSMS(baseParams, twilioService as any);

    const createdThread = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO patient_message_threads")
    );

    expect(result.success).toBe(true);
    expect(createdThread).toBe(false);
  });

  it("routes explicit billing texts to the billing group", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [],
      threadRows: [{ id: "thread-1", category: "general", status: "open" }],
    });
    connectMock.mockResolvedValueOnce(client);
    twilioService.sendSMS.mockResolvedValueOnce({ sid: "sid-billing", status: "sent", numSegments: 1 });

    const result = await processIncomingSMS(
      {
        ...baseParams,
        body: "I have a billing question about my balance",
      },
      twilioService as any
    );

    const routedThread = client.query.mock.calls.some(
      ([sql, params]) =>
        typeof sql === "string" &&
        sql.includes("UPDATE patient_message_threads") &&
        Array.isArray(params) &&
        params.includes("billing")
    );

    expect(result.success).toBe(true);
    expect(result.actionPerformed).toBe("routed_billing");
    expect(result.autoResponseSent).toBe(true);
    expect(routedThread).toBe(true);
  });

  it("logs messages from unknown patients", async () => {
    const client = buildClient({
      patientRows: [],
      autoResponseRows: [],
    });
    connectMock.mockResolvedValueOnce(client);

    const result = await processIncomingSMS(baseParams, twilioService as any);

    expect(result.success).toBe(true);
    expect(waitlistMock).not.toHaveBeenCalled();
  });

  it("rejects invalid phone numbers", async () => {
    const client = buildClient({});
    connectMock.mockResolvedValueOnce(client);
    formatPhoneMock.mockReturnValueOnce(null);

    await expect(processIncomingSMS(baseParams, twilioService as any)).rejects.toThrow("Invalid phone numbers");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("updates SMS status for delivered messages", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await updateSMSStatus("sid-1", "delivered");

    const updateSql = queryMock.mock.calls[0][0] as string;
    expect(updateSql).toContain("delivered_at");
    expect(logger.info).toHaveBeenCalled();
  });

  it("updates SMS status with error details for undelivered messages", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await updateSMSStatus("sid-2", "undelivered", "30007", "Carrier violation");

    const updateSql = queryMock.mock.calls[0][0] as string;
    const updateParams = queryMock.mock.calls[0][1] as any[];
    expect(updateSql).toContain("failed_at");
    expect(updateSql).toContain("error_message");
    expect(updateParams[1]).toContain("Twilio error 30007");
    expect(updateParams[1]).toContain("Carrier violation");
  });

  it("surfaces status update failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    await expect(updateSMSStatus("sid-1", "failed")).rejects.toThrow("boom");
    expect(logger.error).toHaveBeenCalled();
  });
});
