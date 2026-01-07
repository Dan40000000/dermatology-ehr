import { sendImmediateReminder, sendScheduledReminders, startReminderScheduler } from "../smsReminderScheduler";
import { pool } from "../../db/pool";
import { createTwilioService } from "../twilioService";
import { formatPhoneE164, formatPhoneDisplay } from "../../utils/phone";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../twilioService", () => ({
  createTwilioService: jest.fn(),
}));

jest.mock("../../utils/phone", () => ({
  formatPhoneE164: jest.fn(),
  formatPhoneDisplay: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const createTwilioServiceMock = createTwilioService as jest.Mock;
const formatPhoneMock = formatPhoneE164 as jest.Mock;
const formatDisplayMock = formatPhoneDisplay as jest.Mock;

let tenantRows: any[] = [];
let appointmentRows: any[] = [];
let prefsRows: any[] = [];
let settingsRows: any[] = [];
let appointmentDetailRows: any[] = [];

const twilioServiceMock = {
  sendAppointmentReminder: jest.fn(),
};

const buildClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  tenantRows = [];
  appointmentRows = [];
  prefsRows = [];
  settingsRows = [];
  appointmentDetailRows = [];

  queryMock.mockReset();
  connectMock.mockReset();
  createTwilioServiceMock.mockReset();
  formatPhoneMock.mockReset();
  formatDisplayMock.mockReset();
  twilioServiceMock.sendAppointmentReminder.mockReset();
  (logger.info as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();

  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("appointment_reminders_enabled")) {
      return Promise.resolve({ rows: tenantRows });
    }

    if (sql.includes("a.start_time BETWEEN")) {
      return Promise.resolve({ rows: appointmentRows });
    }

    if (sql.includes("FROM patient_sms_preferences") && sql.includes("appointment_reminders")) {
      return Promise.resolve({ rows: prefsRows });
    }

    if (sql.includes("FROM sms_settings") && sql.includes("is_active = true")) {
      return Promise.resolve({ rows: settingsRows });
    }

    if (sql.includes("FROM appointments") && sql.includes("WHERE a.id =")) {
      return Promise.resolve({ rows: appointmentDetailRows });
    }

    return Promise.resolve({ rows: [] });
  });

  connectMock.mockResolvedValue(buildClient());
  createTwilioServiceMock.mockReturnValue(twilioServiceMock);
  formatPhoneMock.mockImplementation((value: string) => (value ? `+${value}` : null));
  formatDisplayMock.mockImplementation((value: string) => value);
});

