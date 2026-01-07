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
    queryMock
      .mockResolvedValueOnce({
        rows: [{ medication_name: 'Doxycycline', generic_name: null }],
      })
      .mockResolvedValueOnce({
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

    const result = await checkDrugDrugInteractions('Isotretinoin', 'patient-1', 'tenant-1');

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'severe',
          medication1: 'Isotretinoin',
          medication2: 'Doxycycline',
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
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const result = await checkDrugDrugInteractions('Isotretinoin', 'patient-1', 'tenant-1');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('matches drug allergies by class', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          allergen: 'tetracycline',
          severity: 'high',
          reaction: 'rash',
        },
      ],
    });

    const result = await checkDrugAllergyInteractions('Doxycycline', 'patient-1', 'tenant-1');

    expect(result).toEqual([
      {
        allergen: 'tetracycline',
        severity: 'high',
        reaction: 'rash',
      },
    ]);
  });

  it('returns empty allergy list on errors', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error('db down'));

    const result = await checkDrugAllergyInteractions('Doxycycline', 'patient-1', 'tenant-1');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('summarizes safety warnings', async () => {
    queryMock.mockImplementation((text: string) => {
      if (text.includes('FROM prescriptions')) {
        return Promise.resolve({
          rows: [{ medication_name: 'Isotretinoin', generic_name: null }],
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
            },
          ],
        });
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
