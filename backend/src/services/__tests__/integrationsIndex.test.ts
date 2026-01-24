import * as integrations from "../integrations";

describe("integrations index", () => {
  it("exports integration services", () => {
    expect(integrations.notificationService).toBeDefined();
    expect(integrations.slackService).toBeDefined();
    expect(integrations.teamsService).toBeDefined();
  });
});
