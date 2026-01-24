import type { Express } from "express";
import { registerRoutes } from "../registerRoutes";

describe("registerRoutes", () => {
  it("registers core route prefixes and limiters", () => {
    const app = { use: jest.fn() } as unknown as Express;

    registerRoutes(app);

    const calls = (app.use as jest.Mock).mock.calls;
    const hasPath = (path: string) => calls.some((call) => call[0] === path);

    expect(hasPath("/health")).toBe(true);
    expect(hasPath("/api/auth")).toBe(true);
    expect(hasPath("/api/patients")).toBe(true);
    expect(hasPath("/api/analytics")).toBe(true);
    expect(hasPath("/api/cosmetic-treatments")).toBe(true);
    expect(calls.some((call) => call[0] === "/api/upload" && call.length === 3)).toBe(true);
    expect(calls.some((call) => call[0] === "/api/patient-portal" && call.length === 3)).toBe(true);
    expect((app.use as jest.Mock).mock.calls.length).toBeGreaterThan(100);
  });
});
