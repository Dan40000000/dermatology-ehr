import request from "supertest";
import express from "express";
import { photosRouter } from "../photos";
import { pool } from "../../db/pool";

// Mock crypto with requireActual to preserve createHash
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "mock-uuid-photo-1234"),
}));

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/photos", photosRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Photos routes", () => {
  describe("GET /photos", () => {
    it("returns all photos for tenant", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "photo-1",
            patientId: "patient-1",
            url: "https://example.com/photo1.jpg",
            photoType: "clinical",
          },
          {
            id: "photo-2",
            patientId: "patient-2",
            url: "https://example.com/photo2.jpg",
            photoType: "dermoscopy",
          },
        ],
      });

      const res = await request(app).get("/photos");

      expect(res.status).toBe(200);
      expect(res.body.photos).toHaveLength(2);
      expect(res.body.photos[0].id).toBe("photo-1");
    });

    it("filters by patientId", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "photo-1", patientId: "patient-1" }],
      });

      const res = await request(app).get("/photos?patientId=patient-1");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("and patient_id = $2"),
        ["tenant-1", "patient-1"]
      );
    });

    it("filters by photoType", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "photo-1", photoType: "dermoscopy" }],
      });

      const res = await request(app).get("/photos?photoType=dermoscopy");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("and photo_type = $2"),
        ["tenant-1", "dermoscopy"]
      );
    });

    it("filters by bodyLocation", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "photo-1", bodyLocation: "arm" }],
      });

      const res = await request(app).get("/photos?bodyLocation=arm");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("and body_location = $2"),
        ["tenant-1", "arm"]
      );
    });

    it("filters by multiple parameters", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "photo-1" }],
      });

      const res = await request(app).get(
        "/photos?patientId=patient-1&photoType=clinical&bodyLocation=arm"
      );

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("and patient_id = $2"),
        ["tenant-1", "patient-1", "clinical", "arm"]
      );
    });

    it("limits results to 100", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/photos");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("limit 100"),
        ["tenant-1"]
      );
    });
  });

  describe("POST /photos", () => {
    const validPayload = {
      patientId: "patient-1",
      url: "https://example.com/photo.jpg",
      photoType: "clinical",
      bodyLocation: "arm",
      description: "Lesion on right arm",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024000,
    };

    it("creates a new photo", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("mock-uuid-photo-1234");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into photos"),
        expect.arrayContaining([
          "mock-uuid-photo-1234",
          "tenant-1",
          "patient-1",
          null, // encounterId
          "arm",
          null, // lesionId
          "clinical",
          null, // comparisonGroupId
          null, // sequenceNumber
          "https://example.com/photo.jpg",
          "local", // default storage
          null, // objectKey
          null, // category
          null, // bodyRegion
          "Lesion on right arm",
          "photo.jpg",
          "image/jpeg",
          1024000,
        ])
      );
    });

    it("creates photo with minimal required fields", async () => {
      const minimalPayload = {
        patientId: "patient-1",
        url: "/uploads/photo.jpg",
      };

      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send(minimalPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("mock-uuid-photo-1234");
    });

    it("accepts app-relative URLs", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "/uploads/photo.jpg",
      });

      expect(res.status).toBe(201);
    });

    it("accepts https URLs", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "https://example.com/photo.jpg",
      });

      expect(res.status).toBe(201);
    });

    it("accepts http URLs", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "http://example.com/photo.jpg",
      });

      expect(res.status).toBe(201);
    });

    it("returns 400 for invalid URL", async () => {
      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "not-a-valid-url",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for missing patientId", async () => {
      const res = await request(app).post("/photos").send({
        url: "https://example.com/photo.jpg",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid photoType", async () => {
      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "https://example.com/photo.jpg",
        photoType: "invalid-type",
      });

      expect(res.status).toBe(400);
    });

    it("accepts valid photoType enum values", async () => {
      const validTypes = ["clinical", "before", "after", "dermoscopy", "baseline"];

      for (const type of validTypes) {
        queryMock.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).post("/photos").send({
          patientId: "patient-1",
          url: "https://example.com/photo.jpg",
          photoType: type,
        });

        expect(res.status).toBe(201);
      }
    });

    it("accepts valid storage enum values", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "https://example.com/photo.jpg",
        storage: "s3",
        objectKey: "photos/123.jpg",
      });

      expect(res.status).toBe(201);
    });

    it("returns 400 for invalid storage", async () => {
      const res = await request(app).post("/photos").send({
        patientId: "patient-1",
        url: "https://example.com/photo.jpg",
        storage: "invalid-storage",
      });

      expect(res.status).toBe(400);
    });

    it("includes optional fields when provided", async () => {
      const fullPayload = {
        patientId: "patient-1",
        encounterId: "encounter-1",
        bodyLocation: "arm",
        lesionId: "lesion-1",
        photoType: "dermoscopy",
        url: "https://example.com/photo.jpg",
        storage: "s3",
        objectKey: "photos/123.jpg",
        category: "mole",
        bodyRegion: "upper-extremity",
        description: "Suspicious lesion",
        filename: "lesion.jpg",
        mimeType: "image/jpeg",
        fileSize: 2048000,
        comparisonGroupId: "group-1",
        sequenceNumber: 1,
      };

      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos").send(fullPayload);

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into photos"),
        [
          "mock-uuid-photo-1234",
          "tenant-1",
          "patient-1",
          "encounter-1",
          "arm",
          "lesion-1",
          "dermoscopy",
          "group-1",
          1,
          "https://example.com/photo.jpg",
          "s3",
          "photos/123.jpg",
          "mole",
          "upper-extremity",
          "Suspicious lesion",
          "lesion.jpg",
          "image/jpeg",
          2048000,
        ]
      );
    });
  });

  describe("PUT /photos/:id/annotate", () => {
    const validAnnotations = {
      shapes: [
        {
          type: "circle",
          x: 100,
          y: 150,
          radius: 25,
          color: "#FF0000",
          thickness: 2,
        },
        {
          type: "arrow",
          x: 200,
          y: 250,
          color: "#00FF00",
        },
      ],
    };

    it("updates photo annotations", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put("/photos/photo-1/annotate")
        .send(validAnnotations);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("update photos set annotations = $1"),
        [JSON.stringify(validAnnotations), "photo-1", "tenant-1"]
      );
    });

    it("accepts all shape types", async () => {
      const allShapes = {
        shapes: [
          { type: "arrow", x: 10, y: 10, color: "#000000" },
          { type: "circle", x: 20, y: 20, radius: 10, color: "#000000" },
          { type: "rectangle", x: 30, y: 30, width: 50, height: 40, color: "#000000" },
          { type: "text", x: 40, y: 40, text: "Note", color: "#000000" },
        ],
      };

      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/photos/photo-1/annotate").send(allShapes);

      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid shape type", async () => {
      const res = await request(app)
        .put("/photos/photo-1/annotate")
        .send({
          shapes: [{ type: "invalid", x: 10, y: 10, color: "#000000" }],
        });

      expect(res.status).toBe(400);
    });

    it("returns 400 for missing required shape fields", async () => {
      const res = await request(app)
        .put("/photos/photo-1/annotate")
        .send({
          shapes: [{ type: "circle", x: 10 }], // missing y, color
        });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid annotations structure", async () => {
      const res = await request(app)
        .put("/photos/photo-1/annotate")
        .send({ invalid: "structure" });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /photos/:id/body-location", () => {
    it("updates photo body location", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put("/photos/photo-1/body-location")
        .send({ bodyLocation: "left-arm" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("update photos set body_location = $1"),
        ["left-arm", "photo-1", "tenant-1"]
      );
    });

    it("returns 400 when bodyLocation is missing", async () => {
      const res = await request(app).put("/photos/photo-1/body-location").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("bodyLocation is required");
    });

    it("returns 400 when bodyLocation is not a string", async () => {
      const res = await request(app)
        .put("/photos/photo-1/body-location")
        .send({ bodyLocation: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("bodyLocation is required");
    });
  });

  describe("POST /photos/comparison-group", () => {
    const validGroupPayload = {
      patientId: "patient-1",
      name: "Mole Progression",
      description: "Tracking mole on left arm over time",
    };

    it("creates a comparison group", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/photos/comparison-group")
        .send(validGroupPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("mock-uuid-photo-1234");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into photo_comparison_groups"),
        [
          "mock-uuid-photo-1234",
          "tenant-1",
          "patient-1",
          "Mole Progression",
          "Tracking mole on left arm over time",
        ]
      );
    });

    it("creates group without description", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/photos/comparison-group").send({
        patientId: "patient-1",
        name: "Group Name",
      });

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into photo_comparison_groups"),
        expect.arrayContaining([
          "mock-uuid-photo-1234",
          "tenant-1",
          "patient-1",
          "Group Name",
          null,
        ])
      );
    });

    it("returns 400 for missing patientId", async () => {
      const res = await request(app).post("/photos/comparison-group").send({
        name: "Group Name",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for missing name", async () => {
      const res = await request(app).post("/photos/comparison-group").send({
        patientId: "patient-1",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /photos/comparison-group/:id", () => {
    it("returns comparison group with photos", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "group-1",
              tenantId: "tenant-1",
              patientId: "patient-1",
              name: "Mole Progression",
              description: "Tracking over time",
              createdAt: "2024-01-01",
              updatedAt: "2024-01-01",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "photo-1",
              comparisonGroupId: "group-1",
              sequenceNumber: 1,
              url: "https://example.com/photo1.jpg",
            },
            {
              id: "photo-2",
              comparisonGroupId: "group-1",
              sequenceNumber: 2,
              url: "https://example.com/photo2.jpg",
            },
          ],
        });

      const res = await request(app).get("/photos/comparison-group/group-1");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("group-1");
      expect(res.body.name).toBe("Mole Progression");
      expect(res.body.photos).toHaveLength(2);
      expect(res.body.photos[0].id).toBe("photo-1");
    });

    it("returns 404 when group not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/photos/comparison-group/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Comparison group not found");
    });

    it("returns group with empty photos array", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "group-1",
              name: "Empty Group",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/photos/comparison-group/group-1");

      expect(res.status).toBe(200);
      expect(res.body.photos).toHaveLength(0);
    });
  });

  describe("GET /photos/patient/:patientId/timeline", () => {
    it("returns patient photo timeline", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "photo-3",
            patientId: "patient-1",
            photoType: "clinical",
            createdAt: "2024-01-03T10:00:00Z",
          },
          {
            id: "photo-2",
            patientId: "patient-1",
            photoType: "dermoscopy",
            createdAt: "2024-01-02T10:00:00Z",
          },
          {
            id: "photo-1",
            patientId: "patient-1",
            photoType: "baseline",
            createdAt: "2024-01-01T10:00:00Z",
          },
        ],
      });

      const res = await request(app).get("/photos/patient/patient-1/timeline");

      expect(res.status).toBe(200);
      expect(res.body.photos).toHaveLength(3);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("order by created_at desc"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns empty array when patient has no photos", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/photos/patient/patient-1/timeline");

      expect(res.status).toBe(200);
      expect(res.body.photos).toHaveLength(0);
    });
  });
});
