/**
 * PDF Template Service
 * Professional PDF generation templates for various reports
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate, formatPhone } from '../utils/export';
import type {
  Patient,
  Appointment,
  Encounter,
  Charge,
  EncounterDiagnosis,
} from '../types';

interface PracticeInfo {
  name: string;
  address?: string;
  phone?: string;
  fax?: string;
  taxId?: string;
  npi?: string;
}

interface ReportConfig {
  title: string;
  subtitle?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  filters?: Record<string, string>;
}

/**
 * Base PDF document with practice header
 */
class BasePDFTemplate {
  protected doc: jsPDF;
  protected yPosition: number;
  protected practiceInfo: PracticeInfo;

  constructor(orientation: 'portrait' | 'landscape' = 'portrait') {
    this.doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'letter',
    });
    this.yPosition = 15;
    this.practiceInfo = {
      name: 'Dermatology Practice',
      address: '123 Medical Drive, Suite 100, City, ST 12345',
      phone: '(555) 123-4567',
      fax: '(555) 123-4568',
    };
  }

  protected addHeader(): void {
    // Practice name
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.practiceInfo.name, 15, this.yPosition);
    this.yPosition += 7;

    // Address and contact info
    if (this.practiceInfo.address) {
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(this.practiceInfo.address, 15, this.yPosition);
      this.yPosition += 5;
    }

    if (this.practiceInfo.phone) {
      this.doc.text(
        `Phone: ${this.practiceInfo.phone}${this.practiceInfo.fax ? ` | Fax: ${this.practiceInfo.fax}` : ''}`,
        15,
        this.yPosition
      );
      this.yPosition += 5;
    }

    // Horizontal line
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(15, this.yPosition, this.doc.internal.pageSize.width - 15, this.yPosition);
    this.yPosition += 8;
  }

  protected addReportTitle(config: ReportConfig): void {
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(config.title, 15, this.yPosition);
    this.yPosition += 7;

    if (config.subtitle) {
      this.doc.setFontSize(11);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(config.subtitle, 15, this.yPosition);
      this.yPosition += 6;
    }

    // Date range
    if (config.dateRange) {
      this.doc.setFontSize(9);
      this.doc.text(
        `Period: ${formatDate(config.dateRange.start, 'short')} - ${formatDate(config.dateRange.end, 'short')}`,
        15,
        this.yPosition
      );
      this.yPosition += 5;
    }

    // Filters
    if (config.filters && Object.keys(config.filters).length > 0) {
      Object.entries(config.filters).forEach(([key, value]) => {
        this.doc.text(`${key}: ${value}`, 15, this.yPosition);
        this.yPosition += 4;
      });
    }

    // Generation timestamp
    this.doc.setFontSize(9);
    this.doc.setTextColor(100, 100, 100);
    this.doc.text(`Generated: ${formatDate(new Date(), 'datetime')}`, 15, this.yPosition);
    this.doc.setTextColor(0, 0, 0);
    this.yPosition += 10;
  }

  protected addFooter(): void {
    const pageCount = this.doc.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(100, 100, 100);

      // Page number
      this.doc.text(
        `Page ${i} of ${pageCount}`,
        this.doc.internal.pageSize.width / 2,
        this.doc.internal.pageSize.height - 10,
        { align: 'center' }
      );

      // Confidentiality notice
      this.doc.setFontSize(7);
      this.doc.text(
        'CONFIDENTIAL - Protected Health Information',
        this.doc.internal.pageSize.width / 2,
        this.doc.internal.pageSize.height - 6,
        { align: 'center' }
      );

      this.doc.setTextColor(0, 0, 0);
    }
  }

  protected save(filename: string): void {
    this.addFooter();
    this.doc.save(filename);
  }
}

/**
 * Generate superbill PDF (enhanced version)
 */
