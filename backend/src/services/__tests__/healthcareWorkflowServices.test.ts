import {
  getEligibilityService,
  getPrescribingService,
  getPriorAuthService,
} from "../healthcareWorkflowServices";

const originalEnv = process.env;

describe("healthcare workflow service provider guards", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ALLOW_VENDOR_MOCK_FALLBACKS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("allows explicit mock providers in staging", () => {
    process.env.NODE_ENV = "staging";

    expect(() => getEligibilityService("mock")).not.toThrow();
    expect(() => getPrescribingService("mock")).not.toThrow();
    expect(() => getPriorAuthService("mock")).not.toThrow();
  });

  it("blocks non-mock providers from silently falling back to mock in production-like environments", () => {
    process.env.NODE_ENV = "production";

    expect(() => getEligibilityService("stedi")).toThrow(/only mock scaffolding is implemented/i);
    expect(() => getPrescribingService("dosespot")).toThrow(/only mock scaffolding is implemented/i);
    expect(() => getPriorAuthService("covermymeds")).toThrow(/only mock scaffolding is implemented/i);
  });

  it("allows non-mock provider fallback only when explicitly acknowledged", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_VENDOR_MOCK_FALLBACKS = "true";

    expect(() => getEligibilityService("surescripts")).not.toThrow();
    expect(() => getPrescribingService("surescripts")).not.toThrow();
    expect(() => getPriorAuthService("surescripts")).not.toThrow();
  });
});
