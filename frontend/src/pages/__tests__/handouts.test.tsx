import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HandoutsPage, normalizeTemplatePlaceholders, renderTemplateContent } from '../HandoutsPage';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    user: { id: 'user-1', email: 'demo@example.com', role: 'admin', fullName: 'Admin User' },
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../components/ui', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock('../../api', () => ({
  fetchAppointments: vi.fn(),
  fetchOrders: vi.fn(),
  fetchPatients: vi.fn(),
  recordPrintedDocument: vi.fn(),
}));

vi.mock('../../utils/apiBase', () => ({
  API_BASE_URL: 'http://localhost:4000',
}));

const handouts = [
  {
    id: 'system-1',
    title: 'System Biopsy Aftercare',
    category: 'General Information',
    condition: 'Biopsy Site Care',
    content: 'Keep {patient name} bandage clean.',
    instruction_type: 'aftercare',
    template_key: 'system-biopsy',
    print_disclaimer: '',
    is_system_template: true,
    is_active: true,
    created_at: '2026-05-26T08:00:00Z',
  },
  {
    id: 'custom-1',
    title: 'Custom Wound Care',
    category: 'Procedure',
    condition: 'Procedure follow-up',
    content: 'Have {patient name} remove bandage twice daily.',
    instruction_type: 'general',
    template_key: 'custom-wound',
    print_disclaimer: '',
    is_system_template: false,
    is_active: true,
    created_at: '2026-05-26T08:05:00Z',
  },
];

const assignedDocument = {
  id: 'doc-1',
  patientId: 'patient-1',
  title: 'Custom Wound Care',
  type: 'printed_document',
  category: 'Printed Documents',
  description: 'General handout for Procedure follow-up',
  url: '/api/documents/doc-1/file',
  storage: 'local',
  createdAt: '2026-05-26T09:00:00Z',
  patientName: 'Mila Young',
};

describe('HandoutsPage helpers', () => {
  it('normalizes friendly patient placeholders to canonical tokens', () => {
    expect(normalizeTemplatePlaceholders('Have {patient name} remove bandage.')).toBe(
      'Have {{patient_name}} remove bandage.',
    );
  });

  it('renders friendly and canonical placeholders with selected patient values', () => {
    const rendered = renderTemplateContent('Have {patient name} follow {{ provider_name }} instructions.', {
      patientName: 'Mila Young',
      patientDob: '8/2/1978',
      providerName: 'Admin User',
      medicationName: '',
      dosageInstructions: '',
      labSummary: '',
      followUpDate: '',
    });

    expect(rendered).toContain('Have Mila Young follow Admin User instructions.');
  });
});

describe('HandoutsPage tabs', () => {
  beforeEach(() => {
    toastMocks.showError.mockClear();
    toastMocks.showSuccess.mockClear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/handouts')) {
        return new Response(JSON.stringify(handouts), { status: 200 });
      }
      if (url.includes('/api/documents')) {
        return new Response(JSON.stringify({ documents: [assignedDocument] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the custom menu tab to show only office-created templates', async () => {
    render(
      <MemoryRouter initialEntries={['/handouts?tab=custom']}>
        <HandoutsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Custom Wound Care')).toBeInTheDocument());
    expect(screen.queryByText('System Biopsy Aftercare')).not.toBeInTheDocument();
  });

  it('allows system templates to be hidden and custom templates to be deleted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/handouts']}>
        <HandoutsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('System Biopsy Aftercare')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/handouts/system-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      'Hide this system template from the active library? It can be restored later by an admin.',
    );
  });

  it('uses the assigned menu tab to show saved patient handouts', async () => {
    render(
      <MemoryRouter initialEntries={['/handouts?tab=assigned']}>
        <HandoutsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Mila Young')).toBeInTheDocument());
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText('Printed Documents')).toBeInTheDocument();
  });
});
