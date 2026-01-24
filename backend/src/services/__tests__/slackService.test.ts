import axios from "axios";
import { slackService } from "../integrations/slackService";
import { logger } from "../../lib/logger";

jest.mock("axios");
jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const postMock = axios.post as jest.Mock;

describe("SlackService", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("sendNotification posts a Slack message", async () => {
    postMock.mockResolvedValueOnce({ status: 200 });

    await slackService.sendNotification("https://hooks.slack.com/services/test", {
      tenantId: "tenant-1",
      notificationType: "appointment_booked",
      data: {
        patientName: "Pat Patient",
        appointmentType: "Consult",
        scheduledStart: "2025-01-01T10:00:00Z",
        scheduledEnd: "2025-01-01T10:30:00Z",
        providerName: "Dr. Smith",
        locationName: "Main Clinic",
      },
    });

    expect(postMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        text: expect.stringContaining("New appointment"),
      }),
      expect.any(Object)
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Slack notification sent successfully",
      expect.objectContaining({
        tenantId: "tenant-1",
        notificationType: "appointment_booked",
      })
    );
  });

  it("sendNotification logs and rethrows errors", async () => {
    postMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      slackService.sendNotification("https://hooks.slack.com/services/test", {
        tenantId: "tenant-1",
        notificationType: "appointment_booked",
        data: {
          patientName: "Pat Patient",
          appointmentType: "Consult",
          scheduledStart: "2025-01-01T10:00:00Z",
          scheduledEnd: "2025-01-01T10:30:00Z",
          providerName: "Dr. Smith",
          locationName: "Main Clinic",
        },
      })
    ).rejects.toThrow("boom");

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send Slack notification",
      expect.objectContaining({ error: "boom" })
    );
  });

  it("testConnection returns true on success", async () => {
    postMock.mockResolvedValueOnce({ status: 200 });

    const result = await slackService.testConnection("https://hooks.slack.com/services/test");

    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    postMock.mockRejectedValueOnce(new Error("no"));

    const result = await slackService.testConnection("https://hooks.slack.com/services/test");

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith("Slack connection test failed", { error: "no" });
  });
});
