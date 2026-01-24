import {
  sendUserNotification,
  broadcastTenantNotification,
  notifyTaskAssignment,
  notifyPriorAuthStatusChange,
  notifyLabResultReady,
  sendUrgentAlert,
} from "../notificationHandlers";

jest.mock("../../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
  },
}));

const createIO = () => {
  const emitMock = jest.fn();
  return {
    io: { to: jest.fn(() => ({ emit: emitMock })) },
    emitMock,
  };
};

describe("notificationHandlers", () => {
  it("sends user notifications", () => {
    const { io, emitMock } = createIO();

    sendUserNotification(io as any, "tenant-1", "user-1", {
      id: "notif-1",
      type: "general",
      title: "Hello",
      message: "World",
      priority: "normal",
      createdAt: new Date().toISOString(),
    });

    expect(io.to).toHaveBeenCalledWith("user:user-1");
    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({ notification: expect.objectContaining({ id: "notif-1" }) })
    );
  });

  it("broadcasts tenant notifications", () => {
    const { io, emitMock } = createIO();

    broadcastTenantNotification(io as any, "tenant-1", {
      id: "notif-2",
      type: "general",
      title: "Notice",
      message: "All hands",
      priority: "normal",
      createdAt: new Date().toISOString(),
    });

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({ notification: expect.objectContaining({ id: "notif-2" }) })
    );
  });

  it("builds task assignment notifications", () => {
    const { io, emitMock } = createIO();

    notifyTaskAssignment(io as any, "tenant-1", "user-1", {
      id: "task-1",
      title: "Follow up",
      priority: "high",
      assignedBy: "admin",
    });

    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({
        notification: expect.objectContaining({
          type: "task_assigned",
          priority: "high",
          relatedEntityId: "task-1",
        }),
      })
    );
  });

  it("builds prior auth notifications", () => {
    const { io, emitMock } = createIO();

    notifyPriorAuthStatusChange(io as any, "tenant-1", "user-1", {
      id: "pa-1",
      patientName: "Pat Patient",
      status: "approved",
    });

    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({
        notification: expect.objectContaining({
          type: "prior_auth_status",
          relatedEntityId: "pa-1",
        }),
      })
    );
  });

  it("builds urgent lab notifications", () => {
    const { io, emitMock } = createIO();

    notifyLabResultReady(io as any, "tenant-1", "user-1", {
      id: "lab-1",
      patientName: "Pat Patient",
      orderType: "Biopsy",
      resultFlag: "panic_value",
    });

    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({
        notification: expect.objectContaining({
          type: "lab_result_ready",
          priority: "urgent",
          relatedEntityId: "lab-1",
        }),
      })
    );
  });

  it("broadcasts urgent alerts", () => {
    const { io, emitMock } = createIO();

    sendUrgentAlert(io as any, "tenant-1", {
      title: "Emergency",
      message: "Call now",
      relatedEntityType: "patient",
      relatedEntityId: "patient-1",
      actionUrl: "/patients/patient-1",
    });

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({
        notification: expect.objectContaining({
          type: "urgent_alert",
          priority: "urgent",
        }),
      })
    );
  });
});
