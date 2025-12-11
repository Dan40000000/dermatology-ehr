import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToCSV(data: any[], filename: string, headers?: string[]) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers from first object if not provided
  const csvHeaders = headers || Object.keys(data[0]);

  // Escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // Create header row
  const headerRow = csvHeaders.join(',');

  // Create data rows
  const dataRows = data.map(row => {
    return csvHeaders.map(header => escapeCSV(row[header])).join(',');
  });

  // Combine
  const csv = [headerRow, ...dataRows].join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface PDFExportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  data: any[][];
  filename: string;
  practiceName?: string;
  summary?: { label: string; value: string }[];
}

export function exportToPDF(options: PDFExportOptions) {
  const { title, subtitle, headers, data, filename, practiceName = 'Dermatology Practice', summary } = options;

  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text(practiceName, 14, 20);

  doc.setFontSize(14);
  doc.text(title, 14, 30);

  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, 14, 37);
  }

  // Table
  autoTable(doc, {
    head: [headers],
    body: data,
    startY: subtitle ? 42 : 35,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [59, 130, 246], // Blue
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251], // Light gray
    },
    margin: { top: 10, right: 14, bottom: 25, left: 14 },
  });

  // Summary section if provided
  if (summary && summary.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY || 42;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary:', 14, finalY + 10);

    doc.setFont('helvetica', 'normal');
    summary.forEach((item, index) => {
      doc.text(`${item.label}: ${item.value}`, 14, finalY + 17 + (index * 6));
    });
  }

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.text(
      `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  doc.save(filename);
}

// Format currency for display
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Format date for display
export function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

// Format datetime for display
export function formatDateTime(dateString: string | null): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
