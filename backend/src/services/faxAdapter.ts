/**
 * FaxAdapter Interface
 * Defines the contract for fax service providers.
 * Mock implementation included - no external network calls.
 */

export interface FaxSendOptions {
  to: string;
  from: string;
  subject?: string;
  documentUrl?: string;
  documentId?: string;
  pages?: number;
  metadata?: Record<string, unknown>;
}

export interface FaxSendResult {
  transmissionId: string;
  status: "queued" | "sent" | "failed";
  pages?: number;
  timestamp: string;
  errorMessage?: string;
}

export interface FaxStatusResult {
  transmissionId: string;
  status: "queued" | "sending" | "sent" | "failed";
  pages?: number;
  sentAt?: string;
  errorMessage?: string;
}

export interface InboundFaxData {
  transmissionId: string;
  from: string;
  to: string;
  subject?: string;
  pages: number;
  receivedAt: string;
  documentUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface FaxAdapter {
  sendFax(options: FaxSendOptions): Promise<FaxSendResult>;
  getStatus(transmissionId: string): Promise<FaxStatusResult>;
  receiveWebhook(webhookData: unknown): Promise<InboundFaxData>;
}

export interface MockFaxAdapterOptions {
  delayMs?: number;
  random?: () => number;
  now?: () => number;
}

/**
 * MockFaxAdapter
 * Mock implementation for testing and development.
 * No external network calls - all operations are simulated.
 */
export class MockFaxAdapter implements FaxAdapter {
  private sentFaxes: Map<string, FaxStatusResult> = new Map();
  private delayMs: number;
  private random: () => number;
  private now: () => number;

  constructor(options: MockFaxAdapterOptions = {}) {
    this.delayMs = options.delayMs ?? 2000;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  async sendFax(options: FaxSendOptions): Promise<FaxSendResult> {
    // Simulate network delay
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const transmissionId = `TX-${this.now()}-${this.random().toString(36).substring(7)}`;

    // Simulate 90% success rate
    const success = this.random() > 0.1;

    if (!success) {
      const errorMessage = "Fax transmission failed: No answer";
      this.sentFaxes.set(transmissionId, {
        transmissionId,
        status: "failed",
        pages: options.pages || 1,
        errorMessage,
      });

      return {
        transmissionId,
        status: "failed",
        pages: options.pages || 1,
        timestamp: new Date(this.now()).toISOString(),
        errorMessage,
      };
    }

    this.sentFaxes.set(transmissionId, {
      transmissionId,
      status: "sent",
      pages: options.pages || 1,
      sentAt: new Date().toISOString(),
    });

    return {
      transmissionId,
      status: "sent",
      pages: options.pages || 1,
      timestamp: new Date(this.now()).toISOString(),
    };
  }

  async getStatus(transmissionId: string): Promise<FaxStatusResult> {
    const fax = this.sentFaxes.get(transmissionId);

    if (!fax) {
      throw new Error(`Fax not found: ${transmissionId}`);
    }

    return fax;
  }

  async receiveWebhook(webhookData: unknown): Promise<InboundFaxData> {
    const data = webhookData as Record<string, unknown>;

    return {
      transmissionId:
        (data.transmissionId as string) || `RX-${this.now()}-${this.random().toString(36).substring(7)}`,
      from: (data.from as string) || "+15555551234",
      to: (data.to as string) || "+15555550000",
      subject: (data.subject as string) || "Incoming Fax",
      pages: (data.pages as number) || 1,
      receivedAt: (data.receivedAt as string) || new Date(this.now()).toISOString(),
      documentUrl: (data.documentUrl as string) || undefined,
      metadata: (data.metadata as Record<string, unknown>) || {},
    };
  }

  async generateSampleIncomingFax(tenantId: string): Promise<InboundFaxData> {
    const samples = [
      { from: "+15555551234", subject: "Lab Results - Patient Smith, John", pages: 3 },
      { from: "+15555555678", subject: "Referral from Dr. Johnson", pages: 2 },
      { from: "+15555559999", subject: "Insurance Authorization", pages: 1 },
    ];

    const randomIndex = Math.floor(this.random() * samples.length);
    const sample = samples[randomIndex]!;

    return {
      transmissionId: `RX-${this.now()}-${this.random().toString(36).substring(7)}`,
      from: sample.from,
      to: "+15555550000",
      subject: sample.subject,
      pages: sample.pages,
      receivedAt: new Date(this.now()).toISOString(),
      documentUrl: `/sample-fax-${sample.pages}p.pdf`,
      metadata: { tenantId },
    };
  }
}

// Export singleton instance
export const faxAdapter: FaxAdapter = new MockFaxAdapter();
