import {
  exportToCSV,
  exportToPDF,
  formatCurrency,
  formatDate,
  formatPhone,
  getTimestamp,
  sanitizeFilename,
  prepareTableData,
  printContent,
  validateExportSize,
  ExportProgress,
} from '../export';

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
      pageSize: { width: 210, height: 297 },
      getCurrentPageInfo: () => ({ pageNumber: 1 }),
    },
  };
  const jsPDF = vi.fn(function () {
    return doc;
  });
  const autoTable = vi.fn((docArg, options) => {
    (docArg as any).lastAutoTable = { finalY: 50 };
    options?.didDrawPage?.({});
  });

  return { doc, save, jsPDF, autoTable };
});

vi.mock('jspdf', () => ({
  default: pdfMocks.jsPDF,
}));

vi.mock('jspdf-autotable', () => ({
  default: pdfMocks.autoTable,
}));

describe('export utilities', () => {
  beforeEach(() => {
    pdfMocks.save.mockClear();
    pdfMocks.jsPDF.mockClear();
    pdfMocks.autoTable.mockClear();
  });

  it('formats helpers correctly', () => {
    expect(formatCurrency(12345)).toContain('$');
    expect(formatCurrency(null)).toBe('$0.00');

    expect(formatPhone('1234567890')).toBe('(123) 456-7890');
    expect(formatPhone('+11234567890')).toBe('+1 (123) 456-7890');
    expect(formatPhone('abc')).toBe('abc');

    expect(formatDate(null)).toBe('');
    expect(formatDate('2024-01-02T00:00:00Z')).toContain('/');

    expect(getTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}$/);
    expect(sanitizeFilename('My Report.pdf')).toBe('my_report_pdf');
  });

  it('exports CSV data and handles empty datasets', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    expect(() => exportToCSV([], 'empty')).toThrow('No data to export');

    exportToCSV([{ name: 'Alice', age: 30 }], 'patients', { includeTimestamp: false });
    expect(urlSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    urlSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('exports PDF data and throws on empty datasets', () => {
    expect(() => exportToPDF([], 'report')).toThrow('No data to export');

    exportToPDF(
      [{ name: 'Alice', age: 30 }],
      'report',
      { includeTimestamp: false, practiceName: 'Test Practice' }
    );

    expect(pdfMocks.jsPDF).toHaveBeenCalled();
    expect(pdfMocks.autoTable).toHaveBeenCalled();
    expect(pdfMocks.save).toHaveBeenCalled();
  });

  it('prepares table data and validates export size', () => {
    const mapped = prepareTableData(
      [{ user: { name: 'Alice' }, age: 30 }],
      { 'user.name': 'Name', age: 'Age' }
    );
    expect(mapped).toEqual([{ Name: 'Alice', Age: 30 }]);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(validateExportSize(200, 100)).toBe(false);
    confirmSpy.mockRestore();

    expect(validateExportSize(50, 100)).toBe(true);
  });

  it('prints content or throws if popup blocked', () => {
    const originalOpen = window.open;
    const write = vi.fn();
    const close = vi.fn();
    const print = vi.fn();

    window.open = vi.fn(() => ({
      document: { write, close },
      print,
    })) as typeof window.open;

    printContent('<p>Hello</p>', 'Title');
    expect(write).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();

    window.open = vi.fn(() => null) as typeof window.open;
    expect(() => printContent('<p>Fail</p>')).toThrow('Unable to open print window');

    window.open = originalOpen;
  });

  it('shows and hides export progress', () => {
    const progress = new ExportProgress();
    progress.show('Working...');

    const modal = document.body.querySelector('div');
    expect(modal).toBeTruthy();

    progress.updateProgress(50, 'Halfway');
    const fill = modal?.querySelector('div div div');
    expect((fill as HTMLDivElement)?.style.width).toBe('50%');

    progress.hide();
    expect(document.body.querySelector('div')).toBeNull();
  });
});
