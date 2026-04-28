import express from "express";
import request from "supertest";
import { professionalFeedbackRouter } from "../professionalFeedback";

const mockSendEmail = jest.fn();

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: "user-1",
      tenantId: "tenant-1",
      role: "provider",
      email: "provider@example.com",
      fullName: "Demo Provider",
    };
    return next();
  },
}));

jest.mock("../../lib/container", () => ({
  getEmailService: () => ({
    sendEmail: mockSendEmail,
  }),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use("/api/professional-feedback", professionalFeedbackRouter);

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({
    messageId: "feedback-message-id",
    accepted: ["dan@perrysoftwarellc.com"],
    rejected: [],
  });
  delete process.env.PROFESSIONAL_FEEDBACK_EMAIL;
});

describe("Professional feedback routes", () => {
  it("emails issue reports with image attachments", async () => {
    const res = await request(app)
      .post("/api/professional-feedback")
      .field("type", "issue")
      .field("severity", "blocker")
      .field("message", "The add procedure button did not work")
      .field("pageUrl", "http://localhost:5173/encounter")
      .attach("attachments", Buffer.from("fake image"), {
        filename: "capture.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "dan@perrysoftwarellc.com",
        subject: expect.stringMatching(/^\[Derm Demo Feedback\] Issue:/),
        attachments: [
          expect.objectContaining({
            filename: "capture.png",
            contentType: "image/png",
          }),
        ],
      })
    );
  });

  it("rejects missing message", async () => {
    const res = await request(app)
      .post("/api/professional-feedback")
      .field("type", "suggestion")
      .field("message", "");

    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
