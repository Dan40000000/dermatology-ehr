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
  autoResponseRows?: any[];
  threadRows?: any[];
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
      return { rows: config.prefsRows || [] };
    }

    if (sql.includes("FROM sms_auto_responses")) {
      return { rows: config.autoResponseRows || [] };
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
      prefsRows: [{ opted_in: false }],
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
    expect(result.autoResponseText).toBe("Auto reply");
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

    const result = await processIncomingSMS(baseParams, twilioService as any);

    const createdThread = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO patient_message_threads")
    );

    expect(result.success).toBe(true);
    expect(createdThread).toBe(true);
  });

  it("uses existing message thread when available", async () => {
    const client = buildClient({
      patientRows: [patient],
      autoResponseRows: [],
      threadRows: [{ id: "thread-1" }],
    });
    connectMock.mockResolvedValueOnce(client);

    const result = await processIncomingSMS(baseParams, twilioService as any);

    const createdThread = client.query.mock.calls.some(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO patient_message_threads")
    );

    expect(result.success).toBe(true);
    expect(createdThread).toBe(false);
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
    expect(updateSql).toContain("failed_at");
    expect(updateSql).toContain("error_code");
    expect(updateSql).toContain("error_message");
  });

  it("surfaces status update failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    await expect(updateSMSStatus("sid-1", "failed")).rejects.toThrow("boom");
    expect(logger.error).toHaveBeenCalled();
  });
});
