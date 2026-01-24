const createMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    messages = { create: createMock };
  },
}), { virtual: true });

jest.mock('../../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { pool } from '../../db/pool';
import { PriorAuthLetterGenerator } from '../priorAuthLetterGenerator';

const queryMock = pool.query as jest.Mock;

describe('PriorAuthLetterGenerator', () => {
  const baseParams = {
    patientId: 'patient-1',
    tenantId: 'tenant-1',
    medicationName: 'Tretinoin 0.05% cream',
    diagnosisCodes: ['L40.0'],
    diagnosisDescriptions: ['Psoriasis'],
    payerName: 'Aetna',
    clinicalJustification: 'Severe plaque psoriasis impacting daily living.',
    previousTreatments: 'Topical steroids, phototherapy',
    previousFailures: 'Insufficient response to topical therapy',
  };

  beforeEach(() => {
    queryMock.mockReset();
    createMock.mockReset();
  });

  it('generates a letter using AI content and extracts key points', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            first_name: 'Ana',
            last_name: 'Derm',
            dob: '1980-01-01',
            sex: 'F',
            insurance: 'Aetna',
            recent_diagnoses: ['L40.0'],
            recent_prescriptions: [],
            recent_procedures: [],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ clinical_justification_template: 'Template text' }] });

    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '1. Patient has severe disease.\n- Failed topical therapy.\nThis medication is medically necessary.',
        },
      ],
    });

    const result = await PriorAuthLetterGenerator.generateLetter(baseParams);

    expect(result.letterText).toContain('Patient has severe disease');
    expect(result.suggestedDiagnosisCodes).toEqual(['L40.0']);
    expect(result.keyPoints).toEqual([
      'Patient has severe disease.',
      'Failed topical therapy.',
      'This medication is medically necessary.',
    ]);
  });

  it('falls back to template letter when AI fails', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            first_name: 'Ana',
            last_name: 'Derm',
            dob: '1980-01-01',
            sex: 'F',
            insurance: 'Aetna',
            recent_diagnoses: ['L40.0'],
            recent_prescriptions: [],
            recent_procedures: [],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    createMock.mockRejectedValue(new Error('AI unavailable'));

    const result = await PriorAuthLetterGenerator.generateLetter(baseParams);

    expect(result.letterText).toContain('To Whom It May Concern');
    expect(result.letterText).toContain('Tretinoin 0.05% cream');
    expect(result.keyPoints.some((point) => point.toLowerCase().includes('medically necessary'))).toBe(true);
  });

  it('generates an appeal letter with denial details', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          reference_number: 'REF-123',
          auth_number: 'AUTH-456',
          medication_name: 'Tretinoin 0.05% cream',
          procedure_code: null,
          first_name: 'Ana',
          last_name: 'Derm',
          dob: '1980-01-01',
        },
      ],
    });

    const letter = await PriorAuthLetterGenerator.generateAppealLetter(
      'pa-1',
      'tenant-1',
      'Missing prior authorization form',
      'Additional clinical evidence attached.'
    );

    expect(letter).toContain('REF-123');
    expect(letter).toContain('AUTH-456');
    expect(letter).toContain('Ana Derm');
    expect(letter).toContain('Missing prior authorization form');
    expect(letter).toContain('Additional clinical evidence attached.');
  });

  it('returns common templates for a given auth type', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          name: 'Template A',
          medication_name: 'Drug A',
          procedure_code: null,
          clinical_justification_template: 'Justify',
          previous_treatments_template: 'Treatments',
          common_diagnosis_codes: ['L40.0'],
        },
      ],
    });

    const templates = await PriorAuthLetterGenerator.getCommonTemplates('tenant-1', 'medication');

    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Template A');
  });
});
