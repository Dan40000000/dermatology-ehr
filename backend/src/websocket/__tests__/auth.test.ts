import jwt from "jsonwebtoken";
import { authenticateSocket } from "../auth";

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

jest.mock("../../config/env", () => ({
  env: { jwtSecret: "secret" },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const verifyMock = jwt.verify as jest.Mock;

const makeSocket = (overrides: any = {}) => ({
  id: "socket-1",
  handshake: { auth: { token: "token-1", tenantId: "tenant-1" } },
  ...overrides,
});

describe("authenticateSocket", () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  it("rejects missing token", () => {
    const socket = makeSocket({ handshake: { auth: { tenantId: "tenant-1" } } });
    const next = jest.fn();

    authenticateSocket(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Authentication token required");
  });

  it("rejects missing tenant ID", () => {
    const socket = makeSocket({ handshake: { auth: { token: "token-1" } } });
    const next = jest.fn();

    authenticateSocket(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Tenant ID required");
  });

  it("rejects mismatched tenant ID", () => {
    verifyMock.mockReturnValueOnce({
      id: "user-1",
      tenantId: "tenant-2",
      fullName: "User Example",
      role: "admin",
    });

    const socket = makeSocket();
    const next = jest.fn();

    authenticateSocket(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Invalid tenant ID");
  });

  it("attaches user on success", () => {
    const decoded = {
      id: "user-1",
      tenantId: "tenant-1",
      fullName: "User Example",
      role: "admin",
    };
    verifyMock.mockReturnValueOnce(decoded);

    const socket = makeSocket();
    const next = jest.fn();

    authenticateSocket(socket as any, next);

    expect(socket.user).toEqual(decoded);
    expect(socket.tenantId).toBe("tenant-1");
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects invalid token", () => {
    verifyMock.mockImplementationOnce(() => {
      throw new Error("bad token");
    });

    const socket = makeSocket();
    const next = jest.fn();

    authenticateSocket(socket as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Invalid authentication token");
  });
});
