import { fireEvent, render, screen } from '@testing-library/react';
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

  it('groups and labels near-midnight appointments in the practice time zone', () => {
    render(
      <Calendar
        currentDate={new Date(2026, 3, 26, 12, 0, 0, 0)}
        viewMode="day"
        practiceTimeZone="America/Los_Angeles"
        appointments={[
          buildAppointment(
            'appt-midnight',
            'Pacific Patient',
            '2026-04-27T00:30:00.000Z',
            '2026-04-27T01:00:00.000Z',
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

    expect(screen.getByText('Pacific Patient')).toBeInTheDocument();
    expect(screen.getAllByText('5:30 PM').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Pacific Patient.*5:30 PM/i })).toBeInTheDocument();
  });

  it('groups near-midnight appointments on the correct practice day in month view', () => {
    render(
      <Calendar
        currentDate={new Date(2026, 3, 26, 12, 0, 0, 0)}
        viewMode="month"
        practiceTimeZone="America/Los_Angeles"
        appointments={[
          buildAppointment(
            'appt-month-midnight',
            'Month Pacific Patient',
            '2026-04-27T00:30:00.000Z',
            '2026-04-27T01:00:00.000Z',
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

    const practiceDay = screen.getByRole('group', {
      name: /Sunday, April 26, 2026, 1 appointment/i,
    });
    expect(practiceDay).toHaveTextContent('Month Pacific Patient');
    expect(practiceDay).toHaveTextContent('5:30 PM');
  });

  it('ignores malformed appointment timestamps without crashing the month view', () => {
    render(
      <Calendar
        currentDate={new Date(2026, 3, 26, 12, 0, 0, 0)}
        viewMode="month"
        practiceTimeZone="America/Los_Angeles"
        appointments={[
          buildAppointment(
            'appt-invalid-time',
            'Invalid Time Patient',
            'not-a-timestamp',
            'also-not-a-timestamp',
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

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Time Patient')).not.toBeInTheDocument();
  });

  it('keeps a date-only recurrence end date on the intended calendar day', () => {
    render(
      <Calendar
        currentDate={new Date(2026, 3, 27, 12, 0, 0, 0)}
        viewMode="day"
        practiceTimeZone="America/Los_Angeles"
        appointments={[]}
        providers={[provider]}
        availability={[]}
        timeBlocks={[
          {
            id: 'block-recurring',
            providerId: provider.id,
            title: 'Recurring block',
            blockType: 'other',
            startTime: '2026-04-27T16:00:00.000Z',
            endTime: '2026-04-27T16:30:00.000Z',
            status: 'active',
            isRecurring: true,
            recurrencePattern: 'weekly',
            recurrenceEndDate: '2026-08-27',
          },
        ]}
        selectedAppointment={null}
        onAppointmentClick={vi.fn()}
        onSlotClick={vi.fn()}
      />
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Time block Recurring block/i }));
    expect(screen.getByText('Aug 27, 2026')).toBeInTheDocument();
  });
});
