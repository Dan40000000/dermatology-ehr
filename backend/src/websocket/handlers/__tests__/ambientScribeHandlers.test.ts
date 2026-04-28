jest.mock("../../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../../services/ambientAI", () => ({
  transcribeLiveAudioChunk: jest.fn(),
}));

const loadAmbientModule = () => {
  let registerAmbientScribeHandlers: any;

  jest.isolateModules(() => {
    ({ registerAmbientScribeHandlers } = require("../ambientScribeHandlers"));
  });

  return { registerAmbientScribeHandlers };
};

describe("ambientScribeHandlers", () => {
  it("emits live transcript and working insights while recording", async () => {
    const { pool } = require("../../../db/pool");
    const { transcribeLiveAudioChunk } = require("../../../services/ambientAI");
    const queryMock = pool.query as jest.Mock;
    const transcribeMock = transcribeLiveAudioChunk as jest.Mock;

    queryMock.mockReset();
    transcribeMock.mockReset();

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "rec-1" }], rowCount: 1 }) // verify access
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // recovery chunks
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // save chunk

    transcribeMock.mockResolvedValue({
      text: "Patient reports an itchy rash on the hands after using new detergent.",
      confidence: 0.92,
      source: "live",
    });

    const handlers: Record<string, (data?: any) => Promise<void> | void> = {};
    const socketEmitMock = jest.fn();
    const roomEmitMock = jest.fn();
    const socket = {
      user: { id: "user-1", fullName: "Provider Example" },
      tenantId: "tenant-1",
      data: {},
      on: jest.fn((event: string, cb: any) => {
        handlers[event] = cb;
      }),
      emit: socketEmitMock,
      join: jest.fn(),
      leave: jest.fn(),
    };
    const io = {
      to: jest.fn(() => ({ emit: roomEmitMock })),
    };

    const { registerAmbientScribeHandlers } = loadAmbientModule();
    registerAmbientScribeHandlers(io as any, socket as any);

    await handlers["ambient:join"]({ recordingId: "rec-1" });
    await handlers["ambient:audio-chunk"]({
      recordingId: "rec-1",
      chunkIndex: 0,
      mimeType: "audio/webm",
      data: Buffer.from("audio"),
    });

    expect(socket.join).toHaveBeenCalledWith("ambient:recording:rec-1");
    expect(roomEmitMock).toHaveBeenCalledWith(
      "ambient:transcript",
      expect.objectContaining({
        recordingId: "rec-1",
        text: expect.stringContaining("itchy rash"),
        speakerRole: "patient",
      })
    );
    expect(roomEmitMock).toHaveBeenCalledWith(
      "ambient:insights",
      expect.objectContaining({
        recordingId: "rec-1",
        visitSummary: expect.objectContaining({
          oneLiner: expect.stringMatching(/itchy rash|contact dermatitis|eczema/i),
        }),
        symptoms: expect.arrayContaining([
          expect.objectContaining({ label: expect.stringContaining("Itching") }),
        ]),
        workingDiagnoses: expect.arrayContaining([
          expect.objectContaining({ condition: expect.stringMatching(/contact dermatitis|eczema/i) }),
        ]),
        clinicalActions: expect.arrayContaining([
          expect.objectContaining({ label: expect.stringContaining("Patch testing") }),
        ]),
      })
    );
  });
});
