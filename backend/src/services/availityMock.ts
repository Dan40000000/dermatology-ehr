/**
 * Mock Availity-style Insurance Eligibility API
 *
 * This service simulates real-time eligibility verification responses
 * from a clearinghouse like Availity, Change Healthcare, or Waystar.
 *
 * In production, this would be replaced with actual API calls to your
 * chosen clearinghouse provider.
 */

export interface EligibilityRequest {
  payerId: string;
  memberId: string;
  patientFirstName: string;
  patientLastName: string;
  patientDob: string; // YYYY-MM-DD
  serviceDate?: string; // YYYY-MM-DD
  providerId?: string;
  serviceTypeCode?: string;
}

export interface EligibilityResponse {
  success: boolean;
  transactionId: string;
  timestamp: string;

  // Patient demographics
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    memberId: string;
    groupNumber?: string;
  };

  // Payer information
  payer: {
    payerId: string;
    payerName: string;
  };

  // Coverage status
  coverage: {
    status: 'active' | 'inactive' | 'terminated' | 'pending';
    effectiveDate?: string;
    terminationDate?: string;
    planName?: string;
    planType?: string; // PPO, HMO, EPO, POS
    coverageLevel?: string; // individual, family, employee+spouse
    coordinationOfBenefits?: 'primary' | 'secondary' | 'tertiary';
  };

  // Subscriber information (if patient is dependent)
  subscriber?: {
    firstName: string;
    lastName: string;
    dob: string;
    relationship: string; // self, spouse, child, other
  };

  // Network information
  network?: {
    inNetwork: boolean;
    networkName?: string;
  };

  // Primary care physician
  pcp?: {
    required: boolean;
    name?: string;
    npi?: string;
  };

  // Benefits
  benefits: {
    // Copays (in cents)
    copays?: {
      specialist?: number;
      primaryCare?: number;
      emergency?: number;
      urgentCare?: number;
    };

    // Deductibles (in cents)
    deductible?: {
      individual?: {
        total: number;
        met: number;
        remaining: number;
      };
      family?: {
        total: number;
        met: number;
        remaining: number;
      };
    };

    // Coinsurance (percentage)
    coinsurance?: {
      percentage: number; // e.g., 20 for 20%
      inNetwork?: number;
      outOfNetwork?: number;
    };

    // Out-of-pocket maximum (in cents)
    outOfPocketMax?: {
      individual?: {
        total: number;
        met: number;
        remaining: number;
      };
      family?: {
        total: number;
        met: number;
        remaining: number;
      };
    };

    // Prior authorization
    priorAuth?: {
      required: boolean;
      services?: string[];
      phone?: string;
    };

    // Referrals
    referral?: {
      required: boolean;
    };
  };

  // Any error or warning messages
  messages?: Array<{
    type: 'error' | 'warning' | 'info';
    code: string;
    message: string;
  }>;

  // Raw response for debugging
  rawResponse?: any;
}

/**
 * Mock eligibility verification
 * Simulates various real-world scenarios
 */
export async function mockEligibilityCheck(
  request: EligibilityRequest
): Promise<EligibilityResponse> {
  // Simulate API delay (100-500ms)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 400 + 100));

  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const timestamp = new Date().toISOString();

  // Generate response based on payer and member ID patterns
  const scenario = determineScenario(request);

  return generateResponse(scenario, request, transactionId, timestamp);
}

/**
 * Determine which scenario to simulate based on request data
 */
function determineScenario(request: EligibilityRequest): string {
  const { payerId, memberId } = request;

  // Use member ID patterns to trigger different scenarios
  if (memberId.includes('TERMED') || memberId.endsWith('999')) {
    return 'terminated';
  }
  if (memberId.includes('INACTIVE') || memberId.endsWith('000')) {
    return 'inactive';
  }
  if (memberId.includes('ERROR') || memberId.endsWith('666')) {
    return 'error';
  }
  if (memberId.includes('DEDUCT') || memberId.endsWith('111')) {
    return 'high_deductible';
  }
  if (memberId.includes('MET') || memberId.endsWith('222')) {
    return 'deductible_met';
  }

  // Default scenarios by payer
  const scenarios = ['active_standard', 'active_high_deductible', 'active_low_copay'];
  const index = Math.abs(hashCode(payerId + memberId)) % scenarios.length;
  return scenarios[index]!;
}

