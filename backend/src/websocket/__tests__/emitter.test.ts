import * as emitter from "../emitter";
import { getIO } from "../index";
import { logger } from "../../lib/logger";

jest.mock("../index", () => ({
  getIO: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const getIOMock = getIO as jest.Mock;

describe("websocket emitter", () => {
  beforeEach(() => {
    getIOMock.mockReset();
  });

  it("emits tenant and user events", () => {
    const emitMock = jest.fn();
    const io = { to: jest.fn(() => ({ emit: emitMock })) };
    getIOMock.mockReturnValue(io);

    const now = "2025-01-01T10:00:00Z";
    const appointment = {
      id: "appt-1",
      patientId: "patient-1",
      providerId: "provider-1",
      locationId: "location-1",
      scheduledStart: now,
      scheduledEnd: now,
      status: "scheduled" as const,
      appointmentTypeId: "type-1",
    };
    const patient = { id: "patient-1", firstName: "Pat", lastName: "Patient" };
    const encounter = {
      id: "enc-1",
      patientId: "patient-1",
      providerId: "provider-1",
      status: "draft" as const,
      createdAt: now,
      updatedAt: now,
    };
    const biopsy = {
      id: "bio-1",
      patientId: "patient-1",
      orderingProviderId: "provider-1",
      status: "ordered" as const,
      bodyLocation: "Arm",
      specimenType: "Skin",
      pathLab: "Lab",
      createdAt: now,
    };
    const prescription = {
      id: "rx-1",
      patientId: "patient-1",
      providerId: "provider-1",
      medication: "Med",
      status: "pending" as const,
      createdAt: now,
    };
    const claim = {
      id: "claim-1",
      claimNumber: "CLM-1",
      patientId: "patient-1",
      status: "draft" as const,
      totalCharges: 100,
    };
    const payment = {
      id: "pay-1",
      patientId: "patient-1",
      amount: 50,
      paymentDate: now,
      createdAt: now,
    };
    const priorAuth = {
      id: "pa-1",
      patientId: "patient-1",
      status: "pending" as const,
      serviceType: "Service",
      createdAt: now,
      updatedAt: now,
    };
    const notification = {
      id: "notif-1",
      type: "general" as const,
      title: "Notice",
      message: "Test",
      priority: "normal" as const,
      createdAt: now,
    };

    emitter.emitAppointmentCreated("tenant-1", appointment);
    emitter.emitAppointmentUpdated("tenant-1", appointment);
    emitter.emitAppointmentCancelled("tenant-1", "appt-1", "reason");
    emitter.emitAppointmentCheckedIn("tenant-1", "appt-1", "patient-1", "Pat Patient");
    emitter.emitPatientUpdated("tenant-1", patient);
    emitter.emitPatientInsuranceVerified("tenant-1", "patient-1", { plan: "Plan" });
    emitter.emitPatientBalanceChanged("tenant-1", "patient-1", 10, 20);
    emitter.emitEncounterCreated("tenant-1", encounter);
    emitter.emitEncounterUpdated("tenant-1", encounter);
    emitter.emitEncounterCompleted("tenant-1", "enc-1", "provider-1");
    emitter.emitEncounterSigned("tenant-1", "enc-1", "provider-1");
    emitter.emitBiopsyCreated("tenant-1", biopsy);
    emitter.emitBiopsyUpdated("tenant-1", biopsy);
    emitter.emitBiopsyResultReceived("tenant-1", "bio-1", "patient-1", "Dx");
    emitter.emitBiopsyReviewed("tenant-1", "bio-1", "patient-1", "Dr. Smith");
    emitter.emitPrescriptionCreated("tenant-1", prescription);
    emitter.emitPrescriptionSent("tenant-1", "rx-1", "patient-1", "Med");
    emitter.emitPrescriptionStatusChanged("tenant-1", "rx-1", "sent");
    emitter.emitClaimCreated("tenant-1", claim);
    emitter.emitClaimUpdated("tenant-1", claim);
    emitter.emitClaimStatusChanged("tenant-1", "claim-1", "draft", "submitted");
    emitter.emitClaimSubmitted("tenant-1", "claim-1", "ACME");
    emitter.emitClaimDenied("tenant-1", "claim-1", "Missing info");
    emitter.emitClaimPaid("tenant-1", "claim-1", 150);
    emitter.emitPaymentReceived("tenant-1", payment);
    emitter.emitPaymentPosted("tenant-1", "pay-1", "patient-1", 50);
    emitter.emitPriorAuthCreated("tenant-1", priorAuth);
    emitter.emitPriorAuthStatusChanged("tenant-1", "pa-1", "pending", "approved");
    emitter.emitPriorAuthApproved("tenant-1", "pa-1", "AUTH-1");
    emitter.emitPriorAuthDenied("tenant-1", "pa-1", "Denied");
    emitter.emitNotification("tenant-1", notification);
    emitter.emitNotification("tenant-1", notification, "user-1");

    const events = emitMock.mock.calls.map((call) => call[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        "appointment:created",
        "appointment:updated",
        "appointment:cancelled",
        "appointment:checkedin",
        "patient:updated",
        "patient:insurance_verified",
        "patient:balance_changed",
        "encounter:created",
        "encounter:updated",
        "encounter:completed",
        "encounter:signed",
        "biopsy:created",
        "biopsy:updated",
        "biopsy:result_received",
        "biopsy:reviewed",
        "prescription:created",
        "prescription:sent",
        "prescription:status_changed",
        "claim:created",
        "claim:updated",
        "claim:status_changed",
        "claim:submitted",
        "claim:denied",
        "claim:paid",
        "payment:received",
        "payment:posted",
        "prior_auth:created",
        "prior_auth:status_changed",
        "prior_auth:approved",
        "prior_auth:denied",
        "notification:new",
      ])
    );
    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(io.to).toHaveBeenCalledWith("user:user-1");
  });

  it("logs errors when IO is unavailable", () => {
    getIOMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    emitter.emitAppointmentCreated("tenant-1", {
      id: "appt-1",
      patientId: "patient-1",
      providerId: "provider-1",
      locationId: "location-1",
      scheduledStart: "2025-01-01T10:00:00Z",
      scheduledEnd: "2025-01-01T10:30:00Z",
      status: "scheduled",
      appointmentTypeId: "type-1",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to emit WebSocket event",
      expect.objectContaining({ event: "appointment:created", tenantId: "tenant-1" })
    );
  });
});