export function generateSuperbillPDF(encounter: {
  patient: Patient;
  provider: { name: string; npi?: string };
  encounter: Encounter;
  diagnoses: EncounterDiagnosis[];
  charges: Charge[];
}): void {
  const template = new BasePDFTemplate('portrait');

  // Header
  template['addHeader']();

  // Title
  template['doc'].setFontSize(16);
  template['doc'].setFont('helvetica', 'bold');
  template['doc'].text('SUPERBILL', 15, template['yPosition']);
  template['yPosition'] += 10;

  // Patient Information Box
  template['doc'].setDrawColor(107, 70, 193);
  template['doc'].setFillColor(245, 243, 255);
  template['doc'].roundedRect(15, template['yPosition'], 90, 35, 2, 2, 'FD');

  template['doc'].setFontSize(10);
  template['doc'].setFont('helvetica', 'bold');
  template['doc'].text('Patient Information', 18, template['yPosition'] + 6);

  template['doc'].setFont('helvetica', 'normal');
  template['doc'].setFontSize(9);
  template['doc'].text(
    `${encounter.patient.firstName} ${encounter.patient.lastName}`,
    18,
    template['yPosition'] + 12
  );
  template['doc'].text(
    `DOB: ${formatDate(encounter.patient.dob || encounter.patient.dateOfBirth, 'short')}`,
    18,
    template['yPosition'] + 17
  );
  if (encounter.patient.mrn) {
    template['doc'].text(`MRN: ${encounter.patient.mrn}`, 18, template['yPosition'] + 22);
  }
  if (encounter.patient.phone) {
    template['doc'].text(`Phone: ${formatPhone(encounter.patient.phone)}`, 18, template['yPosition'] + 27);
  }

  // Encounter Information Box
  template['doc'].roundedRect(110, template['yPosition'], 90, 35, 2, 2, 'FD');

  template['doc'].setFont('helvetica', 'bold');
  template['doc'].setFontSize(10);
  template['doc'].text('Encounter Information', 113, template['yPosition'] + 6);

  template['doc'].setFont('helvetica', 'normal');
  template['doc'].setFontSize(9);
  template['doc'].text(
    `Date: ${formatDate(encounter.encounter.createdAt, 'short')}`,
    113,
    template['yPosition'] + 12
  );
  template['doc'].text(`Provider: ${encounter.provider.name}`, 113, template['yPosition'] + 17);
  if (encounter.provider.npi) {
    template['doc'].text(`NPI: ${encounter.provider.npi}`, 113, template['yPosition'] + 22);
  }

  template['yPosition'] += 45;

  // Diagnoses
  if (encounter.diagnoses.length > 0) {
    template['doc'].setFontSize(11);
    template['doc'].setFont('helvetica', 'bold');
    template['doc'].text('Diagnoses', 15, template['yPosition']);
    template['yPosition'] += 7;

    const diagnosesData = encounter.diagnoses.map((dx, index) => [
      dx.isPrimary ? 'Primary' : 'Secondary',
      dx.icd10Code,
      dx.description,
    ]);

    autoTable(template['doc'], {
      head: [['Type', 'ICD-10 Code', 'Description']],
      body: diagnosesData,
      startY: template['yPosition'],
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: {
        fillColor: [107, 70, 193],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 'auto' },
      },
    });

    template['yPosition'] = (template['doc'] as any).lastAutoTable.finalY + 10;
  }

  // Procedures/Charges
  if (encounter.charges.length > 0) {
    template['doc'].setFontSize(11);
    template['doc'].setFont('helvetica', 'bold');
    template['doc'].text('Procedures & Charges', 15, template['yPosition']);
    template['yPosition'] += 7;

    const chargesData = encounter.charges.map((charge) => [
      charge.cptCode,
      charge.description || '',
      charge.quantity || 1,
      formatCurrency(charge.amountCents),
    ]);

    const total = encounter.charges.reduce((sum, c) => sum + (c.amountCents || 0), 0);

    autoTable(template['doc'], {
      head: [['CPT Code', 'Description', 'Qty', 'Amount']],
      body: chargesData,
      foot: [['', '', 'Total:', formatCurrency(total)]],
      startY: template['yPosition'],
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: {
        fillColor: [107, 70, 193],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
      },
    });
  }

  template['save'](`Superbill_${encounter.patient.lastName}_${formatDate(encounter.encounter.createdAt, 'short').replace(/\//g, '-')}.pdf`);
}

/**
 * Generate patient summary PDF
 */
