import {
  getEligibilityService,
  getPrescribingService,
  getPriorAuthService,
} from "../healthcareWorkflowServices";

const originalEnv = process.env;

describe("healthcare workflow service provider guards", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEPLOYMENT_ENV;
    delete process.env.APP_ENV;
    delete process.env.RAILWAY_ENVIRONMENT;
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

  it("blocks explicit mock providers in production", () => {
    process.env.NODE_ENV = "production";

    expect(() => getEligibilityService("mock")).toThrow(/mock adapter is disabled in production/i);
    expect(() => getPrescribingService("mock")).toThrow(/mock adapter is disabled in production/i);
    expect(() => getPriorAuthService("mock")).toThrow(/mock adapter is disabled in production/i);
  });

  it("does not allow the legacy mock flag to bypass production guards", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_VENDOR_MOCK_FALLBACKS = "true";

    expect(() => getEligibilityService("surescripts")).toThrow(/only mock scaffolding is implemented/i);
    expect(() => getPrescribingService("surescripts")).toThrow(/only mock scaffolding is implemented/i);
    expect(() => getPriorAuthService("surescripts")).toThrow(/only mock scaffolding is implemented/i);
    expect(() => getEligibilityService("mock")).toThrow(/mock adapter is disabled in production/i);
    expect(() => getPrescribingService("mock")).toThrow(/mock adapter is disabled in production/i);
    expect(() => getPriorAuthService("mock")).toThrow(/mock adapter is disabled in production/i);
  });
});
