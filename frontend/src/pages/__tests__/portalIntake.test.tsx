import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import IntakePage from '../Portal/IntakePage';

const apiMocks = vi.hoisted(() => ({
  fetchPortalIntakeForms: vi.fn(),
  fetchPortalIntakeForm: vi.fn(),
  startPortalIntakeForm: vi.fn(),
  savePortalIntakeResponse: vi.fn(),
}));

vi.mock('../../portalApi', () => apiMocks);

describe('IntakePage', () => {
  beforeEach(() => {
    apiMocks.savePortalIntakeResponse.mockResolvedValue({ id: 'resp-1', status: 'draft' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('continues a draft form and returns to the list', async () => {
    const draftForm = {
      assignment_id: 'assign-1',
      status: 'assigned',
      template_id: 'temp-1',
      name: 'Medical History',
      description: 'Tell us about your history',
      formType: 'intake',
      formSchema: {
        sections: [
          {
            title: 'Basics',
            fields: [
              { id: 'allergies', type: 'text', label: 'Allergies', required: false },
            ],
          },
        ],
      },
      response_id: 'resp-1',
      response_status: 'draft',
      responseData: { allergies: 'Peanuts' },
    };

    apiMocks.fetchPortalIntakeForms.mockResolvedValue({ forms: [draftForm] });
    apiMocks.fetchPortalIntakeForm.mockResolvedValue(draftForm);

    render(<IntakePage tenantId="tenant-1" portalToken="token-1" />);

    expect(await screen.findByText('Intake Forms')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue Form' }));

    expect(await screen.findByDisplayValue('Peanuts')).toBeInTheDocument();
    expect(apiMocks.startPortalIntakeForm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Forms List' }));
    expect(await screen.findByText('Intake Forms')).toBeInTheDocument();
  });

  it('validates, saves a draft, and submits a new form', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const newForm = {
      assignment_id: 'assign-2',
      status: 'assigned',
      template_id: 'temp-2',
      name: 'New Patient Intake',
      formType: 'intake',
      formSchema: {
        sections: [
          {
            title: 'Basics',
            fields: [
              { id: 'symptoms', type: 'text', label: 'Symptoms', required: true },
              { id: 'consent', type: 'yes_no', label: 'Do you agree?', required: true },
            ],
          },
        ],
      },
    };

    apiMocks.fetchPortalIntakeForms.mockResolvedValue({ forms: [newForm] });
    apiMocks.fetchPortalIntakeForm.mockResolvedValue(newForm);
    apiMocks.startPortalIntakeForm.mockResolvedValue({ responseId: 'resp-2' });

    render(<IntakePage tenantId="tenant-1" portalToken="token-1" />);

    expect(await screen.findByText('Intake Forms')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Start Form' }));

    await screen.findByLabelText(/Symptoms/i);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Form' }));

    expect(
      await screen.findByText('Please complete all required fields in "Basics"')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Symptoms/i), { target: { value: 'Rash' } });
    fireEvent.click(screen.getByLabelText(/Yes/i));

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() =>
      expect(apiMocks.savePortalIntakeResponse).toHaveBeenNthCalledWith(
        1,
        'tenant-1',
        'token-1',
        'resp-2',
        expect.objectContaining({
          submit: false,
          responseData: expect.objectContaining({
            symptoms: 'Rash',
            consent: 'yes',
          }),
        })
      )
    );
    expect(alertSpy).toHaveBeenCalledWith('Draft saved successfully');

    fireEvent.click(screen.getByRole('button', { name: 'Submit Form' }));
    await waitFor(() =>
      expect(apiMocks.savePortalIntakeResponse).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        'token-1',
        'resp-2',
        expect.objectContaining({
          submit: true,
        })
      )
    );

    expect(await screen.findByText('Form Submitted Successfully!')).toBeInTheDocument();

    alertSpy.mockRestore();
  });

  it('shows an error when assigned forms fail to load', async () => {
    apiMocks.fetchPortalIntakeForms.mockRejectedValueOnce(new Error('fail'));

    render(<IntakePage tenantId="tenant-1" portalToken="token-1" />);

    expect(await screen.findByText('Failed to load forms')).toBeInTheDocument();
  });
});
