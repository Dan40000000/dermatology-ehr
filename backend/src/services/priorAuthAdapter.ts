/**
 * Prior Authorization Adapter Interface
 * Defines the contract for prior authorization vendor integrations.
 * For MVP: Using mock implementation that returns canned statuses.
 */

export interface PriorAuthRequest {
  id: string;
  tenantId: string;
  patientId: string;
  prescriptionId?: string;
  medicationName?: string;
  medicationStrength?: string;
  medicationQuantity?: number;
  sig?: string;
  payer: string;
  memberId: string;
  prescriberId?: string;
  prescriberNpi?: string;
  prescriberName?: string;
}

export interface PriorAuthSubmitResponse {
  success: boolean;
  status: "submitted" | "approved" | "denied" | "needs_info" | "error";
  statusReason?: string;
  externalReferenceId?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  estimatedDecisionTime?: string;
}

export interface PriorAuthStatusResponse {
  success: boolean;
  status: "pending" | "submitted" | "approved" | "denied" | "needs_info" | "error";
  statusReason?: string;
  externalReferenceId?: string;
  responsePayload: Record<string, unknown>;
  lastUpdated: Date;
}

export interface PriorAuthAdapter {
  submit(request: PriorAuthRequest): Promise<PriorAuthSubmitResponse>;
  checkStatus(requestId: string, externalReferenceId?: string): Promise<PriorAuthStatusResponse>;
}

/**
 * Mock Prior Authorization Adapter
 * Returns canned statuses for testing and development.
 */
export class MockPriorAuthAdapter implements PriorAuthAdapter {
  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async submit(request: PriorAuthRequest): Promise<PriorAuthSubmitResponse> {
    await this.simulateDelay(500, 1500);

    const random = Math.random();
    const externalRefId = `MOCK-PA-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    const requestPayload = {
      vendor: "MockPAVendor",
      timestamp: new Date().toISOString(),
      patientInfo: { id: request.patientId, memberId: request.memberId },
      prescriptionInfo: {
        medicationName: request.medicationName || "Unknown",
        strength: request.medicationStrength,
        quantity: request.medicationQuantity,
        directions: request.sig,
      },
      prescriberInfo: { npi: request.prescriberNpi, name: request.prescriberName },
      payerInfo: { name: request.payer },
    };

    let status: PriorAuthSubmitResponse["status"];
    let statusReason: string;
    let responsePayload: Record<string, unknown>;

    if (random < 0.4) {
      status = "approved";
      statusReason = "Medication is on preferred drug list. Prior authorization approved.";
      responsePayload = {
        approved: true,
        authorizationNumber: externalRefId,
        approvedQuantity: request.medicationQuantity || 30,
        validThrough: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        message: "Auto-approved - Preferred medication on formulary",
      };
    } else if (random < 0.7) {
      status = "submitted";
      statusReason = "Request submitted to medical review team. Decision expected within 48-72 hours.";
      responsePayload = {
        submitted: true,
        referenceNumber: externalRefId,
        estimatedDecision: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        message: "Under review by clinical team",
      };
    } else if (random < 0.9) {
      status = "needs_info";
      statusReason = "Additional documentation required: Please provide recent labs and clinical notes.";
      responsePayload = {
        pendingInfo: true,
        referenceNumber: externalRefId,
        requiredDocuments: ["Lab results from last 30 days", "Documentation of failed prior therapies", "Clinical notes"],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    } else {
      status = "denied";
      statusReason = "Step therapy required. Patient must try formulary alternatives first.";
      responsePayload = {
        approved: false,
        denialReason: "STEP_THERAPY_REQUIRED",
        requiredSteps: ["Trial of methotrexate for 3 months", "Trial of cyclosporine for 3 months"],
        appealDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    return {
      success: true,
      status,
      statusReason,
      externalReferenceId: externalRefId,
      requestPayload,
      responsePayload,
      estimatedDecisionTime: status === "submitted" ? "48-72 hours" : undefined,
    };
  }

  async checkStatus(requestId: string, externalReferenceId?: string): Promise<PriorAuthStatusResponse> {
    await this.simulateDelay(200, 800);

    const hash = this.hashString(requestId);
    const statusIndex = hash % 5;

    const statuses: PriorAuthStatusResponse["status"][] = ["pending", "submitted", "approved", "denied", "needs_info"];
    const status = statuses[statusIndex] as PriorAuthStatusResponse["status"];

    const reasons: Record<PriorAuthStatusResponse["status"], string> = {
      pending: "Request created, not yet submitted to payer",
      submitted: "Under review by payer medical team",
      approved: "Prior authorization approved",
      denied: "Request denied - step therapy required",
      needs_info: "Additional documentation requested",
      error: "An error occurred",
    };

    return {
      success: true,
      status,
      statusReason: reasons[status],
      externalReferenceId: externalReferenceId || `MOCK-${requestId.substring(0, 8)}`,
      responsePayload: { checked: true, timestamp: new Date().toISOString(), source: "MockPAVendor" },
      lastUpdated: new Date(),
    };
  }
}

export function getPriorAuthAdapter(_payer?: string): PriorAuthAdapter {
  // For MVP: Always returns MockPriorAuthAdapter
  // Production: Return adapter based on payer configuration
  return new MockPriorAuthAdapter();
}
