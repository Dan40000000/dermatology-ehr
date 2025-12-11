/**
 * Export Buttons Component
 * Provides standardized export controls with CSV, PDF, and Print options
 */

import { useState } from 'react';
import { exportToCSV, exportToPDF, printPage } from '../../utils/export';
import type { ExportColumn, PDFOptions } from '../../utils/export';

interface ExportButtonsProps {
  data: any[];
  filename: string;
  columns?: ExportColumn[];
  onExport?: (type: 'csv' | 'pdf' | 'print') => void;
  pdfOptions?: Omit<PDFOptions, 'filename'>;
  disabled?: boolean;
  showCSV?: boolean;
  showPDF?: boolean;
  showPrint?: boolean;
  variant?: 'buttons' | 'dropdown';
}

export function ExportButtons({
  data,
  filename,
  columns,
  onExport,
  pdfOptions,
  disabled = false,
  showCSV = true,
  showPDF = true,
  showPrint = true,
  variant = 'buttons',
}: ExportButtonsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleExport = async (type: 'csv' | 'pdf' | 'print') => {
    if (disabled || isExporting || data.length === 0) return;

    setIsExporting(true);
    setShowDropdown(false);

    try {
      // Call optional callback
      onExport?.(type);

      // Perform export
      switch (type) {
        case 'csv':
          exportToCSV(data, filename, { columns });
          break;
        case 'pdf':
          exportToPDF(data, filename, { columns, ...pdfOptions });
          break;
        case 'print':
          printPage();
          break;
      }
    } catch (error) {
      console.error(`Export failed:`, error);
      alert(`Failed to export ${type.toUpperCase()}. Please try again.`);
    } finally {
      setIsExporting(false);
    }
  };

  const buttonClass = `export-btn ${disabled || data.length === 0 ? 'disabled' : ''}`;

  if (variant === 'dropdown') {
    return (
      <div className="export-dropdown-container" style={{ position: 'relative' }}>
        <button
          className="export-dropdown-trigger"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled || data.length === 0}
          style={{
            padding: '8px 16px',
            background: '#6B46C1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: disabled || data.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '500',
            opacity: disabled || data.length === 0 ? 0.5 : 1,
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export {data.length > 0 && `(${data.length})`}
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {showDropdown && !disabled && data.length > 0 && (
          <div
            className="export-dropdown-menu"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              minWidth: '180px',
              zIndex: 1000,
            }}
          >
            {showCSV && (
              <button
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#333',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export as CSV
              </button>
            )}
            {showPDF && (
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#333',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Export as PDF
              </button>
            )}
            {showPrint && (
              <button
                onClick={() => handleExport('print')}
                disabled={isExporting}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#333',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Buttons variant
  return (
    <div className="export-buttons" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {showCSV && (
        <button
          onClick={() => handleExport('csv')}
          disabled={disabled || isExporting || data.length === 0}
          className={buttonClass}
          title={data.length === 0 ? 'No data to export' : 'Export as CSV'}
          style={{
            padding: '8px 16px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: disabled || isExporting || data.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#333',
            fontWeight: '500',
            transition: 'all 0.2s',
            opacity: disabled || data.length === 0 ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !isExporting && data.length > 0) {
              e.currentTarget.style.borderColor = '#6B46C1';
              e.currentTarget.style.color = '#6B46C1';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#ddd';
            e.currentTarget.style.color = '#333';
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          CSV
        </button>
      )}

      {showPDF && (
        <button
          onClick={() => handleExport('pdf')}
          disabled={disabled || isExporting || data.length === 0}
          className={buttonClass}
          title={data.length === 0 ? 'No data to export' : 'Export as PDF'}
          style={{
            padding: '8px 16px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: disabled || isExporting || data.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#333',
            fontWeight: '500',
            transition: 'all 0.2s',
            opacity: disabled || data.length === 0 ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !isExporting && data.length > 0) {
              e.currentTarget.style.borderColor = '#6B46C1';
              e.currentTarget.style.color = '#6B46C1';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#ddd';
            e.currentTarget.style.color = '#333';
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          PDF
        </button>
      )}

      {showPrint && (
        <button
          onClick={() => handleExport('print')}
          disabled={disabled || isExporting}
          className={`${buttonClass} no-print`}
          title="Print"
          style={{
            padding: '8px 16px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: disabled || isExporting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#333',
            fontWeight: '500',
            transition: 'all 0.2s',
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !isExporting) {
              e.currentTarget.style.borderColor = '#6B46C1';
              e.currentTarget.style.color = '#6B46C1';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#ddd';
            e.currentTarget.style.color = '#333';
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      )}

      {isExporting && (
        <span style={{ fontSize: '14px', color: '#666' }}>Exporting...</span>
      )}
    </div>
  );
}

/**
 * Simple export button (single action)
 */
interface SimpleExportButtonProps {
  onClick: () => void;
  label?: string;
  icon?: 'csv' | 'pdf' | 'print' | 'download';
  disabled?: boolean;
  loading?: boolean;
}

export function SimpleExportButton({
  onClick,
  label = 'Export',
  icon = 'download',
  disabled = false,
  loading = false,
}: SimpleExportButtonProps) {
  const icons = {
    csv: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    pdf: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    print: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
    ),
    download: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '8px 16px',
        background: '#6B46C1',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.2s',
        opacity: disabled || loading ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = '#5A3AA0';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#6B46C1';
      }}
    >
      {loading ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" opacity="0.25" />
          <path d="M12 2 A10 10 0 0 1 22 12" strokeWidth="4" stroke="currentColor">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="1s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      ) : (
        icons[icon]
      )}
      {label}
    </button>
  );
}
