import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchPatients: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../../api', () => ({
  fetchPatients: apiMocks.fetchPatients,
}));

vi.mock('../../components/ui', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height} />,
  ExportButtons: ({
    data,
    filename,
    columns,
  }: {
    data?: Record<string, unknown>[];
    filename?: string;
    columns?: Array<{ key?: string; format?: (value: unknown) => unknown }>;
  }) => {
    columns?.forEach((column) => {
      if (typeof column.format === 'function') {
        const sample = column.key ? data?.[0]?.[column.key] : undefined;
        column.format(sample ?? '2024-01-01');
      }
    });
    return (
      <div data-testid="export-buttons" data-count={data?.length ?? 0} data-filename={filename ?? ''} />
    );
  },
}));

import { PatientsPage } from '../PatientsPage';

const buildPatients = (count = 25) => {
  const patients = Array.from({ length: count }, (_, idx) => {
    const id = idx + 1;
    return {
      id: `patient-${id}`,
      firstName: `First${id}`,
      lastName: `Last${String(id).padStart(2, '0')}`,
      mrn: `MRN-${id}`,
      phone: `555-000-${String(id).padStart(4, '0')}`,
      email: `patient${id}@example.com`,
    };
  });

  if (patients[0]) {
    patients[0] = {
      ...patients[0],
      firstName: 'Zack',
      lastName: 'Alpha',
      mrn: 'MRN-1',
      phone: '(555) 000-0001',
      dateOfBirth: '1990-01-01',
      lastVisit: '2024-01-15',
      preferredName: 'Z',
      pmsId: 'PMS-1',
    } as any;
  }

  if (patients[1]) {
    patients[1] = {
      ...patients[1],
      firstName: 'Aaron',
      lastName: 'Zulu',
      mrn: 'MRN-2',
      phone: '(555) 000-0002',
    };
  }

  return patients;
};

