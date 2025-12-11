/**
 * Export Utilities
 * Provides standardized CSV and PDF export functionality across the application
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Type definitions
export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

export interface ExportOptions {
  filename?: string;
  columns?: ExportColumn[];
  headers?: string[];
  includeTimestamp?: boolean;
}

export interface PDFOptions extends ExportOptions {
  title?: string;
  orientation?: 'portrait' | 'landscape';
  fontSize?: number;
  includeHeader?: boolean;
  includeFooter?: boolean;
  practiceName?: string;
  practiceAddress?: string;
}

/**
 * Format currency value as $1,234.56
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '$0.00';

  // Handle cents (values stored as integers)
  const dollars = typeof value === 'number' && value > 999 ? value / 100 : value;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Format date consistently
 */
export function formatDate(
  date: string | Date | null | undefined,
  format: 'short' | 'long' | 'datetime' | 'time' = 'short'
): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  switch (format) {
    case 'short':
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      }).format(dateObj);

    case 'long':
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(dateObj);

    case 'datetime':
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(dateObj);

    case 'time':
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(dateObj);

    default:
      return dateObj.toLocaleDateString();
  }
}

/**
 * Format phone number as (123) 456-7890
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  // Format based on length
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  return phone;
}

/**
 * Generate timestamp for filenames
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

/**
 * Escape CSV special characters
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) return '';

  const stringValue = String(value);

  // If value contains comma, quotes, or newlines, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Extract value from nested object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Export data to CSV
 */
export function exportToCSV(
  data: any[],
  filename: string,
  options: ExportOptions = {}
): void {
  try {
    if (!data || data.length === 0) {
      throw new Error('No data to export');
    }

    const {
      columns,
      headers,
      includeTimestamp = true,
    } = options;

    let csvContent = '';

    // Determine headers
    let headerRow: string[];
    let dataKeys: string[];

    if (columns) {
      headerRow = columns.map(col => col.label);
      dataKeys = columns.map(col => col.key);
    } else if (headers) {
      headerRow = headers;
      dataKeys = headers;
    } else {
      // Auto-detect from first object
      dataKeys = Object.keys(data[0]);
      headerRow = dataKeys;
    }

    // Add headers
    csvContent += headerRow.map(escapeCSVValue).join(',') + '\n';

    // Add data rows
    data.forEach(row => {
      const values = dataKeys.map((key, index) => {
        let value = getNestedValue(row, key);

        // Apply custom formatter if provided
        if (columns && columns[index]?.format) {
          value = columns[index].format!(value);
        }

        return escapeCSVValue(value);
      });

      csvContent += values.join(',') + '\n';
    });

    // Generate filename
    const timestamp = includeTimestamp ? `_${getTimestamp()}` : '';
    const finalFilename = `${sanitizeFilename(filename)}${timestamp}.csv`;

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', finalFilename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
}

/**
 * Export data to PDF with professional formatting
 */
export function exportToPDF(
  data: any[],
  filename: string,
  options: PDFOptions = {}
): void {
  try {
    if (!data || data.length === 0) {
      throw new Error('No data to export');
    }

    const {
      title = 'Report',
      columns,
      headers,
      orientation = 'portrait',
      fontSize = 10,
      includeTimestamp = true,
      includeHeader = true,
      includeFooter = true,
      practiceName = 'Dermatology Practice',
      practiceAddress,
    } = options;

    // Create PDF document
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'letter',
    });

    let yPosition = 15;

    // Add practice header
    if (includeHeader) {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(practiceName, 15, yPosition);
      yPosition += 7;

      if (practiceAddress) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(practiceAddress, 15, yPosition);
        yPosition += 5;
      }

      yPosition += 5;
    }

    // Add title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 15, yPosition);
    yPosition += 7;

    // Add generation timestamp
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${formatDate(new Date(), 'datetime')}`, 15, yPosition);
    yPosition += 10;

    // Prepare table data
    let tableHeaders: string[];
    let tableData: any[][];

    if (columns) {
      tableHeaders = columns.map(col => col.label);
      tableData = data.map(row =>
        columns.map(col => {
          let value = getNestedValue(row, col.key);
          return col.format ? col.format(value) : value;
        })
      );
    } else if (headers) {
      tableHeaders = headers;
      tableData = data.map(row =>
        headers.map(key => getNestedValue(row, key))
      );
    } else {
      // Auto-detect from first object
      const keys = Object.keys(data[0]);
      tableHeaders = keys;
      tableData = data.map(row => keys.map(key => row[key]));
    }

    // Add table
    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: yPosition,
      styles: {
        fontSize: fontSize,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [107, 70, 193], // Brand purple
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        // Add footer with page numbers
        if (includeFooter) {
          const pageCount = doc.getNumberOfPages();
          const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(
            `Page ${currentPage} of ${pageCount}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
          );
        }
      },
    });

    // Generate filename
    const timestamp = includeTimestamp ? `_${getTimestamp()}` : '';
    const finalFilename = `${sanitizeFilename(filename)}${timestamp}.pdf`;

    // Save PDF
    doc.save(finalFilename);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  }
}

