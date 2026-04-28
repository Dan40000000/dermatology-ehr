import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar } from '../Calendar';
import type { Appointment, Provider } from '../../../types';

const provider: Provider = {
  id: 'provider-1',
  tenantId: 'tenant-1',
  fullName: 'Dr. Phil Jackson - PA',
  name: 'Dr. Phil Jackson - PA',
  specialty: 'Dermatology',
  createdAt: '2026-04-01T00:00:00.000Z',
};

const buildAppointment = (
  id: string,
  patientName: string,
  scheduledStart: string,
  scheduledEnd: string,
  appointmentTypeName = 'Follow Up',
): Appointment => ({
  id,
  tenantId: 'tenant-1',
  patientId: `patient-${id}`,
  patientName,
  providerId: provider.id,
  providerName: provider.fullName,
  locationId: 'loc-1',
  locationName: 'Virtual Care',
  appointmentTypeId: `type-${id}`,
  appointmentTypeName,
  scheduledStart,
  scheduledEnd,
  status: 'scheduled',
  createdAt: '2026-04-01T00:00:00.000Z',
});

describe('Calendar', () => {
  it('renders overlapping appointments side by side instead of dropping one', () => {
    render(
      <Calendar
        currentDate={new Date(2026, 3, 27, 9, 0, 0, 0)}
        viewMode="day"
        appointments={[
          buildAppointment(
            'appt-1',
            'Marcus Williams',
            '2026-04-27T16:00:00.000Z',
            '2026-04-27T16:20:00.000Z',
            'Video Acne Follow-Up',
          ),
          buildAppointment(
            'appt-2',
            'Jamie Patient',
            '2026-04-27T16:05:00.000Z',
            '2026-04-27T16:25:00.000Z',
            'Derm Consult',
          ),
        ]}
        providers={[provider]}
        availability={[]}
        timeBlocks={[]}
        selectedAppointment={null}
        onAppointmentClick={vi.fn()}
        onSlotClick={vi.fn()}
      />
    );

    expect(screen.getByText('Marcus Williams')).toBeInTheDocument();
    expect(screen.getByText('Jamie Patient')).toBeInTheDocument();
    expect(screen.getAllByText('Overlap')).toHaveLength(2);
  });
});