describe('PatientsPage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    toastMocks.showError.mockClear();
    apiMocks.fetchPatients.mockReset();
    navigateMock.mockReset();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders patients, supports sorting, paging, searching, and navigation', async () => {
    const patients = buildPatients();
    apiMocks.fetchPatients.mockResolvedValue({ patients });

    render(<PatientsPage />);

    await screen.findByText('Patient Search Results');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    const exportStub = screen.getByTestId('export-buttons');
    expect(exportStub).toHaveAttribute('data-count', '20');

    const registerButton = screen.getByRole('button', { name: /Register New Patient/ });
    fireEvent.mouseEnter(registerButton);
    fireEvent.mouseLeave(registerButton);
    fireEvent.click(registerButton);
    expect(navigateMock).toHaveBeenCalledWith('/patients/new');

    const advancedButton = screen.getByRole('button', { name: /Advanced Search/ });
    fireEvent.mouseEnter(advancedButton);
    fireEvent.mouseLeave(advancedButton);

    const handoutButton = screen.getByRole('button', { name: /Patient Handout Library/ });
    fireEvent.mouseEnter(handoutButton);
    fireEvent.mouseLeave(handoutButton);

    const firstRow = screen.getAllByRole('row')[1];
    expect(within(firstRow).getByText('Alpha')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Alpha' }));
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1');
    fireEvent.click(screen.getByRole('link', { name: 'Zack' }));
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1');

    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(window.scrollTo).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('export-buttons')).toHaveAttribute('data-count', '5'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument());

    const lastNameHeader = screen.getByRole('columnheader', { name: /Last Name/ });
    fireEvent.click(lastNameHeader);
    const sortedRowLastName = screen.getAllByRole('row')[1];
    expect(within(sortedRowLastName).getByText('Zulu')).toBeInTheDocument();

    const firstNameHeader = screen.getByRole('columnheader', { name: /First Name/ });
    fireEvent.click(firstNameHeader);
    const sortedRowAsc = screen.getAllByRole('row')[1];
    expect(within(sortedRowAsc).getByText('Zulu')).toBeInTheDocument();
    fireEvent.click(firstNameHeader);
    const sortedRowDesc = screen.getAllByRole('row')[1];
    expect(within(sortedRowDesc).getByText('Alpha')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Inactive'));
    fireEvent.click(screen.getByLabelText('Active'));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const searchSelect = screen.getByRole('combobox');
    const searchInput = screen.getByPlaceholderText('Enter search term...');

    fireEvent.change(searchSelect, { target: { value: 'mrn' } });
    fireEvent.change(searchInput, { target: { value: 'MRN-5' } });
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(screen.getByText('Last05')).toBeInTheDocument();

    fireEvent.change(searchSelect, { target: { value: 'phone' } });
    fireEvent.change(searchInput, { target: { value: '0005' } });
    await waitFor(() => expect(screen.queryByText('Last06')).not.toBeInTheDocument());
    expect(screen.getByText('Last05')).toBeInTheDocument();

    fireEvent.change(searchSelect, { target: { value: 'name' } });
    fireEvent.change(searchInput, { target: { value: 'notfound' } });
    await waitFor(() => expect(screen.getByText('No patients found')).toBeInTheDocument());
  }, 15000);

  it('renders skeletons when session is missing', () => {
    authMocks.session = null;

    render(<PatientsPage />);

    expect(screen.getAllByTestId('skeleton')).toHaveLength(5);
    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
  });

  it('handles empty patient responses', async () => {
    apiMocks.fetchPatients.mockResolvedValueOnce({});

    render(<PatientsPage />);

    await screen.findByText('Patient Search Results');
    expect(screen.getByText('No patients found')).toBeInTheDocument();
    expect(screen.getByTestId('export-buttons')).toHaveAttribute('data-count', '0');
  });

  it('sorts by additional fields and handles phone search edge cases', async () => {
    const patients = [
      {
        id: 'patient-1',
        firstName: 'Ann',
        lastName: 'Beta',
        mrn: 'MRN-2',
        phone: '555-000-2222',
        email: 'b@example.com',
        dateOfBirth: '1980-01-01',
        lastVisit: '2024-02-01',
      },
      {
        id: 'patient-2',
        firstName: 'Ben',
        lastName: 'Alpha',
        mrn: 'MRN-1',
        phone: '555-000-1111',
        email: 'a@example.com',
        dateOfBirth: '1990-01-01',
        lastVisit: '2024-03-01',
      },
      {
        id: 'patient-3',
        firstName: 'Cara',
        lastName: '',
        mrn: '',
        phone: '',
        email: '',
        dateOfBirth: '',
        lastVisit: '',
      },
      {
        id: 'patient-4',
        firstName: '',
        lastName: 'Delta',
        mrn: 'MRN-4',
        phone: '555-000-0000',
        email: '',
        dateOfBirth: '1970-01-01',
        lastVisit: '',
      },
    ];
    apiMocks.fetchPatients.mockResolvedValueOnce({ patients });

    render(<PatientsPage />);

    await screen.findByText('Patient Search Results');

    const lastNameHeader = screen.getByRole('columnheader', { name: /Last Name/ });
    fireEvent.click(lastNameHeader);

    const mrnHeader = screen.getByRole('columnheader', { name: /MRN/ });
    fireEvent.click(mrnHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Cara' })).toBeInTheDocument()
    );
    expect(within(screen.getAllByRole('row')[1]).getAllByText('—').length).toBeGreaterThan(0);
    fireEvent.click(mrnHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Delta' })).toBeInTheDocument()
    );

    const firstNameHeader = screen.getByRole('columnheader', { name: /First Name/ });
    fireEvent.click(firstNameHeader);
    fireEvent.click(firstNameHeader);
    fireEvent.click(firstNameHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Delta' })).toBeInTheDocument()
    );

    const dobHeader = screen.getByRole('columnheader', { name: /DOB/ });
    fireEvent.click(dobHeader);
    fireEvent.click(dobHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Alpha' })).toBeInTheDocument()
    );

    const phoneHeader = screen.getByRole('columnheader', { name: /Phone/ });
    fireEvent.click(phoneHeader);
    fireEvent.click(phoneHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Beta' })).toBeInTheDocument()
    );

    const emailHeader = screen.getByRole('columnheader', { name: /Email/ });
    fireEvent.click(emailHeader);
    fireEvent.click(emailHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Beta' })).toBeInTheDocument()
    );

    const lastVisitHeader = screen.getByRole('columnheader', { name: /Last Visit/ });
    fireEvent.click(lastVisitHeader);
    fireEvent.click(lastVisitHeader);
    await waitFor(() =>
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'Alpha' })).toBeInTheDocument()
    );

    const searchSelect = screen.getByRole('combobox');
    const searchInput = screen.getByPlaceholderText('Enter search term...');

    fireEvent.change(searchSelect, { target: { value: 'other' } });
    fireEvent.change(searchInput, { target: { value: 'Beta' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument());

    fireEvent.change(searchSelect, { target: { value: 'phone' } });
    fireEvent.change(searchInput, { target: { value: 'abc' } });
    await waitFor(() => expect(screen.getByText('No patients found')).toBeInTheDocument());
  });

  it('renders pagination ellipses and resets the page on search', async () => {
    const patients = buildPatients(120);
    apiMocks.fetchPatients.mockResolvedValueOnce({ patients });

    render(<PatientsPage />);

    await screen.findByText('Patient Search Results');
    expect(screen.getByText(/Page 1 of 6/)).toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    await waitFor(() => expect(screen.getByText(/Page 3 of 6/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Enter search term...'), { target: { value: 'First' } });
    await waitFor(() => expect(screen.getByText(/Page 1 of 6/)).toBeInTheDocument());
  });

  it('surfaces fetch failures through toast', async () => {
    apiMocks.fetchPatients.mockRejectedValue(new Error('fetch failed'));

    render(<PatientsPage />);

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('fetch failed'));
  });

  it('uses fallback error messaging when failure lacks a message', async () => {
    apiMocks.fetchPatients.mockRejectedValueOnce({});

    render(<PatientsPage />);

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('Failed to load patients'));
  });
});
