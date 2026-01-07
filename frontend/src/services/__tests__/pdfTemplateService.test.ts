import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSuperbillPDF,
  generatePatientSummaryPDF,
  generateAppointmentListPDF,
  generateReportPDF,
} from '../pdfTemplateService';
import { formatDate } from '../../utils/export';

const pdfMocks = vi.hoisted(() => {
  const save = vi.fn();
  const setFontSize = vi.fn();
  const setFont = vi.fn();
  const text = vi.fn();
  const setDrawColor = vi.fn();
  const setFillColor = vi.fn();
  const roundedRect = vi.fn();
  const line = vi.fn();
  const setTextColor = vi.fn();
  const setPage = vi.fn();
  const getNumberOfPages = vi.fn(() => 1);

  const doc = {
    save,
    setFontSize,
    setFont,
    text,
    setDrawColor,
    setFillColor,
    roundedRect,
    line,
    setTextColor,
    setPage,
    getNumberOfPages,
    internal: {
      pageSize: { width: 216, height: 279 },
    },
  };

  const jsPDF = vi.fn(function () {
    return doc;
  });
  const autoTable = vi.fn((docArg) => {
    (docArg as any).lastAutoTable = { finalY: 50 };
  });

  return { doc, save, jsPDF, autoTable };
});

vi.mock('jspdf', () => ({
  default: pdfMocks.jsPDF,
}));

vi.mock('jspdf-autotable', () => ({
  default: pdfMocks.autoTable,
}));

describe('pdfTemplateService', () => {
  beforeEach(() => {
    pdfMocks.save.mockClear();
    pdfMocks.jsPDF.mockClear();
    pdfMocks.autoTable.mockClear();
  });

  it('generates a superbill PDF', () => {
    const encounterData = {
      patient: {
        firstName: 'Ava',
        lastName: 'Smith',
        dateOfBirth: '1990-01-01T12:00:00',
        mrn: 'MRN-100',
        phone: '5551234567',
      },
      provider: {
        name: 'Dr. Lane',
        npi: '1234567890',
      },
      encounter: {
        createdAt: '2024-03-04T12:00:00',
      },
      diagnoses: [
        { isPrimary: true, icd10Code: 'L20.9', description: 'Dermatitis' },
      ],
      charges: [
        { cptCode: '99213', description: 'Office visit', quantity: 1, amountCents: 20000 },
      ],
    };

    generateSuperbillPDF(encounterData as any);

    const expectedDate = formatDate('2024-03-04T12:00:00', 'short').replace(/\//g, '-');
    expect(pdfMocks.autoTable).toHaveBeenCalledTimes(2);
    expect(pdfMocks.save).toHaveBeenCalledWith(`Superbill_Smith_${expectedDate}.pdf`);
  });

  it('generates a patient summary PDF', () => {
    const patientData = {
      firstName: 'Ava',
      lastName: 'Smith',
      dateOfBirth: '1990-01-01T12:00:00',
      phone: '5551234567',
      insurance: {
        planName: 'Derm Health',
        memberId: 'ID-1',
        groupNumber: 'GRP-2',
      },
      allergies: ['Peanuts'],
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    };

    generatePatientSummaryPDF(patientData as any);

    expect(pdfMocks.save).toHaveBeenCalledWith('Patient_Summary_Smith_Ava.pdf');
  });

  it('generates appointment list and report PDFs', () => {
    generateAppointmentListPDF(
      [
        {
          scheduledStart: '2024-01-15T12:00:00',
          patientName: 'Jamie Lee',
          providerName: 'Dr. Ray',
          appointmentTypeName: 'Consultation',
          locationName: 'Main Clinic',
          status: 'scheduled',
        },
      ] as any,
      {
        title: 'Appointments',
        dateRange: { start: '2024-01-01', end: '2024-01-31' },
      }
    );

    expect(pdfMocks.autoTable).toHaveBeenCalled();
    expect(pdfMocks.save).toHaveBeenCalledWith('Appointments_2024-01-01.pdf');

    generateReportPDF(
      [{ provider: 'Dr. Ray', total: 10 }],
      {
        title: 'Provider Summary',
        columns: [
          { key: 'provider', label: 'Provider' },
          { key: 'total', label: 'Total', format: (value) => `${value}` },
        ],
      }
    );

    expect(pdfMocks.autoTable).toHaveBeenCalled();
    expect(pdfMocks.save).toHaveBeenCalledWith('Provider_Summary.pdf');
  });
});
