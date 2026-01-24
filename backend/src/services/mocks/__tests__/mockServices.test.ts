/**
 * Tests for Mock Service Adapters
 *
 * These tests verify that all mock services implement their interfaces correctly
 * and provide the expected test helper functionality.
 */

import {
  MockS3Service,
  MockTwilioService,
  MockSlackService,
  MockTeamsService,
  MockClamAVService,
  createMockServices,
  getDefaultMocks,
} from "../index";

describe("MockS3Service", () => {
  let service: MockS3Service;

  beforeEach(() => {
    service = new MockS3Service();
  });

  afterEach(() => {
    service.reset();
  });

  describe("putObject", () => {
    it("should store object and return key and signedUrl", async () => {
      const buffer = Buffer.from("test content");
      const result = await service.putObject(buffer, "text/plain", "test.txt");

      expect(result.key).toContain("test.txt");
      expect(result.signedUrl).toBeTruthy();
    });

    it("should store object that can be retrieved", async () => {
      const buffer = Buffer.from("test content");
      const { key } = await service.putObject(buffer, "text/plain", "test.txt");

      const retrieved = await service.fetchObjectBuffer(key);
      expect(retrieved.toString()).toBe("test content");
    });

    it("should log operations", async () => {
      const buffer = Buffer.from("test");
      await service.putObject(buffer, "text/plain", "test.txt");

      const logs = service.getOperationLog();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.operation).toBe("putObject");
      expect(logs[0]?.success).toBe(true);
    });
  });

  describe("getSignedObjectUrl", () => {
    it("should return signed URL for existing object", async () => {
      const buffer = Buffer.from("test");
      const { key } = await service.putObject(buffer, "text/plain", "test.txt");

      const url = await service.getSignedObjectUrl(key, 600);
      expect(url).toBeTruthy();
    });

    it("should throw for non-existent object", async () => {
      await expect(service.getSignedObjectUrl("non-existent")).rejects.toThrow();
    });
  });

  describe("listObjects", () => {
    it("should list all stored objects", async () => {
      await service.putObject(Buffer.from("a"), "text/plain", "a.txt");
      await service.putObject(Buffer.from("b"), "text/plain", "b.txt");

      const result = await service.listObjects();
      expect(result.count).toBe(2);
      expect(result.objects).toHaveLength(2);
    });

    it("should filter by prefix", async () => {
      const { key: key1 } = await service.putObject(Buffer.from("a"), "text/plain", "prefix-a.txt");
      await service.putObject(Buffer.from("b"), "text/plain", "other-b.txt");

      // Get the timestamp prefix from key1
      const prefix = key1.split("-")[0];
      const result = await service.listObjects(prefix);

      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("deleteObject", () => {
    it("should delete existing object", async () => {
      const { key } = await service.putObject(Buffer.from("test"), "text/plain", "test.txt");

      const deleted = await service.deleteObject(key);
      expect(deleted).toBe(true);

      await expect(service.fetchObjectBuffer(key)).rejects.toThrow();
    });

    it("should return false for non-existent object", async () => {
      const deleted = await service.deleteObject("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("configuration", () => {
    it("should support failure rate for chaos testing", async () => {
      service.setConfig({ failureRate: 1 }); // Always fail

      await expect(service.putObject(Buffer.from("test"), "text/plain", "test.txt")).rejects.toThrow();
    });

    it("should support max file size", async () => {
      service.setConfig({ maxFileSize: 5 });

      await expect(
        service.putObject(Buffer.from("too long"), "text/plain", "test.txt")
      ).rejects.toThrow(/exceeds maximum/);
    });
  });
});

describe("MockTwilioService", () => {
  let service: MockTwilioService;

  beforeEach(() => {
    service = new MockTwilioService();
  });

  afterEach(() => {
    service.reset();
  });

  describe("sendSMS", () => {
    it("should send SMS and return result", async () => {
      const result = await service.sendSMS({
        to: "+1234567890",
        from: "+0987654321",
        body: "Test message",
      });

      expect(result.sid).toMatch(/^SM/);
      expect(result.status).toBe("sent");
      expect(result.to).toBe("+1234567890");
      expect(result.body).toBe("Test message");
    });

    it("should store messages for test assertions", async () => {
      await service.sendSMS({
        to: "+1234567890",
        from: "+0987654321",
        body: "Test message",
      });

      const messages = service.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]?.body).toBe("Test message");
    });

    it("should validate phone numbers", async () => {
      await expect(
        service.sendSMS({
          to: "invalid",
          from: "+0987654321",
          body: "Test",
        })
      ).rejects.toThrow(/Invalid phone number/);
    });
  });

  describe("sendAppointmentReminder", () => {
    it("should replace template variables", async () => {
      const result = await service.sendAppointmentReminder("+0987654321", {
        patientPhone: "+1234567890",
        patientName: "John Doe",
        providerName: "Dr. Smith",
        appointmentDate: "2024-01-15",
        appointmentTime: "10:00 AM",
        clinicPhone: "+1111111111",
        template: "Hi {patientName}, reminder for your appointment with {providerName} on {appointmentDate} at {appointmentTime}.",
      });

      expect(result.body).toContain("John Doe");
      expect(result.body).toContain("Dr. Smith");
      expect(result.body).toContain("2024-01-15");
      expect(result.body).toContain("10:00 AM");
    });
  });

  describe("testConnection", () => {
    it("should return success by default", async () => {
      const result = await service.testConnection();
      expect(result.success).toBe(true);
      expect(result.accountName).toBe("Mock Twilio Account");
    });
  });

  describe("helper methods", () => {
    it("should filter messages by recipient", async () => {
      await service.sendSMS({ to: "+1111111111", from: "+0000000000", body: "A" });
      await service.sendSMS({ to: "+2222222222", from: "+0000000000", body: "B" });

      const filtered = service.getMessagesByRecipient("+1111111111");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.body).toBe("A");
    });

    it("should clear messages", async () => {
      await service.sendSMS({ to: "+1234567890", from: "+0987654321", body: "Test" });
      service.clearMessages();

      expect(service.getSentMessages()).toHaveLength(0);
    });
  });
});

describe("MockSlackService", () => {
  let service: MockSlackService;

  beforeEach(() => {
    service = new MockSlackService();
  });

  afterEach(() => {
    service.reset();
  });

  describe("sendNotification", () => {
    it("should send notification and store it", async () => {
      await service.sendNotification("https://hooks.slack.com/test", {
        tenantId: "tenant-1",
        notificationType: "appointment_booked",
        data: { patientName: "John Doe" },
      });

      const notifications = service.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.success).toBe(true);
      expect(notifications[0]?.notificationType).toBe("appointment_booked");
    });

    it("should validate webhook URL", async () => {
      await expect(
        service.sendNotification("invalid-url", {
          tenantId: "tenant-1",
          notificationType: "appointment_booked",
          data: {},
        })
      ).rejects.toThrow(/Invalid webhook URL/);
    });
  });

  describe("testConnection", () => {
    it("should return true for valid URL", async () => {
      const result = await service.testConnection("https://hooks.slack.com/test");
      expect(result).toBe(true);
    });
  });

  describe("helper methods", () => {
    it("should filter by notification type", async () => {
      await service.sendNotification("https://hooks.slack.com/test", {
        tenantId: "t1",
        notificationType: "appointment_booked",
        data: {},
      });
      await service.sendNotification("https://hooks.slack.com/test", {
        tenantId: "t1",
        notificationType: "patient_checked_in",
        data: {},
      });

      const filtered = service.getNotificationsByType("appointment_booked");
      expect(filtered).toHaveLength(1);
    });
  });
});

describe("MockTeamsService", () => {
  let service: MockTeamsService;

  beforeEach(() => {
    service = new MockTeamsService();
  });

  afterEach(() => {
    service.reset();
  });

  describe("sendNotification", () => {
    it("should send notification and store it", async () => {
      await service.sendNotification("https://teams.webhook.office.com/test", {
        tenantId: "tenant-1",
        notificationType: "prior_auth_approved",
        data: { authId: "123" },
      });

      const notifications = service.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.success).toBe(true);
    });
  });

  describe("createAdaptiveCard", () => {
    it("should create valid adaptive card structure", () => {
      const card = service.createAdaptiveCard({
        title: "Test Card",
        subtitle: "Subtitle",
        text: "Card content",
        facts: [{ title: "Key", value: "Value" }],
      });

      expect(card.type).toBe("AdaptiveCard");
      expect(card.version).toBe("1.4");
      expect(card.body.length).toBeGreaterThan(0);
    });
  });
});

describe("MockClamAVService", () => {
  let service: MockClamAVService;

  beforeEach(() => {
    service = new MockClamAVService();
  });

  afterEach(() => {
    service.reset();
  });

  describe("scanBuffer", () => {
    it("should return true for clean files", async () => {
      const buffer = Buffer.from("clean file content");
      const result = await service.scanBuffer(buffer);
      expect(result).toBe(true);
    });

    it("should detect EICAR test signature", async () => {
      const eicarBuffer = MockClamAVService.createEicarTestBuffer();
      const result = await service.scanBuffer(eicarBuffer);
      expect(result).toBe(false);
    });

    it("should store scan results for assertions", async () => {
      await service.scanBuffer(Buffer.from("test"));

      const scans = service.getScans();
      expect(scans).toHaveLength(1);
      expect(scans[0]?.result.clean).toBe(true);
    });
  });

  describe("scanFile", () => {
    it("should detect virus keyword in filename", async () => {
      const result = await service.scanFile("malware_virus_test.exe");
      expect(result).toBe(false);
    });

    it("should pass clean filenames", async () => {
      const result = await service.scanFile("document.pdf");
      expect(result).toBe(true);
    });
  });

  describe("isAvailable", () => {
    it("should return true by default", async () => {
      const result = await service.isAvailable();
      expect(result).toBe(true);
    });

    it("should return false when set unavailable", async () => {
      service.setAvailable(false);
      const result = await service.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe("force modes", () => {
    it("should force infected when configured", async () => {
      service.setForceInfected(true);
      const result = await service.scanBuffer(Buffer.from("clean"));
      expect(result).toBe(false);
    });

    it("should force clean when configured", async () => {
      service.setForceClean(true);
      const eicarBuffer = MockClamAVService.createEicarTestBuffer();
      const result = await service.scanBuffer(eicarBuffer);
      expect(result).toBe(true);
    });
  });
});

describe("Factory Functions", () => {
  describe("createMockServices", () => {
    it("should create all mock services", () => {
      const mocks = createMockServices();

      expect(mocks.s3).toBeInstanceOf(MockS3Service);
      expect(mocks.twilio).toBeInstanceOf(MockTwilioService);
      expect(mocks.slack).toBeInstanceOf(MockSlackService);
      expect(mocks.teams).toBeInstanceOf(MockTeamsService);
      expect(mocks.clamav).toBeInstanceOf(MockClamAVService);
    });

    it("should apply shared configuration", async () => {
      const mocks = createMockServices({ failureRate: 1 });

      await expect(
        mocks.s3.putObject(Buffer.from("test"), "text/plain", "test.txt")
      ).rejects.toThrow();
    });

    it("should reset all services", async () => {
      const mocks = createMockServices();

      await mocks.s3.putObject(Buffer.from("test"), "text/plain", "test.txt");
      await mocks.twilio.sendSMS({ to: "+1234567890", from: "+0987654321", body: "Test" });

      mocks.resetAll();

      expect(mocks.s3.getStoredKeys()).toHaveLength(0);
      expect(mocks.twilio.getSentMessages()).toHaveLength(0);
    });
  });

  describe("getDefaultMocks", () => {
    it("should return singleton instances", () => {
      const mocks1 = getDefaultMocks();
      const mocks2 = getDefaultMocks();

      expect(mocks1.s3).toBe(mocks2.s3);
      expect(mocks1.twilio).toBe(mocks2.twilio);
    });
  });
});
