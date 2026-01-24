import {
  broadcastAppointmentCreated,
  broadcastAppointmentUpdated,
  broadcastAppointmentCancelled,
  broadcastPatientCheckIn,
} from "../appointmentHandlers";

jest.mock("../../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
  },
}));

describe("appointmentHandlers", () => {
  const appointment = {
    id: "appt-1",
    patientId: "patient-1",
    providerId: "provider-1",
    locationId: "location-1",
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date().toISOString(),
    status: "scheduled",
    appointmentTypeId: "type-1",
  };

  const createIO = () => {
    const emitMock = jest.fn();
    return {
      io: { to: jest.fn(() => ({ emit: emitMock })) },
      emitMock,
    };
  };

  it("broadcasts appointment created", () => {
    const { io, emitMock } = createIO();

    broadcastAppointmentCreated(io as any, "tenant-1", appointment);

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "appointment:created",
      expect.objectContaining({ appointment: expect.objectContaining({ id: "appt-1" }) })
    );
  });

  it("broadcasts appointment updated", () => {
    const { io, emitMock } = createIO();

    broadcastAppointmentUpdated(io as any, "tenant-1", appointment);

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "appointment:updated",
      expect.objectContaining({ appointment: expect.objectContaining({ id: "appt-1" }) })
    );
  });

  it("broadcasts appointment cancelled", () => {
    const { io, emitMock } = createIO();

    broadcastAppointmentCancelled(io as any, "tenant-1", "appt-1", "no show");

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "appointment:cancelled",
      expect.objectContaining({ appointmentId: "appt-1", reason: "no show" })
    );
  });

  it("broadcasts patient check-in", () => {
    const { io, emitMock } = createIO();

    broadcastPatientCheckIn(io as any, "tenant-1", "appt-1", "patient-1", "Pat Patient");

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "patient:checkin",
      expect.objectContaining({ appointmentId: "appt-1", patientId: "patient-1" })
    );
  });
});
