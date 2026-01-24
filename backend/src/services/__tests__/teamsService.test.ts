import axios from "axios";
import { teamsService, TeamsService } from "../integrations/teamsService";
import { logger } from "../../lib/logger";

jest.mock("axios");
jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const postMock = axios.post as jest.Mock;

describe("TeamsService", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("sendNotification posts a Teams message", async () => {
    postMock.mockResolvedValueOnce({ status: 200 });

    await teamsService.sendNotification("https://webhook.office.com/test", {
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
      "https://webhook.office.com/test",
      expect.objectContaining({
        type: "message",
      }),
      expect.any(Object)
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Teams notification sent successfully",
      expect.objectContaining({
        tenantId: "tenant-1",
        notificationType: "appointment_booked",
      })
    );
  });

  it("sendNotification logs and rethrows errors", async () => {
    postMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      teamsService.sendNotification("https://webhook.office.com/test", {
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
      "Failed to send Teams notification",
      expect.objectContaining({ error: "boom" })
    );
  });

  it("testConnection returns true on success", async () => {
    postMock.mockResolvedValueOnce({ status: 200 });

    const result = await teamsService.testConnection("https://webhook.office.com/test");

    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    postMock.mockRejectedValueOnce(new Error("no"));

    const result = await teamsService.testConnection("https://webhook.office.com/test");

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith("Teams connection test failed", { error: "no" });
  });

  it("createAdaptiveCard builds card with facts and actions", () => {
    const service = new TeamsService();
    const card = service.createAdaptiveCard({
      title: "Title",
      subtitle: "Subtitle",
      text: "Body text",
      themeColor: "123456",
      facts: [
        { title: "A", value: "1" },
        { title: "B", value: "2" },
      ],
      actions: [{ type: "Action.OpenUrl", title: "Open", url: "https://example.com" }],
    });

    expect(card.type).toBe("AdaptiveCard");
    expect(card.version).toBe("1.4");
    expect(card.body).toHaveLength(4);
    expect(card.actions).toHaveLength(1);
  });
});
