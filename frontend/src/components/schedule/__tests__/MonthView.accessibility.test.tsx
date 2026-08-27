import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MonthView } from '../MonthView';
import type { Appointment } from '../../../types';

const appointment: Appointment = {
  id: 'a11y-1',
  tenantId: 'demo',
  patientId: 'p-1',
  patientName: 'Jane Doe',
  providerId: 'provider-1',
  appointmentTypeId: 'follow-up',
  appointmentTypeName: 'Follow-up',
  locationId: 'room-1',
  scheduledStart: '2026-08-05T10:00:00.000Z',
  scheduledEnd: '2026-08-05T10:30:00.000Z',
  status: 'scheduled',
  createdAt: '2026-07-01T10:00:00.000Z',
};

describe('MonthView keyboard access', () => {
  it('does not put a day button around an appointment button', () => {
    const onAppointmentClick = vi.fn();
    const onDayClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date(2026, 7, 1)}
        appointments={[appointment]}
        providers={[]}
        selectedAppointment={null}
        onAppointmentClick={onAppointmentClick}
        onDayClick={onDayClick}
      />,
    );

    const appointmentButton = screen.getByRole('button', { name: /Jane Doe.*Follow-up/i });
    expect(appointmentButton.closest('.month-view-day')).not.toHaveAttribute('role', 'button');
    fireEvent.keyDown(appointmentButton, { key: 'Enter' });
    expect(onAppointmentClick).toHaveBeenCalledWith(appointment);
  });
});
