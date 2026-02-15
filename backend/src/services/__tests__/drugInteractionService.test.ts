import {
  checkDrugDrugInteractions,
  checkDrugAllergyInteractions,
  comprehensiveSafetyCheck,
} from '../drugInteractionService';
import { pool } from '../../db/pool';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('drugInteractionService', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns known and database interactions', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT rxnorm_cui FROM drug_database WHERE drug_name ILIKE')) {
        return Promise.resolve({ rows: [{ rxnorm_cui: 'rx-iso' }] });
      }
      if (text.includes('FROM prescriptions')) {
        return Promise.resolve({
          rows: [{ medication_name: 'Doxycycline', generic_name: null, rxnorm_cui: 'rx-doxy' }],
        });
      }
      if (text.includes('SELECT drug_name, generic_name FROM drug_database WHERE rxnorm_cui')) {
        return Promise.resolve({
          rows: [{ drug_name: 'Isotretinoin', generic_name: 'Isotretinoin' }],
        });
      }
      if (text.includes('FROM drug_interactions')) {
        return Promise.resolve({
          rows: [
            {
              severity: 'moderate',
              description: 'Test DB interaction',
              medication_1: 'TestMedA',
              medication_2: 'TestMedB',
              clinical_effects: 'effects',
              management: 'management',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await checkDrugDrugInteractions('Isotretinoin', 'patient-1', 'tenant-1');

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'contraindicated',
          medication1: 'Isotretinoin',
          medication2: 'doxycycline',
        }),
        expect.objectContaining({
          severity: 'moderate',
          medication1: 'TestMedA',
          medication2: 'TestMedB',
        }),
      ])
    );
  });

  it('returns empty list when interaction lookup fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const result = await checkDrugDrugInteractions('Isotretinoin', 'patient-1', 'tenant-1');

    expect(result).toEqual([]);
  });

  it('matches drug allergies by class', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT rxnorm_cui FROM drug_database WHERE drug_name ILIKE')) {
        return Promise.resolve({ rows: [{ rxnorm_cui: 'rx-doxy' }] });
      }
      if (text.includes('FROM patient_allergies')) {
        return Promise.resolve({
          rows: [
            {
              allergen: 'tetracycline',
              severity: 'high',
              reaction: 'rash',
            },
          ],
        });
      }
      if (text.includes('SELECT drug_name, generic_name, drug_class FROM drug_database')) {
        return Promise.resolve({
          rows: [{ drug_name: 'Doxycycline', generic_name: 'tetracycline', drug_class: 'Antibiotic' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await checkDrugAllergyInteractions('Doxycycline', 'patient-1', 'tenant-1');

    expect(result).toEqual([
      {
        allergen: 'tetracycline',
        severity: 'high',
        reaction: 'rash',
        alternatives: [],
      },
    ]);
  });

  it('returns empty allergy list on errors', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const result = await checkDrugAllergyInteractions('Doxycycline', 'patient-1', 'tenant-1');

    expect(result).toEqual([]);
  });

  it('summarizes safety warnings', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('SELECT rxnorm_cui FROM drug_database WHERE drug_name ILIKE')) {
        return Promise.resolve({ rows: [{ rxnorm_cui: 'rx-doxy' }] });
      }
      if (text.includes('FROM prescriptions')) {
        return Promise.resolve({
          rows: [{ medication_name: 'Isotretinoin', generic_name: null, rxnorm_cui: 'rx-iso' }],
        });
      }
      if (text.includes('SELECT drug_name, generic_name FROM drug_database WHERE rxnorm_cui')) {
        return Promise.resolve({
          rows: [{ drug_name: 'Doxycycline', generic_name: 'Doxycycline' }],
        });
      }
      if (text.includes('FROM drug_interactions')) {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('FROM patient_allergies')) {
        return Promise.resolve({
          rows: [
            {
              allergen: 'tetracycline',
              severity: 'high',
              reaction: 'rash',
              allergen_type: 'medication',
            },
          ],
        });
      }
      if (text.includes('SELECT drug_name, generic_name, drug_class FROM drug_database')) {
        return Promise.resolve({
          rows: [{ drug_name: 'Doxycycline', generic_name: 'Doxycycline', drug_class: 'Antibiotic' }],
        });
      }
      if (text.includes('FROM drug_allergy_classes')) {
        return Promise.resolve({
          rows: [
            {
              related_drugs: ['doxycycline'],
              class_display_name: 'Tetracyclines',
              cross_reactivity_notes: 'Class cross reactivity',
              cross_reactivity_rate: '1',
              alternative_suggestions: [],
            },
          ],
        });
      }
      if (text.includes('SELECT black_box_warning')) {
        return Promise.resolve({ rows: [{}] });
      }
      if (text.includes('FROM drug_class_mapping')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await comprehensiveSafetyCheck('Doxycycline', 'patient-1', 'tenant-1');

    expect(result.warnings).toEqual([
      '1 severe drug interaction(s) detected',
      'Patient has documented allergy to related medication',
    ]);
    expect(result.drugInteractions).toHaveLength(1);
    expect(result.allergyWarnings).toHaveLength(1);
  });
});
