import request from "supertest";
import express from "express";
import { aiAgentConfigsRouter } from "../aiAgentConfigs";
import { agentConfigService } from "../../services/agentConfigService";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/agentConfigService", () => ({
  agentConfigService: {
    getConfigurations: jest.fn(),
    getDefaultConfiguration: jest.fn(),
    getConfigurationForAppointmentType: jest.fn(),
    getConfiguration: jest.fn(),
    createConfiguration: jest.fn(),
    updateConfiguration: jest.fn(),
    deleteConfiguration: jest.fn(),
    cloneConfiguration: jest.fn(),
    getVersionHistory: jest.fn(),
    getAnalytics: jest.fn(),
    validateConfiguration: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/ai-agent-configs", aiAgentConfigsRouter);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AI Agent Configs Routes", () => {
  describe("GET /ai-agent-configs", () => {
    it("should list all configurations", async () => {
      const mockConfigs = [
        { id: "config-1", name: "Medical Derm", isActive: true },
        { id: "config-2", name: "Cosmetic", isActive: true },
      ];
      (agentConfigService.getConfigurations as jest.Mock).mockResolvedValueOnce(mockConfigs);

      const res = await request(app).get("/ai-agent-configs");

      expect(res.status).toBe(200);
      expect(res.body.configurations).toHaveLength(2);
      expect(agentConfigService.getConfigurations).toHaveBeenCalledWith("tenant-1", {
        activeOnly: true,
        specialtyFocus: undefined,
        appointmentTypeId: undefined,
      });
    });

    it("should filter by specialty focus", async () => {
      (agentConfigService.getConfigurations as jest.Mock).mockResolvedValueOnce([]);

      await request(app).get("/ai-agent-configs?specialtyFocus=cosmetic");

      expect(agentConfigService.getConfigurations).toHaveBeenCalledWith("tenant-1", {
        activeOnly: true,
        specialtyFocus: "cosmetic",
        appointmentTypeId: undefined,
      });
    });

    it("should handle errors", async () => {
      (agentConfigService.getConfigurations as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).get("/ai-agent-configs");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to list configurations");
    });
  });

  describe("GET /ai-agent-configs/default", () => {
    it("should return default configuration", async () => {
      const mockConfig = { id: "config-1", name: "Default", isDefault: true };
      (agentConfigService.getDefaultConfiguration as jest.Mock).mockResolvedValueOnce(mockConfig);

      const res = await request(app).get("/ai-agent-configs/default");

      expect(res.status).toBe(200);
      expect(res.body.configuration.id).toBe("config-1");
    });

    it("should return 404 when no default found", async () => {
      (agentConfigService.getDefaultConfiguration as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app).get("/ai-agent-configs/default");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No default configuration found");
    });

    it("should handle errors", async () => {
      (agentConfigService.getDefaultConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).get("/ai-agent-configs/default");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get default configuration");
    });
  });

  describe("GET /ai-agent-configs/for-appointment/:appointmentTypeId", () => {
    it("should return configuration for appointment type", async () => {
      const mockConfig = { id: "config-1", appointmentTypeId: "appt-1" };
      (agentConfigService.getConfigurationForAppointmentType as jest.Mock).mockResolvedValueOnce(
        mockConfig
      );

      const res = await request(app).get("/ai-agent-configs/for-appointment/appt-1");

      expect(res.status).toBe(200);
      expect(res.body.configuration.id).toBe("config-1");
    });

    it("should return 404 when not found", async () => {
      (agentConfigService.getConfigurationForAppointmentType as jest.Mock).mockResolvedValueOnce(
        null
      );

      const res = await request(app).get("/ai-agent-configs/for-appointment/appt-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No configuration found for this appointment type");
    });

    it("should handle errors", async () => {
      (agentConfigService.getConfigurationForAppointmentType as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).get("/ai-agent-configs/for-appointment/appt-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get configuration");
    });
  });

  describe("GET /ai-agent-configs/:id", () => {
    it("should return specific configuration", async () => {
      const mockConfig = { id: "config-1", name: "Test Config" };
      (agentConfigService.getConfiguration as jest.Mock).mockResolvedValueOnce(mockConfig);

      const res = await request(app).get("/ai-agent-configs/config-1");

      expect(res.status).toBe(200);
      expect(res.body.configuration.id).toBe("config-1");
    });

    it("should return 404 when not found", async () => {
      (agentConfigService.getConfiguration as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app).get("/ai-agent-configs/config-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Configuration not found");
    });

    it("should handle errors", async () => {
      (agentConfigService.getConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).get("/ai-agent-configs/config-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get configuration");
    });
  });

  describe("POST /ai-agent-configs", () => {
    const validConfig = {
      name: "Test Config",
      systemPrompt: "You are a helpful assistant",
      promptTemplate: "Generate a note for {type}",
      noteSections: ["subjective", "objective", "assessment", "plan"],
    };

    it("should create new configuration", async () => {
      const mockConfig = { id: "config-1", ...validConfig };
      (agentConfigService.validateConfiguration as jest.Mock).mockReturnValueOnce({
        valid: true,
        errors: [],
      });
      (agentConfigService.createConfiguration as jest.Mock).mockResolvedValueOnce(mockConfig);

      const res = await request(app).post("/ai-agent-configs").send(validConfig);

      expect(res.status).toBe(201);
      expect(res.body.configuration.id).toBe("config-1");
      expect(auditLog).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "ai_agent_config_create",
        "ai_agent_configuration",
        "config-1"
      );
    });

    it("should reject invalid payload", async () => {
      const res = await request(app).post("/ai-agent-configs").send({ name: "Test" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should reject invalid configuration", async () => {
      (agentConfigService.validateConfiguration as jest.Mock).mockReturnValueOnce({
        valid: false,
        errors: ["Invalid template"],
      });

      const res = await request(app).post("/ai-agent-configs").send(validConfig);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid template");
    });

    it("should handle duplicate name", async () => {
      (agentConfigService.validateConfiguration as jest.Mock).mockReturnValueOnce({
        valid: true,
        errors: [],
      });
      (agentConfigService.createConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("unique constraint violation")
      );

      const res = await request(app).post("/ai-agent-configs").send(validConfig);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("A configuration with this name already exists");
    });

    it("should handle other errors", async () => {
      (agentConfigService.validateConfiguration as jest.Mock).mockReturnValueOnce({
        valid: true,
        errors: [],
      });
      (agentConfigService.createConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).post("/ai-agent-configs").send(validConfig);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create configuration");
    });
  });

  describe("PUT /ai-agent-configs/:id", () => {
    it("should update configuration", async () => {
      const mockConfig = { id: "config-1", name: "Updated Config" };
      (agentConfigService.updateConfiguration as jest.Mock).mockResolvedValueOnce(mockConfig);

      const res = await request(app)
        .put("/ai-agent-configs/config-1")
        .send({ name: "Updated Config" });

      expect(res.status).toBe(200);
      expect(res.body.configuration.name).toBe("Updated Config");
      expect(auditLog).toHaveBeenCalled();
    });

    it("should return 404 when not found", async () => {
      (agentConfigService.updateConfiguration as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .put("/ai-agent-configs/config-1")
        .send({ name: "Updated" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Configuration not found");
    });

    it("should reject invalid payload", async () => {
      const res = await request(app)
        .put("/ai-agent-configs/config-1")
        .send({ temperature: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should handle errors", async () => {
      (agentConfigService.updateConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app)
        .put("/ai-agent-configs/config-1")
        .send({ name: "Updated" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to update configuration");
    });
  });

  describe("DELETE /ai-agent-configs/:id", () => {
    it("should delete configuration", async () => {
      (agentConfigService.deleteConfiguration as jest.Mock).mockResolvedValueOnce(true);

      const res = await request(app).delete("/ai-agent-configs/config-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(auditLog).toHaveBeenCalled();
    });

    it("should return 404 when not found", async () => {
      (agentConfigService.deleteConfiguration as jest.Mock).mockResolvedValueOnce(false);

      const res = await request(app).delete("/ai-agent-configs/config-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Configuration not found");
    });

    it("should reject deleting default config", async () => {
      (agentConfigService.deleteConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("Cannot delete default configuration")
      );

      const res = await request(app).delete("/ai-agent-configs/config-1");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot delete default configuration");
    });

    it("should handle other errors", async () => {
      (agentConfigService.deleteConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).delete("/ai-agent-configs/config-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to delete configuration");
    });
  });

  describe("POST /ai-agent-configs/:id/clone", () => {
    it("should clone configuration", async () => {
      const mockConfig = { id: "config-2", name: "Cloned Config" };
      (agentConfigService.cloneConfiguration as jest.Mock).mockResolvedValueOnce(mockConfig);

      const res = await request(app)
        .post("/ai-agent-configs/config-1/clone")
        .send({ name: "Cloned Config" });

      expect(res.status).toBe(201);
      expect(res.body.configuration.id).toBe("config-2");
      expect(auditLog).toHaveBeenCalled();
    });

    it("should require name", async () => {
      const res = await request(app).post("/ai-agent-configs/config-1/clone").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("New name is required");
    });

    it("should return 404 when original not found", async () => {
      (agentConfigService.cloneConfiguration as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/ai-agent-configs/config-1/clone")
        .send({ name: "Cloned" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Original configuration not found");
    });

    it("should handle duplicate name", async () => {
      (agentConfigService.cloneConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("unique constraint violation")
      );

      const res = await request(app)
        .post("/ai-agent-configs/config-1/clone")
        .send({ name: "Duplicate" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("A configuration with this name already exists");
    });
  });

  describe("GET /ai-agent-configs/:id/versions", () => {
    it("should return version history", async () => {
      const mockVersions = [
        { version: 2, createdAt: new Date() },
        { version: 1, createdAt: new Date() },
      ];
      (agentConfigService.getVersionHistory as jest.Mock).mockResolvedValueOnce(mockVersions);

      const res = await request(app).get("/ai-agent-configs/config-1/versions");

      expect(res.status).toBe(200);
      expect(res.body.versions).toHaveLength(2);
    });

    it("should handle errors", async () => {
      (agentConfigService.getVersionHistory as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app).get("/ai-agent-configs/config-1/versions");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get version history");
    });
  });

  describe("GET /ai-agent-configs/analytics/summary", () => {
    it("should return analytics", async () => {
      const mockAnalytics = { totalUses: 100, avgSatisfaction: 4.5 };
      (agentConfigService.getAnalytics as jest.Mock).mockResolvedValueOnce(mockAnalytics);

      const res = await request(app).get("/ai-agent-configs/analytics/summary");

      expect(res.status).toBe(200);
      expect(res.body.analytics.totalUses).toBe(100);
    });

    it("should handle filters", async () => {
      (agentConfigService.getAnalytics as jest.Mock).mockResolvedValueOnce({});

      await request(app).get(
        "/ai-agent-configs/analytics/summary?configId=config-1&providerId=provider-1"
      );

      expect(agentConfigService.getAnalytics).toHaveBeenCalledWith("tenant-1", {
        configId: "config-1",
        providerId: "provider-1",
        startDate: undefined,
        endDate: undefined,
      });
    });

    it("should handle errors", async () => {
      (agentConfigService.getAnalytics as jest.Mock).mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/ai-agent-configs/analytics/summary");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get analytics");
    });
  });

  describe("POST /ai-agent-configs/:id/test", () => {
    it("should test configuration with sample transcript", async () => {
      const mockConfig = {
        id: "config-1",
        name: "Test Config",
        systemPrompt: "System prompt",
        promptTemplate: "Template",
        noteSections: ["subjective", "objective"],
      };
      (agentConfigService.getConfiguration as jest.Mock).mockResolvedValueOnce(mockConfig);

      const res = await request(app)
        .post("/ai-agent-configs/config-1/test")
        .send({ sampleTranscript: "Patient presents with rash" });

      expect(res.status).toBe(200);
      expect(res.body.configName).toBe("Test Config");
      expect(res.body.previewPrompt).toBeTruthy();
    });

    it("should require sample transcript", async () => {
      const res = await request(app).post("/ai-agent-configs/config-1/test").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Sample transcript is required");
    });

    it("should return 404 when config not found", async () => {
      (agentConfigService.getConfiguration as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/ai-agent-configs/config-1/test")
        .send({ sampleTranscript: "Test" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Configuration not found");
    });

    it("should handle errors", async () => {
      (agentConfigService.getConfiguration as jest.Mock).mockRejectedValueOnce(
        new Error("DB error")
      );

      const res = await request(app)
        .post("/ai-agent-configs/config-1/test")
        .send({ sampleTranscript: "Test" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to test configuration");
    });
  });
});
