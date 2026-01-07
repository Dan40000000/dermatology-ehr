import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

const authMocks = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'admin',
  },
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
  },
}));

const apiMocks = vi.hoisted(() => ({
  fetchQualityMeasures: vi.fn(),
  fetchMeasurePerformance: vi.fn(),
  fetchGapClosureList: vi.fn(),
  submitMIPSData: vi.fn(),
  closeQualityGap: vi.fn(),
  recalculateQualityMeasures: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div>Redirect to {to}</div>,
}));

vi.mock('recharts', () => {
  const Mock = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Mock,
    Bar: Mock,
    XAxis: Mock,
    YAxis: Mock,
    CartesianGrid: Mock,
    Tooltip: Mock,
    Legend: Mock,
    ResponsiveContainer: Mock,
    LineChart: Mock,
    Line: Mock,
    PieChart: Mock,
    Pie: Mock,
    Cell: Mock,
  };
});

import QualityPage from '../QualityPage';

describe('QualityPage', () => {
  beforeEach(() => {
    authMocks.user = {
      id: 'user-1',
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'admin',
    };
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
    };
    apiMocks.fetchQualityMeasures.mockResolvedValue([
      { id: 'm1', name: 'Measure 1' },
      { id: 'm2', name: 'Measure 2' },
    ]);
    apiMocks.fetchMeasurePerformance.mockResolvedValue([
      {
        id: 'perf-1',
        measure_code: 'QM-1',
        measure_name: 'Skin Exam',
        category: 'Clinical',
        numerator_count: 8,
        denominator_count: 10,
        exclusion_count: 0,
        performance_rate: '80',
      },
    ]);
    apiMocks.fetchGapClosureList.mockResolvedValue([
      {
        id: 'gap-1',
        priority: 'high',
        measure_code: 'QM-1',
        patient_name: 'Jane Doe',
        gap_description: 'Missing follow-up',
        measure_name: 'Skin Exam',
        due_date: '2024-01-15',
        phone: '555-0000',
      },
    ]);
    apiMocks.submitMIPSData.mockResolvedValue({});
    apiMocks.closeQualityGap.mockResolvedValue({});
    apiMocks.recalculateQualityMeasures.mockResolvedValue({});
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'prompt').mockImplementation(() => 'Done');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:quality');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  }, 15000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders dashboard and handles actions across tabs', async () => {
    render(<QualityPage />);

    await waitFor(() => {
      expect(screen.getByText('Quality Measures & MIPS Reporting')).toBeInTheDocument();
    });

    const recalcButton = await screen.findByRole('button', { name: 'Recalculate' });
    await waitFor(() => expect(recalcButton).not.toBeDisabled());

    const yearSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(yearSelect, { target: { value: '2024' } });
    await waitFor(() => expect(recalcButton).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();

    fireEvent.click(recalcButton);
    await waitFor(() => expect(apiMocks.recalculateQualityMeasures).toHaveBeenCalled());
    expect(window.alert).toHaveBeenCalledWith('Quality measures recalculated successfully');
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'gaps' }));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close Gap' }));
    await waitFor(() => expect(apiMocks.closeQualityGap).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      'gap-1',
      'Done'
    ));
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'reports' }));
    expect(screen.getByText('Available Reports')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('MIPS Submission Wizard');

    const submitSection = screen.getByText('MIPS Submission Wizard').closest('div');
    const submitSelect = within(submitSection as HTMLElement).getByRole('combobox');
    fireEvent.change(submitSelect, { target: { value: '1' } });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Submit to MIPS' }));
    await waitFor(() => expect(apiMocks.submitMIPSData).toHaveBeenCalled());
    expect(window.alert).toHaveBeenCalledWith('MIPS data submitted successfully');

    fireEvent.click(screen.getByRole('button', { name: 'Download Report' }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('redirects when user lacks access', () => {
    authMocks.user = {
      id: 'user-2',
      email: 'staff@example.com',
      fullName: 'Staff User',
      role: 'staff',
    };
    authMocks.session = null as any;

    render(<QualityPage />);
    expect(screen.getByText('Redirect to /home')).toBeInTheDocument();
  });
});
