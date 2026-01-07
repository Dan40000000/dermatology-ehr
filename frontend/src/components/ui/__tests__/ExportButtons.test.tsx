import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportButtons } from '../ExportButtons';

const exportMocks = vi.hoisted(() => ({
  exportToCSV: vi.fn(),
  exportToPDF: vi.fn(),
  printPage: vi.fn(),
}));

vi.mock('../../../utils/export', () => exportMocks);

describe('ExportButtons', () => {
  beforeEach(() => {
    exportMocks.exportToCSV.mockClear();
    exportMocks.exportToPDF.mockClear();
    exportMocks.printPage.mockClear();
  });

  it('exports data with button variant', () => {
    const onExport = vi.fn();
    render(
      <ExportButtons
        data={[{ id: 1, name: 'Test' }]}
        filename="report"
        onExport={onExport}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(onExport).toHaveBeenCalledWith('csv');
    expect(exportMocks.exportToCSV).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onExport).toHaveBeenCalledWith('pdf');
    expect(exportMocks.exportToPDF).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onExport).toHaveBeenCalledWith('print');
    expect(exportMocks.printPage).toHaveBeenCalled();
  });

  it('renders dropdown actions and handles errors', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    exportMocks.exportToCSV.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    render(
      <ExportButtons
        data={[{ id: 1 }]}
        filename="report"
        variant="dropdown"
        showPDF={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export as CSV' }));

    expect(alertSpy).toHaveBeenCalledWith('Failed to export CSV. Please try again.');
    alertSpy.mockRestore();
  });

  it('skips exports when disabled or empty', () => {
    render(
      <ExportButtons
        data={[]}
        filename="report"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(exportMocks.exportToCSV).not.toHaveBeenCalled();
  });
});
