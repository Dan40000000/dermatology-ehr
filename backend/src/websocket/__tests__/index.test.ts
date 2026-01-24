import { registerMessageHandlers } from "../handlers/messageHandlers";
import { registerPresenceHandlers } from "../handlers/presenceHandlers";

class MockServer {
  public handlers: Record<string, (...args: any[]) => void> = {};
  public use = jest.fn();
  public on = jest.fn((event: string, cb: (...args: any[]) => void) => {
    this.handlers[event] = cb;
  });
  public to = jest.fn(() => ({ emit: jest.fn() }));
  public close = jest.fn((cb?: () => void) => {
    if (cb) cb();
  });
}

jest.mock("socket.io", () => ({
  Server: MockServer,
}));

jest.mock("../handlers/messageHandlers", () => ({
  registerMessageHandlers: jest.fn(),
}));

jest.mock("../handlers/presenceHandlers", () => ({
  registerPresenceHandlers: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("websocket index", () => {
  it("throws if getIO called before initialization", () => {
    jest.isolateModules(() => {
      const { getIO } = require("../index");
      expect(() => getIO()).toThrow("WebSocket server not initialized");
    });
  });

  it("initializes server and registers middleware", () => {
    jest.isolateModules(() => {
      const { initializeWebSocket } = require("../index");
      const io = initializeWebSocket({} as any) as unknown as MockServer;

      expect(io.use).toHaveBeenCalledWith(expect.any(Function));
      expect(io.on).toHaveBeenCalledWith("connection", expect.any(Function));
    });
  });

  it("disconnects unauthenticated sockets", () => {
    jest.isolateModules(() => {
      const { initializeWebSocket } = require("../index");
      const io = initializeWebSocket({} as any) as unknown as MockServer;
      const connectionHandler = io.handlers["connection"];

      const socket = {
        id: "socket-1",
        user: undefined,
        tenantId: undefined,
        disconnect: jest.fn(),
      };

      connectionHandler(socket as any);
      expect(socket.disconnect).toHaveBeenCalled();
    });
  });

  it("joins rooms and registers handlers for authenticated sockets", () => {
    jest.isolateModules(() => {
      const { initializeWebSocket } = require("../index");
      const io = initializeWebSocket({} as any) as unknown as MockServer;
      const connectionHandler = io.handlers["connection"];

      const socket = {
        id: "socket-1",
        user: { id: "user-1", fullName: "User Example", role: "admin" },
        tenantId: "tenant-1",
        join: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
        on: jest.fn(),
        disconnect: jest.fn(),
      };

      connectionHandler(socket as any);

      expect(socket.join).toHaveBeenCalledWith("tenant:tenant-1");
      expect(socket.join).toHaveBeenCalledWith("user:user-1");
      expect(registerMessageHandlers).toHaveBeenCalledWith(io, socket);
      expect(registerPresenceHandlers).toHaveBeenCalledWith(io, socket);
      expect(socket.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith("disconnect", expect.any(Function));
    });
  });

  it("closes the websocket server", async () => {
    await new Promise<void>((resolve) => {
      jest.isolateModules(async () => {
        const { initializeWebSocket, closeWebSocket, getIO } = require("../index");
        const io = initializeWebSocket({} as any) as unknown as MockServer;

        await closeWebSocket();

        expect(io.close).toHaveBeenCalled();
        expect(() => getIO()).toThrow("WebSocket server not initialized");
        resolve();
      });
    });
  });
});