export function generatePatientSummaryPDF(patient: Patient & {
  recentVisits?: Encounter[];
  activeOrders?: any[];
}): void {
  const template = new BasePDFTemplate('portrait');

  template['addHeader']();
  template['addReportTitle']({
    title: 'Patient Summary',
    subtitle: `${patient.firstName} ${patient.lastName}`,
  });

  // Demographics
  template['doc'].setFontSize(11);
  template['doc'].setFont('helvetica', 'bold');
  template['doc'].text('Demographics', 15, template['yPosition']);
  template['yPosition'] += 7;

  template['doc'].setFontSize(9);
  template['doc'].setFont('helvetica', 'normal');

  const demographics = [
    ['Name', `${patient.firstName} ${patient.lastName}`],
    ['Date of Birth', formatDate(patient.dob || patient.dateOfBirth, 'short')],
    ['Sex', patient.sex || 'Not specified'],
    ['MRN', patient.mrn || 'N/A'],
    ['Phone', formatPhone(patient.phone)],
    ['Email', patient.email || 'N/A'],
    ['Address', patient.address ? `${patient.address}, ${patient.city}, ${patient.state} ${patient.zip}` : 'N/A'],
  ];

  demographics.forEach(([label, value]) => {
    template['doc'].setFont('helvetica', 'bold');
    template['doc'].text(`${label}:`, 20, template['yPosition']);
    template['doc'].setFont('helvetica', 'normal');
    template['doc'].text(value, 55, template['yPosition']);
    template['yPosition'] += 5;
  });

  template['yPosition'] += 5;

  // Insurance
  if (patient.insurance) {
    template['doc'].setFontSize(11);
    template['doc'].setFont('helvetica', 'bold');
    template['doc'].text('Insurance', 15, template['yPosition']);
    template['yPosition'] += 7;

    template['doc'].setFontSize(9);
    template['doc'].setFont('helvetica', 'normal');
    template['doc'].text(`Plan: ${patient.insurance.planName}`, 20, template['yPosition']);
    template['yPosition'] += 5;
    template['doc'].text(`Member ID: ${patient.insurance.memberId}`, 20, template['yPosition']);
    template['yPosition'] += 5;
    if (patient.insurance.groupNumber) {
      template['doc'].text(`Group: ${patient.insurance.groupNumber}`, 20, template['yPosition']);
      template['yPosition'] += 5;
    }
    template['yPosition'] += 5;
  }

  // Allergies
  if (patient.allergies && patient.allergies.length > 0) {
    template['doc'].setFontSize(11);
    template['doc'].setFont('helvetica', 'bold');
    template['doc'].text('Allergies', 15, template['yPosition']);
    template['yPosition'] += 7;

    template['doc'].setFontSize(9);
    template['doc'].setFont('helvetica', 'normal');
    template['doc'].setTextColor(220, 38, 38);
    patient.allergies.forEach(allergy => {
      template['doc'].text(`• ${allergy}`, 20, template['yPosition']);
      template['yPosition'] += 5;
    });
    template['doc'].setTextColor(0, 0, 0);
    template['yPosition'] += 5;
  }

  template['save'](`Patient_Summary_${patient.lastName}_${patient.firstName}.pdf`);
}

/**
 * Generate appointment list PDF
 */
export function generateAppointmentListPDF(
  appointments: Appointment[],
  config: ReportConfig
): void {
  const template = new BasePDFTemplate('landscape');

  template['addHeader']();
  template['addReportTitle'](config);

  const tableData = appointments.map(apt => [
    formatDate(apt.scheduledStart, 'short'),
    formatDate(apt.scheduledStart, 'time'),
    apt.patientName || 'Unknown',
    apt.providerName || 'Unknown',
    apt.appointmentTypeName || 'General',
    apt.locationName || '',
    apt.status.replace('_', ' ').toUpperCase(),
  ]);

  autoTable(template['doc'], {
    head: [['Date', 'Time', 'Patient', 'Provider', 'Type', 'Location', 'Status']],
    body: tableData,
    startY: template['yPosition'],
    margin: { left: 15, right: 15 },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [107, 70, 193],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 20 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 35 },
      5: { cellWidth: 35 },
      6: { cellWidth: 30 },
    },
  });

  template['save'](`Appointments_${config.dateRange?.start || 'All'}.pdf`);
}

/**
 * Generate generic report PDF
 */
export function generateReportPDF(
  reportData: any[],
  config: ReportConfig & {
    columns: Array<{ key: string; label: string; format?: (value: any) => string }>;
    orientation?: 'portrait' | 'landscape';
  }
): void {
  const template = new BasePDFTemplate(config.orientation || 'portrait');

  template['addHeader']();
  template['addReportTitle'](config);

  const headers = config.columns.map(col => col.label);
  const tableData = reportData.map(row =>
    config.columns.map(col => {
      const value = row[col.key];
      return col.format ? col.format(value) : value;
    })
  );

  autoTable(template['doc'], {
    head: [headers],
    body: tableData,
    startY: template['yPosition'],
    margin: { left: 15, right: 15 },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [107, 70, 193],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  });

  template['save'](`${config.title.replace(/\s/g, '_')}.pdf`);
}
