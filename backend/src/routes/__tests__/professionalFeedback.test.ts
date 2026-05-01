import express from "express";
import request from "supertest";
import { pool } from "../../db/pool";
import { professionalFeedbackRouter } from "../professionalFeedback";

const mockSendEmail = jest.fn();
const mockClientQuery = jest.fn();
const mockPoolQuery = jest.fn();
const mockRelease = jest.fn();

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

jest.mock("../../db/pool", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/api/professional-feedback", professionalFeedbackRouter);
const mockPool = pool as unknown as { connect: jest.Mock; query: jest.Mock };

beforeEach(() => {
  mockSendEmail.mockReset();
  mockClientQuery.mockReset();
  mockPoolQuery.mockReset();
  mockRelease.mockReset();
  mockPool.connect.mockReset();
  mockPool.query.mockReset();
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: mockRelease,
  });
  mockPool.query.mockImplementation(mockPoolQuery);
  mockSendEmail.mockResolvedValue({
    messageId: "feedback-message-id",
    accepted: ["dan@perrysoftwarellc.com"],
    rejected: [],
  });
  mockClientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO professional_feedback (")) {
      return { rows: [{ id: "feedback-1" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
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
    expect(res.body.feedbackId).toBe("feedback-1");
    expect(res.body.emailStatus).toBe("sent");
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO professional_feedback"), expect.any(Array));
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

  it("stores feedback and still returns success when email delivery fails", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("Maximum credits exceeded"));

    const res = await request(app)
      .post("/api/professional-feedback")
      .field("type", "suggestion")
      .field("severity", "suggestion")
      .field("message", "Make the photo timeline easier to scan")
      .field("pageUrl", "http://localhost:5173/photos");

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.feedbackId).toBe("feedback-1");
    expect(res.body.emailStatus).toBe("failed");
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE professional_feedback"),
      expect.arrayContaining(["feedback-1", "failed"])
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