describe("smsReminderScheduler", () => {
  it("sends scheduled reminders", async () => {
    tenantRows = [
      {
        tenant_id: "tenant-1",
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_hours_before: 24,
        reminder_template: "Template",
      },
    ];
    appointmentRows = [
      {
        appointmentId: "appt-1",
        patientId: "patient-1",
        patientName: "Pat Lee",
        patientPhone: "5550100",
        providerName: "Dr. Smith",
        appointmentDate: new Date("2024-01-01T10:00:00Z"),
        appointmentTime: "10:00 AM",
        clinicPhone: "5559999",
      },
    ];
    twilioServiceMock.sendAppointmentReminder.mockResolvedValueOnce({
      sid: "sid-1",
      status: "sent",
      body: "body",
      numSegments: 1,
    });

    const result = await sendScheduledReminders();

    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(createTwilioServiceMock).toHaveBeenCalled();
    expect(twilioServiceMock.sendAppointmentReminder).toHaveBeenCalled();
  });

  it("skips opted-out patients", async () => {
    tenantRows = [
      {
        tenant_id: "tenant-1",
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_hours_before: 24,
        reminder_template: "Template",
      },
    ];
    appointmentRows = [
      {
        appointmentId: "appt-1",
        patientId: "patient-1",
        patientName: "Pat Lee",
        patientPhone: "5550100",
        providerName: "Dr. Smith",
        appointmentDate: new Date("2024-01-01T10:00:00Z"),
        appointmentTime: "10:00 AM",
        clinicPhone: "5559999",
      },
    ];
    prefsRows = [{ opted_in: false, appointment_reminders: true }];

    const result = await sendScheduledReminders();

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(twilioServiceMock.sendAppointmentReminder).not.toHaveBeenCalled();
  });

  it("records failed reminder attempts", async () => {
    tenantRows = [
      {
        tenant_id: "tenant-1",
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_hours_before: 24,
        reminder_template: "Template",
      },
    ];
    appointmentRows = [
      {
        appointmentId: "appt-1",
        patientId: "patient-1",
        patientName: "Pat Lee",
        patientPhone: "bad",
        providerName: "Dr. Smith",
        appointmentDate: new Date("2024-01-01T10:00:00Z"),
        appointmentTime: "10:00 AM",
        clinicPhone: "5559999",
      },
    ];
    formatPhoneMock.mockReturnValueOnce(null);

    const result = await sendScheduledReminders();

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(logger.error).toHaveBeenCalled();
  });

  it("continues when tenant processing fails", async () => {
    tenantRows = [
      {
        tenant_id: "tenant-1",
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_hours_before: 24,
        reminder_template: "Template",
      },
    ];
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("appointment_reminders_enabled")) {
        return Promise.resolve({ rows: tenantRows });
      }
      if (sql.includes("a.start_time BETWEEN")) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await sendScheduledReminders();

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(logger.error).toHaveBeenCalled();
  });

  it("fails when tenant lookup fails", async () => {
    queryMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

    await expect(sendScheduledReminders()).rejects.toThrow("boom");
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns an error when SMS settings are missing", async () => {
    const result = await sendImmediateReminder("tenant-1", "appt-1");

    expect(result).toEqual({ success: false, error: "SMS not configured for tenant" });
  });

  it("returns an error when appointment is missing", async () => {
    settingsRows = [
      {
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_template: "Template",
      },
    ];

    const result = await sendImmediateReminder("tenant-1", "appt-1");

    expect(result).toEqual({ success: false, error: "Appointment not found" });
  });

  it("blocks reminders for opted-out patients", async () => {
    settingsRows = [
      {
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_template: "Template",
      },
    ];
    appointmentDetailRows = [
      {
        appointmentId: "appt-1",
        patientId: "patient-1",
        patientName: "Pat Lee",
        patientPhone: "5550100",
        providerName: "Dr. Smith",
        appointmentDate: new Date("2024-01-01T10:00:00Z"),
        appointmentTime: "10:00 AM",
        clinicPhone: "5559999",
      },
    ];
    prefsRows = [{ opted_in: false, appointment_reminders: true }];

    const result = await sendImmediateReminder("tenant-1", "appt-1");

    expect(result).toEqual({ success: false, error: "Patient has opted out of SMS" });
  });

  it("sends immediate reminders", async () => {
    settingsRows = [
      {
        twilio_account_sid: "sid",
        twilio_auth_token: "token",
        twilio_phone_number: "+15550001",
        reminder_template: "Template",
      },
    ];
    appointmentDetailRows = [
      {
        appointmentId: "appt-1",
        patientId: "patient-1",
        patientName: "Pat Lee",
        patientPhone: "5550100",
        providerName: "Dr. Smith",
        appointmentDate: new Date("2024-01-01T10:00:00Z"),
        appointmentTime: "10:00 AM",
        clinicPhone: "5559999",
      },
    ];
    twilioServiceMock.sendAppointmentReminder.mockResolvedValueOnce({
      sid: "sid-1",
      status: "sent",
      body: "body",
      numSegments: 1,
    });

    const result = await sendImmediateReminder("tenant-1", "appt-1");

    expect(result).toEqual({ success: true });
    expect(createTwilioServiceMock).toHaveBeenCalled();
    expect(twilioServiceMock.sendAppointmentReminder).toHaveBeenCalled();
  });

  it("starts reminder scheduler with hourly interval", async () => {
    jest.useFakeTimers();
    const intervalSpy = jest.spyOn(global, "setInterval");

    startReminderScheduler();

    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
    expect(logger.info).toHaveBeenCalledWith("SMS reminder scheduler started (runs every hour)");

    jest.clearAllTimers();
    jest.useRealTimers();
    intervalSpy.mockRestore();
  });
});
