import {
  exportToCSV,
  exportToPDF,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../exportUtils';

const pdfMocks = vi.hoisted(() => {
  const save = vi.fn();
  const setFontSize = vi.fn();
  const setFont = vi.fn();
  const text = vi.fn();
  const setPage = vi.fn();
  const getNumberOfPages = vi.fn(() => 1);
  const doc = {
    save,
    setFontSize,
    setFont,
    text,
    setPage,
    getNumberOfPages,
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
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

describe('exportUtils helpers', () => {
  beforeEach(() => {
    pdfMocks.save.mockClear();
    pdfMocks.jsPDF.mockClear();
    pdfMocks.autoTable.mockClear();
  });

  it('formats currency and dates', () => {
    expect(formatCurrency(12345)).toBe('$123.45');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatDate(null)).toBe('N/A');
    expect(formatDate('2024-01-01')).toContain('/');
    expect(formatDateTime('2024-01-01')).toContain(':');
  });

  it('exports CSV data and handles empty datasets', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const alertSpy = vi.spyOn(globalThis, 'alert' as any).mockImplementation(() => {});
    const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

    exportToCSV([], 'empty');
    expect(alertSpy).toHaveBeenCalledWith('No data to export');

    exportToCSV([{ name: 'Alice', age: 30 }], 'patients');
    expect(urlSpy).toHaveBeenCalled();

    alertSpy.mockRestore();
    urlSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('exports PDF data and handles empty datasets', () => {
    const alertSpy = vi.spyOn(globalThis, 'alert' as any).mockImplementation(() => {});
    exportToPDF({ title: 'Report', headers: ['Name'], data: [], filename: 'report.pdf' });
    expect(alertSpy).toHaveBeenCalledWith('No data to export');
    alertSpy.mockRestore();

    exportToPDF({
      title: 'Report',
      headers: ['Name', 'Age'],
      data: [['Alice', '30']],
      filename: 'report.pdf',
      summary: [{ label: 'Total', value: '1' }],
    });

    expect(pdfMocks.jsPDF).toHaveBeenCalled();
    expect(pdfMocks.autoTable).toHaveBeenCalled();
    expect(pdfMocks.save).toHaveBeenCalledWith('report.pdf');
  });
});
