jest.mock("../../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const loadPresenceModule = () => {
  let registerPresenceHandlers: any;
  let getOnlineUsers: any;
  let getPatientViewers: any;
  let broadcastToPatientViewers: any;

  jest.isolateModules(() => {
    ({
      registerPresenceHandlers,
      getOnlineUsers,
      getPatientViewers,
      broadcastToPatientViewers,
    } = require("../presenceHandlers"));
  });

  return {
    registerPresenceHandlers,
    getOnlineUsers,
    getPatientViewers,
    broadcastToPatientViewers,
  };
};

const makeSocket = () => {
  const handlers: Record<string, (data?: any) => void> = {};
  const emitMock = jest.fn();
  const socket = {
    user: { id: "user-1", fullName: "User Example" },
    tenantId: "tenant-1",
    on: jest.fn((event: string, cb: any) => {
      handlers[event] = cb;
    }),
    to: jest.fn(() => ({ emit: emitMock })),
    join: jest.fn(),
    leave: jest.fn(),
  };

  return { socket, handlers, emitMock };
};

describe("presenceHandlers", () => {
  it("marks user online and broadcasts status", () => {
    const { registerPresenceHandlers, getOnlineUsers } = loadPresenceModule();
    const { socket, emitMock } = makeSocket();
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    registerPresenceHandlers(io as any, socket as any);

    expect(emitMock).toHaveBeenCalledWith(
      "user:online",
      expect.objectContaining({ userId: "user-1", status: "online" })
    );
    expect(getOnlineUsers("tenant-1")).toHaveLength(1);
  });

  it("updates user status and broadcasts", () => {
    const { registerPresenceHandlers } = loadPresenceModule();
    const { socket, handlers, emitMock } = makeSocket();
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    registerPresenceHandlers(io as any, socket as any);
    handlers["user:status"]("away");

    expect(emitMock).toHaveBeenCalledWith(
      "user:status",
      expect.objectContaining({ userId: "user-1", status: "away" })
    );
  });

  it("tracks patient viewers and cleans up on stop", () => {
    const { registerPresenceHandlers, getPatientViewers } = loadPresenceModule();
    const { socket, handlers, emitMock } = makeSocket();
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    registerPresenceHandlers(io as any, socket as any);
    handlers["patient:viewing"]({ patientId: "patient-1", isViewing: true });

    expect(socket.join).toHaveBeenCalledWith("patient:patient-1");
    expect(getPatientViewers("patient-1")).toEqual(["user-1"]);
    expect(emitMock).toHaveBeenCalledWith(
      "patient:viewing",
      expect.objectContaining({ patientId: "patient-1", isViewing: true })
    );

    handlers["patient:viewing"]({ patientId: "patient-1", isViewing: false });
    expect(socket.leave).toHaveBeenCalledWith("patient:patient-1");
    expect(getPatientViewers("patient-1")).toEqual([]);
  });

  it("handles disconnect cleanup", () => {
    const { registerPresenceHandlers, getOnlineUsers, getPatientViewers } = loadPresenceModule();
    const { socket, handlers } = makeSocket();
    const ioEmitMock = jest.fn();
    const io = { to: jest.fn(() => ({ emit: ioEmitMock })) };

    registerPresenceHandlers(io as any, socket as any);
    handlers["patient:viewing"]({ patientId: "patient-1", isViewing: true });
    handlers["disconnect"]();

    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(getOnlineUsers("tenant-1")).toEqual([]);
    expect(getPatientViewers("patient-1")).toEqual([]);
    expect(ioEmitMock.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(["user:offline", "patient:viewing"])
    );
  });

  it("broadcasts to patient viewers", () => {
    const { broadcastToPatientViewers } = loadPresenceModule();
    const emitMock = jest.fn();
    const io = { to: jest.fn(() => ({ emit: emitMock })) };

    broadcastToPatientViewers(io as any, "patient-1", "patient:update", { ok: true });

    expect(io.to).toHaveBeenCalledWith("patient:patient-1");
    expect(emitMock).toHaveBeenCalledWith(
      "patient:update",
      expect.objectContaining({ ok: true })
    );
  });
});
