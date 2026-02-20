import request from "supertest";
import express from "express";
import telemedicineRouter from "../telemedicine";
import * as telemedicineService from "../../services/telemedicineService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "123", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../services/telemedicineService", () => ({
  createVideoSession: jest.fn(),
  joinSession: jest.fn(),
  startSession: jest.fn(),
  endSession: jest.fn(),
  capturePhoto: jest.fn(),
  getWaitingRoom: jest.fn(),
  addToWaitingRoom: jest.fn(),
  updateDeviceCheck: jest.fn(),
  callNextPatient: jest.fn(),
  addParticipant: jest.fn(),
  recordConsent: jest.fn(),
  checkConsent: jest.fn(),
  getSessionDetails: jest.fn(),
  getProviderSessions: jest.fn(),
  getOrCreateSessionNotes: jest.fn(),
  updateSessionNotes: jest.fn(),
  getProviderSettings: jest.fn(),
  updateProviderSettings: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/telemedicine", telemedicineRouter);

const createVideoSessionMock = telemedicineService.createVideoSession as jest.Mock;
const getSessionDetailsMock = telemedicineService.getSessionDetails as jest.Mock;
const getProviderSettingsMock = telemedicineService.getProviderSettings as jest.Mock;
const updateProviderSettingsMock = telemedicineService.updateProviderSettings as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Telemedicine routes", () => {
  it("POST /telemedicine/sessions creates a session", async () => {
    createVideoSessionMock.mockResolvedValueOnce({ id: 1, appointmentId: 22 });

    const res = await request(app).post("/telemedicine/sessions").send({ appointmentId: 22 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(createVideoSessionMock).toHaveBeenCalledWith("tenant-1", 22, {
      enableRecording: undefined,
      enableWaitingRoom: undefined,
      maxParticipants: undefined,
    });
  });

  it("POST /telemedicine/sessions returns 500 on create error", async () => {
    createVideoSessionMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/telemedicine/sessions").send({ appointmentId: 22 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("boom");
  });

  it("GET /telemedicine/sessions/:id returns 404 when missing", async () => {
    getSessionDetailsMock.mockResolvedValueOnce(null);

    const res = await request(app).get("/telemedicine/sessions/9");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Session not found");
  });

  it("GET /telemedicine/settings returns 500 on service error", async () => {
    getProviderSettingsMock.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(app).get("/telemedicine/settings");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch settings");
  });

  it("PATCH /telemedicine/settings updates provider settings", async () => {
    updateProviderSettingsMock.mockResolvedValueOnce({ waiting_room_enabled: true });

    const res = await request(app)
      .patch("/telemedicine/settings")
      .send({ waitingRoomEnabled: true });

    expect(res.status).toBe(200);
    expect(updateProviderSettingsMock).toHaveBeenCalledWith("tenant-1", 123, {
      virtual_background_url: undefined,
      virtual_background_type: undefined,
      waiting_room_enabled: true,
      auto_record: undefined,
      max_duration_minutes: undefined,
      auto_end_warning_minutes: undefined,
      screen_share_enabled: undefined,
      photo_capture_enabled: undefined,
      multi_participant_enabled: undefined,
      max_participants: undefined,
    });
  });
});