/**
 * Helper function to convert table data to exportable format
 */
export function prepareTableData(
  rows: any[],
  columnMapping: Record<string, string>
): any[] {
  return rows.map(row => {
    const mappedRow: Record<string, any> = {};
    Object.entries(columnMapping).forEach(([key, label]) => {
      mappedRow[label] = getNestedValue(row, key);
    });
    return mappedRow;
  });
}

/**
 * Trigger browser print dialog with optional print-specific styles
 */
export function printPage(): void {
  window.print();
}

/**
 * Create a printable version of content in a new window
 */
export function printContent(htmlContent: string, title: string = 'Print'): void {
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    throw new Error('Unable to open print window. Please check popup blocker settings.');
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            line-height: 1.6;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #6B46C1;
            color: white;
          }
          @media print {
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 100);
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * Log export action for audit trail (HIPAA compliance)
 */
export async function logExportAction(
  entityType: string,
  exportType: 'csv' | 'pdf' | 'print',
  recordCount: number,
  userId?: string
): Promise<void> {
  try {
    // This should integrate with your audit logging API
    console.log('[EXPORT AUDIT]', {
      entityType,
      exportType,
      recordCount,
      userId,
      timestamp: new Date().toISOString(),
    });

    // TODO: Send to backend audit trail
    // await fetch('/api/audit/export', {
    //   method: 'POST',
    //   body: JSON.stringify({ entityType, exportType, recordCount, userId }),
    // });
  } catch (error) {
    console.error('Failed to log export action:', error);
    // Don't throw - logging failure shouldn't prevent export
  }
}

/**
 * Validate export size and warn user if too large
 */
export function validateExportSize(recordCount: number, maxRecords: number = 10000): boolean {
  if (recordCount > maxRecords) {
    const proceed = window.confirm(
      `You are about to export ${recordCount.toLocaleString()} records. ` +
      `This may take some time and result in a large file. Continue?`
    );
    return proceed;
  }
  return true;
}

/**
 * Show export progress for large datasets
 */
export class ExportProgress {
  private modal: HTMLDivElement | null = null;
  private progressBar: HTMLDivElement | null = null;
  private statusText: HTMLParagraphElement | null = null;

  show(message: string = 'Preparing export...'): void {
    // Create modal overlay
    this.modal = document.createElement('div');
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      min-width: 300px;
      text-align: center;
    `;

    this.statusText = document.createElement('p');
    this.statusText.textContent = message;
    this.statusText.style.marginBottom = '15px';

    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      width: 100%;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    `;

    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      width: 0%;
      height: 100%;
      background: #6B46C1;
      transition: width 0.3s ease;
      animation: pulse 1.5s infinite;
    `;

    this.progressBar.appendChild(progressFill);
    content.appendChild(this.statusText);
    content.appendChild(this.progressBar);
    this.modal.appendChild(content);
    document.body.appendChild(this.modal);

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(style);
  }

  updateProgress(percent: number, message?: string): void {
    if (this.progressBar) {
      const fill = this.progressBar.firstElementChild as HTMLDivElement;
      if (fill) {
        fill.style.width = `${percent}%`;
      }
    }
    if (message && this.statusText) {
      this.statusText.textContent = message;
    }
  }

  hide(): void {
    if (this.modal) {
      document.body.removeChild(this.modal);
      this.modal = null;
      this.progressBar = null;
      this.statusText = null;
    }
  }
}
