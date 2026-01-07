import {
  validatePrescription,
  checkDrugInteractions,
  checkFormulary,
  checkAllergies,
  canProviderPrescribeControlled,
} from '../prescriptionValidator';

describe('prescriptionValidator', () => {
  it('returns errors for missing required fields', () => {
    const result = validatePrescription({
      medicationName: '',
      quantity: 0,
      refills: -1,
      daysSupply: -5,
      isControlled: false,
      patientId: 'patient-1',
      providerId: 'provider-1',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'medicationName' }),
        expect.objectContaining({ field: 'quantity' }),
        expect.objectContaining({ field: 'refills', code: 'INVALID_REFILLS' }),
        expect.objectContaining({ field: 'daysSupply', code: 'INVALID_DAYS_SUPPLY' }),
      ])
    );
  });

  it('rejects refills above the maximum', () => {
    const result = validatePrescription({
      medicationName: 'Hydrocortisone cream',
      quantity: 30,
      refills: 6,
      isControlled: false,
      patientId: 'patient-1',
      providerId: 'provider-1',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'refills', code: 'REFILLS_EXCEEDED' }),
      ])
    );
  });

  it('warns for large topical quantity and long days supply', () => {
    const result = validatePrescription({
      medicationName: 'Hydrocortisone cream',
      quantity: 200,
      refills: 1,
      daysSupply: 120,
      isControlled: false,
      patientId: 'patient-1',
      providerId: 'provider-1',
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('90 days') }),
        expect.objectContaining({ message: expect.stringContaining('topical medication') }),
      ])
    );
  });

  it('enforces schedule II controls and oral quantity limits', () => {
    const result = validatePrescription({
      medicationName: 'Morphine tablet',
      quantity: 200,
      refills: 1,
      daysSupply: 40,
      isControlled: true,
      deaSchedule: 'II',
      patientId: 'patient-1',
      providerId: 'provider-1',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DEA_SCHEDULE_II_NO_REFILLS' }),
      ])
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dea', severity: 'high' }),
        expect.objectContaining({ message: expect.stringContaining('oral medication') }),
      ])
    );
  });

  it('warns for injectable quantity', () => {
    const result = validatePrescription({
      medicationName: 'Biologic injection',
      quantity: 20,
      refills: 0,
      isControlled: false,
      patientId: 'patient-1',
      providerId: 'provider-1',
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('injectable medication') }),
      ])
    );
  });

  it('returns default responses for stubbed helpers', async () => {
    await expect(checkDrugInteractions('med-1', 'patient-1')).resolves.toEqual([]);
    await expect(checkAllergies('med', 'patient-1')).resolves.toEqual([]);
    await expect(checkFormulary('med-1', 'patient-1')).resolves.toEqual({
      covered: true,
      tier: 'Unknown',
      priorAuthRequired: false,
    });
    expect(canProviderPrescribeControlled('provider-1', 'II')).toBe(true);
  });
});
