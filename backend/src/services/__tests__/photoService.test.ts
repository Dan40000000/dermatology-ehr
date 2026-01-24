import path from "path";
import { PhotoService } from "../photoService";
import { mkdir, writeFile, unlink } from "fs/promises";
import sharp from "sharp";

let metadataQueue: Array<Record<string, any>> = [];

const createSharpInstance = () => ({
  metadata: jest.fn().mockImplementation(async () => metadataQueue.shift() || {}),
  rotate: jest.fn().mockReturnThis(),
  withMetadata: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from("processed")),
  toFile: jest.fn().mockResolvedValue(undefined),
  composite: jest.fn().mockReturnThis(),
  ensureAlpha: jest.fn().mockReturnThis(),
});

jest.mock("sharp", () => {
  const sharpMock = jest.fn(() => createSharpInstance());
  return { __esModule: true, default: sharpMock };
});

jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "photo-uuid"),
}));

const sharpMock = sharp as unknown as jest.Mock;

beforeEach(() => {
  metadataQueue = [];
  sharpMock.mockClear();
  (mkdir as jest.Mock).mockClear();
  (writeFile as jest.Mock).mockClear();
  (unlink as jest.Mock).mockClear();
});

describe("PhotoService", () => {
  it("processPhoto validates size and returns processed metadata", async () => {
    metadataQueue = [
      { width: 5000, height: 3000, format: "jpeg", hasAlpha: false },
      { width: 1200, height: 900, format: "jpeg", hasAlpha: false },
    ];

    const result = await PhotoService.processPhoto(
      Buffer.from("raw"),
      "tenant-1",
      "patient-1",
      "photo.PNG"
    );

    expect(result.filePath).toContain(path.join("uploads", "photos", "tenant-1", "patient-1"));
    expect(result.filePath).toMatch(/photo-uuid\.png$/);
    expect(result.thumbnailPath).toContain(path.join("uploads", "thumbnails", "tenant-1", "patient-1"));
    expect(result.thumbnailPath).toMatch(/photo-uuid_thumb\.jpg$/);
    expect(result.metadata.width).toBe(1200);
    expect(result.metadata.height).toBe(900);
    expect(writeFile).toHaveBeenCalled();
  });

  it("processPhoto throws for oversized files", async () => {
    const oversized = Buffer.alloc(21 * 1024 * 1024, 1);
    await expect(
      PhotoService.processPhoto(oversized, "tenant-1", "patient-1", "photo.jpg")
    ).rejects.toThrow(/File size exceeds maximum/i);
  });

  it("generateComparison builds side-by-side and overlay outputs", async () => {
    metadataQueue = [
      { width: 800, height: 600 },
      { width: 700, height: 500 },
      { width: 800, height: 600 },
    ];

    const sideBySide = await PhotoService.generateComparison(
      "/before.jpg",
      "/after.jpg",
      "tenant-1",
      "patient-1",
      { type: "side_by_side", width: 1200 }
    );

    const overlay = await PhotoService.generateComparison(
      "/before.jpg",
      "/after.jpg",
      "tenant-1",
      "patient-1",
      { type: "overlay" }
    );

    expect(sideBySide).toContain(path.join("uploads", "comparisons", "tenant-1", "patient-1"));
    expect(overlay).toContain(path.join("uploads", "comparisons", "tenant-1", "patient-1"));
    expect(sharpMock).toHaveBeenCalled();
  });

  it("extractMetadata flags GPS data", async () => {
    metadataQueue = [{ exif: Buffer.from("GPS") }];

    const meta = await PhotoService.extractMetadata(Buffer.from("raw"));
    expect(meta.gpsRemoved).toBe(false);
  });

  it("getPhotoStats summarizes counts and sizes", async () => {
    const stats = await PhotoService.getPhotoStats([
      { file_size_bytes: 1024, body_region: "face" },
      { file_size_bytes: 2048, body_region: "arm" },
      { file_size_bytes: 4096, body_region: "face" },
    ]);

    expect(stats.totalCount).toBe(3);
    expect(stats.byRegion.face).toBe(2);
    expect(stats.totalSizeMB).toBeCloseTo((1024 + 2048 + 4096) / 1024 / 1024, 6);
  });

  it("validateImageFile enforces type and size", () => {
    expect(PhotoService.validateImageFile("image/gif", 10).valid).toBe(false);
    expect(PhotoService.validateImageFile("image/jpeg", 25 * 1024 * 1024).valid).toBe(false);
    expect(PhotoService.validateImageFile("image/png", 1024).valid).toBe(true);
  });
});
