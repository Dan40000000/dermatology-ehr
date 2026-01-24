import {
  registerMessageHandlers,
  broadcastNewMessage,
  broadcastMessageRead,
  broadcastUnreadCountUpdate,
} from "../messageHandlers";

jest.mock("../../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const makeSocket = () => {
  const handlers: Record<string, (data: any) => void> = {};
  const emitMock = jest.fn();
  return {
    socket: {
      user: { id: "user-1", fullName: "User Example" },
      tenantId: "tenant-1",
      on: jest.fn((event: string, cb: any) => {
        handlers[event] = cb;
      }),
      to: jest.fn(() => ({ emit: emitMock })),
      join: jest.fn(),
      leave: jest.fn(),
    },
    handlers,
    emitMock,
  };
};

describe("messageHandlers", () => {
  it("registers and handles typing events", () => {
    const { socket, handlers, emitMock } = makeSocket();

    registerMessageHandlers({} as any, socket as any);

    handlers["message:typing"]({ threadId: "thread-1", isTyping: true });

    expect(socket.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock).toHaveBeenCalledWith(
      "message:typing",
      expect.objectContaining({
        threadId: "thread-1",
        userId: "user-1",
        userName: "User Example",
        isTyping: true,
      })
    );
  });

  it("joins and leaves thread rooms", () => {
    const { socket, handlers } = makeSocket();

    registerMessageHandlers({} as any, socket as any);

    handlers["message:join-thread"]("thread-1");
    handlers["message:leave-thread"]("thread-1");

    expect(socket.join).toHaveBeenCalledWith("thread:thread-1");
    expect(socket.leave).toHaveBeenCalledWith("thread:thread-1");
  });

  it("broadcasts new messages", () => {
    const emitMock = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit: emitMock })),
    };

    broadcastNewMessage(io as any, "tenant-1", "thread-1", {
      id: "msg-1",
      threadId: "thread-1",
      body: "Hello world",
      sender: "user-1",
      createdAt: new Date().toISOString(),
    });

    expect(io.to).toHaveBeenCalledWith("thread:thread-1");
    expect(io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(emitMock.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(["message:new", "message:notification"])
    );
  });

  it("broadcasts read receipts", () => {
    const emitMock = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit: emitMock })),
    };

    broadcastMessageRead(io as any, "tenant-1", "thread-1", {
      messageId: "msg-1",
      threadId: "thread-1",
      readBy: "user-1",
      readAt: new Date().toISOString(),
    });

    expect(io.to).toHaveBeenCalledWith("thread:thread-1");
    expect(emitMock).toHaveBeenCalledWith(
      "message:read",
      expect.objectContaining({ messageId: "msg-1" })
    );
  });

  it("broadcasts unread count updates", () => {
    const emitMock = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit: emitMock })),
    };

    broadcastUnreadCountUpdate(io as any, "tenant-1", "user-1", 3);

    expect(io.to).toHaveBeenCalledWith("user:user-1");
    expect(emitMock).toHaveBeenCalledWith(
      "message:unread-count",
      expect.objectContaining({ unreadCount: 3 })
    );
  });
});
