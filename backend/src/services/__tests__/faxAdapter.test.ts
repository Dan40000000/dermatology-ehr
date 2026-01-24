import { MockFaxAdapter, FaxSendOptions, MockFaxAdapterOptions } from '../faxAdapter';

const createAdapter = (options: MockFaxAdapterOptions = {}) => {
  let now = 1700000000000;

  return new MockFaxAdapter({
    delayMs: 0,
    random: () => 0.5,
    now: () => ++now,
    ...options,
  });
};

const createSuccessSequenceRandom = (successValues: number[]) => {
  let callCount = 0;
  let successIndex = 0;

  return () => {
    callCount += 1;
    if (callCount % 2 === 1) {
      return 0.5;
    }

    const value = successValues[successIndex % successValues.length];
    successIndex += 1;
    return value;
  };
};

describe('FaxAdapter', () => {
  let adapter: MockFaxAdapter;

  beforeEach(() => {
    adapter = createAdapter();
    jest.clearAllMocks();
  });

  describe('sendFax', () => {
    it('should send a fax and return transmission ID', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        subject: 'Test Fax',
        pages: 3,
      };

      const result = await adapter.sendFax(options);

      expect(result).toHaveProperty('transmissionId');
      expect(result.transmissionId).toMatch(/^TX-/);
      expect(result).toHaveProperty('status');
      expect(['queued', 'sent', 'failed']).toContain(result.status);
      expect(result).toHaveProperty('pages');
      expect(result.pages).toBe(3);
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle successful transmission', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
      };

      const result = await adapter.sendFax(options);

      expect(result.status).toBe('sent');
      expect(result.errorMessage).toBeUndefined();
    });

    it('should handle failed transmission', async () => {
      adapter = createAdapter({ random: () => 0.05 });
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
      };

      const result = await adapter.sendFax(options);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBeDefined();
      expect(result.errorMessage).toContain('Fax transmission failed');
    });

    it('should use default page count of 1 when not provided', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
      };

      const result = await adapter.sendFax(options);

      expect(result.pages).toBe(1);
    });

    it('should include metadata when provided', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        metadata: {
          patientId: 'patient-123',
          documentType: 'lab-results',
        },
      };

      const result = await adapter.sendFax(options);

      expect(result).toBeDefined();
    });

    it('should include subject when provided', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        subject: 'Lab Results for John Doe',
      };

      const result = await adapter.sendFax(options);

      expect(result).toBeDefined();
    });

    it('should include documentUrl when provided', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        documentUrl: 'https://example.com/document.pdf',
      };

      const result = await adapter.sendFax(options);

      expect(result).toBeDefined();
    });

    it('should include documentId when provided', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        documentId: 'doc-123',
      };

      const result = await adapter.sendFax(options);

      expect(result).toBeDefined();
    });

    it('should simulate network delay', async () => {
      adapter = createAdapter({ delayMs: 25 });
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
      };

      const startTime = Date.now();
      await adapter.sendFax(options);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeGreaterThanOrEqual(25);
    });

    it('should store sent fax for status lookup', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        pages: 5,
      };

      const sendResult = await adapter.sendFax(options);
      const statusResult = await adapter.getStatus(sendResult.transmissionId);

      expect(statusResult).toBeDefined();
      expect(statusResult.transmissionId).toBe(sendResult.transmissionId);
    });
  });

  describe('getStatus', () => {
    it('should get status of a sent fax', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        pages: 2,
      };

      const sendResult = await adapter.sendFax(options);
      const status = await adapter.getStatus(sendResult.transmissionId);

      expect(status).toHaveProperty('transmissionId');
      expect(status.transmissionId).toBe(sendResult.transmissionId);
      expect(status).toHaveProperty('status');
      expect(['queued', 'sending', 'sent', 'failed']).toContain(status.status);
    });

    it('should include pages in status', async () => {
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
        pages: 7,
      };

      const sendResult = await adapter.sendFax(options);
      const status = await adapter.getStatus(sendResult.transmissionId);

      expect(status.pages).toBe(7);
    });

    it('should include sentAt for successful faxes', async () => {
      adapter = createAdapter({ random: () => 0.5 });
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
      };

      const sendResult = await adapter.sendFax(options);
      const status = await adapter.getStatus(sendResult.transmissionId);

      expect(status.sentAt).toBeDefined();
    });

    it('should include errorMessage for failed faxes', async () => {
      adapter = createAdapter({ random: () => 0.05 });
      const options: FaxSendOptions = {
        to: '+15555551234',
        from: '+15555550000',
      };

      const sendResult = await adapter.sendFax(options);
      const status = await adapter.getStatus(sendResult.transmissionId);

      expect(status.errorMessage).toBeDefined();
    });

    it('should throw error for nonexistent transmission ID', async () => {
      await expect(adapter.getStatus('nonexistent-id')).rejects.toThrow(
        'Fax not found: nonexistent-id'
      );
    });
  });

  describe('receiveWebhook', () => {
    it('should process incoming webhook data', async () => {
      const webhookData = {
        transmissionId: 'RX-123',
        from: '+15555551234',
        to: '+15555550000',
        subject: 'Incoming Fax',
        pages: 2,
        receivedAt: '2024-01-15T10:00:00Z',
        documentUrl: 'https://example.com/fax.pdf',
        metadata: {
          type: 'medical-record',
        },
      };

      const result = await adapter.receiveWebhook(webhookData);

      expect(result).toHaveProperty('transmissionId');
      expect(result.transmissionId).toBe('RX-123');
      expect(result).toHaveProperty('from');
      expect(result.from).toBe('+15555551234');
      expect(result).toHaveProperty('to');
      expect(result.to).toBe('+15555550000');
      expect(result).toHaveProperty('subject');
      expect(result.subject).toBe('Incoming Fax');
      expect(result).toHaveProperty('pages');
      expect(result.pages).toBe(2);
      expect(result).toHaveProperty('receivedAt');
      expect(result.receivedAt).toBe('2024-01-15T10:00:00Z');
      expect(result).toHaveProperty('documentUrl');
      expect(result.documentUrl).toBe('https://example.com/fax.pdf');
    });

    it('should use default values for missing fields', async () => {
      const webhookData = {};

      const result = await adapter.receiveWebhook(webhookData);

      expect(result.transmissionId).toMatch(/^RX-/);
      expect(result.from).toBe('+15555551234');
      expect(result.to).toBe('+15555550000');
      expect(result.subject).toBe('Incoming Fax');
      expect(result.pages).toBe(1);
      expect(result.receivedAt).toBeDefined();
    });

    it('should preserve metadata', async () => {
      const webhookData = {
        metadata: {
          patientId: 'patient-123',
          documentType: 'referral',
        },
      };

      const result = await adapter.receiveWebhook(webhookData);

      expect(result.metadata).toEqual({
        patientId: 'patient-123',
        documentType: 'referral',
      });
    });
  });

  describe('generateSampleIncomingFax', () => {
    it('should generate a sample incoming fax', async () => {
      const result = await adapter.generateSampleIncomingFax('tenant-123');

      expect(result).toHaveProperty('transmissionId');
      expect(result.transmissionId).toMatch(/^RX-/);
      expect(result).toHaveProperty('from');
      expect(result).toHaveProperty('to');
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('pages');
      expect(result).toHaveProperty('receivedAt');
      expect(result).toHaveProperty('documentUrl');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('tenantId');
      expect(result.metadata.tenantId).toBe('tenant-123');
    });

    it('should generate realistic sample data', async () => {
      const result = await adapter.generateSampleIncomingFax('tenant-456');

      expect(['+15555551234', '+15555555678', '+15555559999']).toContain(result.from);
      expect(result.to).toBe('+15555550000');
      expect(result.pages).toBeGreaterThanOrEqual(1);
      expect(result.pages).toBeLessThanOrEqual(3);
    });

    it('should generate unique transmission IDs', async () => {
      const result1 = await adapter.generateSampleIncomingFax('tenant-123');
      const result2 = await adapter.generateSampleIncomingFax('tenant-123');

      expect(result1.transmissionId).not.toBe(result2.transmissionId);
    });

    it('should include document URL in sample', async () => {
      const result = await adapter.generateSampleIncomingFax('tenant-123');

      expect(result.documentUrl).toMatch(/\/sample-fax-\dp\.pdf/);
    });
  });

  describe('Success rate simulation', () => {
    it('should have approximately 90% success rate over many attempts', async () => {
      adapter = createAdapter({
        random: createSuccessSequenceRandom([
          0.5,
          0.5,
          0.5,
          0.5,
          0.5,
          0.5,
          0.5,
          0.5,
          0.5,
          0.05,
        ]),
      });
      const attempts = 10;
      let successCount = 0;

      for (let i = 0; i < attempts; i++) {
        const result = await adapter.sendFax({
          to: '+15555551234',
          from: '+15555550000',
        });
        if (result.status === 'sent') {
          successCount++;
        }
      }

      const successRate = successCount / attempts;
      expect(successRate).toBeGreaterThan(0.75);
      expect(successRate).toBeLessThan(1.0);
    });
  });
});