/**
 * Generate mock response for different scenarios
 */
function generateResponse(
  scenario: string,
  request: EligibilityRequest,
  transactionId: string,
  timestamp: string
): EligibilityResponse {
  const payerNames: Record<string, string> = {
    'BCBS': 'Blue Cross Blue Shield',
    'AETNA': 'Aetna',
    'CIGNA': 'Cigna',
    'UNITED': 'UnitedHealthcare',
    'HUMANA': 'Humana',
    'MEDICARE': 'Medicare',
    'MEDICAID': 'Medicaid',
  };

  const baseResponse = {
    success: true,
    transactionId,
    timestamp,
    patient: {
      firstName: request.patientFirstName,
      lastName: request.patientLastName,
      dob: request.patientDob,
      memberId: request.memberId,
      groupNumber: generateGroupNumber(request.payerId),
    },
    payer: {
      payerId: request.payerId,
      payerName: payerNames[request.payerId] || 'Unknown Payer',
    },
  };

  switch (scenario) {
    case 'terminated':
      return {
        ...baseResponse,
        coverage: {
          status: 'terminated',
          effectiveDate: '2024-01-01',
          terminationDate: '2025-12-31',
          planName: 'PPO Plan - Terminated',
          planType: 'PPO',
        },
        benefits: {},
        messages: [{
          type: 'warning',
          code: 'COVERAGE_TERMINATED',
          message: 'Coverage has been terminated. Patient may need to update insurance information.',
        }],
      };

    case 'inactive':
      return {
        ...baseResponse,
        coverage: {
          status: 'inactive',
          planName: 'PPO Plan - Inactive',
          planType: 'PPO',
        },
        benefits: {},
        messages: [{
          type: 'warning',
          code: 'COVERAGE_INACTIVE',
          message: 'Coverage is currently inactive. Please contact payer for details.',
        }],
      };

    case 'error':
      return {
        ...baseResponse,
        success: false,
        coverage: {
          status: 'pending',
        },
        benefits: {},
        messages: [{
          type: 'error',
          code: 'MEMBER_NOT_FOUND',
          message: 'Member ID not found in payer system. Please verify insurance information.',
        }],
      };

    case 'high_deductible':
      return {
        ...baseResponse,
        coverage: {
          status: 'active',
          effectiveDate: '2025-01-01',
          terminationDate: '2025-12-31',
          planName: 'High Deductible Health Plan (HDHP)',
          planType: 'PPO',
          coverageLevel: 'individual',
          coordinationOfBenefits: 'primary',
        },
        network: {
          inNetwork: true,
          networkName: 'National PPO Network',
        },
        pcp: {
          required: false,
        },
        benefits: {
          copays: {
            specialist: 0, // HDHP typically no copay until deductible met
            primaryCare: 0,
            emergency: 0,
            urgentCare: 0,
          },
          deductible: {
            individual: {
              total: 500000, // $5,000
              met: 75000, // $750
              remaining: 425000, // $4,250
            },
          },
          coinsurance: {
            percentage: 20,
          },
          outOfPocketMax: {
            individual: {
              total: 700000, // $7,000
              met: 150000, // $1,500
              remaining: 550000, // $5,500
            },
          },
          priorAuth: {
            required: true,
            services: ['Biologics (Humira, Dupixent, etc.)', 'Phototherapy', 'Mohs Surgery'],
            phone: '1-800-555-PRIOR',
          },
          referral: {
            required: false,
          },
        },
      };

    case 'deductible_met':
      return {
        ...baseResponse,
        coverage: {
          status: 'active',
          effectiveDate: '2025-01-01',
          terminationDate: '2025-12-31',
          planName: 'PPO Premier Plan',
          planType: 'PPO',
          coverageLevel: 'family',
          coordinationOfBenefits: 'primary',
        },
        network: {
          inNetwork: true,
          networkName: 'Premier Network',
        },
        pcp: {
          required: false,
        },
        subscriber: {
          firstName: 'John',
          lastName: 'Doe',
          dob: '1980-05-15',
          relationship: 'spouse',
        },
        benefits: {
          copays: {
            specialist: 4000, // $40
            primaryCare: 2500, // $25
            emergency: 20000, // $200
            urgentCare: 7500, // $75
          },
          deductible: {
            individual: {
              total: 50000, // $500
              met: 50000, // $500 (fully met!)
              remaining: 0,
            },
            family: {
              total: 150000, // $1,500
              met: 125000, // $1,250
              remaining: 25000, // $250
            },
          },
          coinsurance: {
            percentage: 20,
          },
          outOfPocketMax: {
            individual: {
              total: 300000, // $3,000
              met: 210000, // $2,100
              remaining: 90000, // $900
            },
            family: {
              total: 600000, // $6,000
              met: 350000, // $3,500
              remaining: 250000, // $2,500
            },
          },
          priorAuth: {
            required: true,
            services: ['Biologics (Humira, Dupixent, etc.)', 'Phototherapy', 'Mohs Surgery'],
            phone: '1-800-555-PRIOR',
          },
          referral: {
            required: false,
          },
        },
      };

    case 'active_low_copay':
      return {
        ...baseResponse,
        coverage: {
          status: 'active',
          effectiveDate: '2025-01-01',
          terminationDate: '2025-12-31',
          planName: 'Gold HMO Plan',
          planType: 'HMO',
          coverageLevel: 'individual',
          coordinationOfBenefits: 'primary',
        },
        network: {
          inNetwork: true,
          networkName: 'HMO Network',
        },
        pcp: {
          required: true,
          name: 'Dr. Jane Smith',
          npi: '1234567890',
        },
        benefits: {
          copays: {
            specialist: 2000, // $20
            primaryCare: 1500, // $15
            emergency: 15000, // $150
            urgentCare: 5000, // $50
          },
          deductible: {
            individual: {
              total: 0, // No deductible
              met: 0,
              remaining: 0,
            },
          },
          coinsurance: {
            percentage: 0, // No coinsurance
          },
          outOfPocketMax: {
            individual: {
              total: 200000, // $2,000
              met: 45000, // $450
              remaining: 155000, // $1,550
            },
          },
          priorAuth: {
            required: true,
            services: ['Biologics (Humira, Dupixent, etc.)', 'Phototherapy', 'Cosmetic Procedures'],
            phone: '1-800-555-PRIOR',
          },
          referral: {
            required: true,
          },
        },
      };

    default: // active_standard
      return {
        ...baseResponse,
        coverage: {
          status: 'active',
          effectiveDate: '2025-01-01',
          terminationDate: '2025-12-31',
          planName: 'Standard PPO Plan',
          planType: 'PPO',
          coverageLevel: 'individual',
          coordinationOfBenefits: 'primary',
        },
        network: {
          inNetwork: true,
          networkName: 'Standard PPO Network',
        },
        pcp: {
          required: false,
        },
        benefits: {
          copays: {
            specialist: 4000, // $40
            primaryCare: 2500, // $25
            emergency: 20000, // $200
            urgentCare: 7500, // $75
          },
          deductible: {
            individual: {
              total: 100000, // $1,000
              met: 35000, // $350
              remaining: 65000, // $650
            },
          },
          coinsurance: {
            percentage: 20,
          },
          outOfPocketMax: {
            individual: {
              total: 500000, // $5,000
              met: 125000, // $1,250
              remaining: 375000, // $3,750
            },
          },
          priorAuth: {
            required: true,
            services: ['Biologics (Humira, Dupixent, etc.)', 'Phototherapy', 'Mohs Surgery', 'Advanced Imaging'],
            phone: '1-800-555-PRIOR',
          },
          referral: {
            required: false,
          },
        },
      };
  }
}

/**
 * Generate a consistent group number based on payer ID
 */
function generateGroupNumber(payerId: string): string {
  const hash = Math.abs(hashCode(payerId));
  return `GRP${hash.toString().substring(0, 6)}`;
}

/**
 * Simple hash function for consistent pseudo-random values
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Batch eligibility check
 */
export async function mockBatchEligibilityCheck(
  requests: EligibilityRequest[]
): Promise<EligibilityResponse[]> {
  // Process in parallel with slight delays to simulate real API behavior
  const results = await Promise.all(
    requests.map((request, index) =>
      new Promise<EligibilityResponse>(resolve => {
        setTimeout(async () => {
          const result = await mockEligibilityCheck(request);
          resolve(result);
        }, index * 50); // Stagger requests by 50ms
      })
    )
  );

  return results;
}
