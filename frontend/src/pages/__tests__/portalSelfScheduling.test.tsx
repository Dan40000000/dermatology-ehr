import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import SelfSchedulingPage from '../Portal/SelfSchedulingPage';

describe('SelfSchedulingPage', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/patient-portal/scheduling/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            isEnabled: true,
            minAdvanceHours: 24,
            maxAdvanceDays: 60,
            customMessage: 'Welcome to our online booking system!',
            requireReason: false,
          }),
        });
      }
      if (url.includes('/api/patient-portal/scheduling/providers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            providers: [
              {
                id: 'prov-1',
                fullName: 'Dr. Sarah Johnson',
                specialty: 'Medical Dermatology',
                bio: 'Board-certified dermatologist specializing in skin cancer screening and treatment.',
              },
              {
                id: 'prov-2',
                fullName: 'Dr. Michael Chen',
                specialty: 'Cosmetic Dermatology',
                bio: 'Expert in cosmetic procedures including Botox, fillers, and laser treatments.',
              },
            ],
          }),
        });
      }
      if (url.includes('/api/patient-portal/scheduling/appointment-types')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            appointmentTypes: [
              {
                id: 'type-1',
                name: 'New Patient Visit',
                durationMinutes: 60,
                description: 'Comprehensive initial consultation',
                color: '#4CAF50',
              },
              {
                id: 'type-2',
                name: 'Skin Check',
                durationMinutes: 30,
                description: 'Full body skin cancer screening',
                color: '#FF9800',
              },
            ],
          }),
        });
      }
      if (url.includes('/api/patient-portal/scheduling/availability')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            slots: [
              {
                startTime: '2024-10-10T09:00:00',
                endTime: '2024-10-10T10:00:00',
                providerId: 'prov-1',
              },
            ],
          }),
        });
      }
      if (url.includes('/api/patient-portal/scheduling/book')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true }),
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Unknown endpoint' }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it('books an appointment through the self-scheduling flow', async () => {
    render(<SelfSchedulingPage tenantId="tenant-1" portalToken="token-1" />);

    expect(await screen.findByText('Book an Appointment')).toBeInTheDocument();
    expect(screen.getByText('Welcome to our online booking system!')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByText('Dr. Sarah Johnson'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('What brings you in?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Skin Check'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Pick a Date and Time')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Select Date'), { target: { value: '2024-10-10' } });

    const slotButton = await screen.findByRole('button', { name: /9:00/i });
    fireEvent.click(slotButton);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Confirm Your Appointment')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Reason for Visit/i), { target: { value: 'Checkup' } });
    fireEvent.change(screen.getByLabelText(/Additional Notes/i), { target: { value: 'Prefer morning' } });

    fireEvent.click(screen.getByRole('button', { name: 'Book Appointment' }));

    expect(
      await screen.findByText('Appointment Confirmed!', {}, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Sarah Johnson/i)).toBeInTheDocument();
    expect(screen.getByText(/Skin Check/i)).toBeInTheDocument();
  });
});
