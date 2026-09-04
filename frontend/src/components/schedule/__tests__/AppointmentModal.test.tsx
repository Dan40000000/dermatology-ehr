import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppointmentModal } from '../AppointmentModal';
import { getPracticeDateTime } from '../../../utils/practiceDateTime';

vi.mock('../../ui/Modal', () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title?: string;
    children: any;
  }) => (isOpen ? <div data-testid="modal">{title}{children}</div> : null),
}));

const providers = [
  { id: 'provider-1', tenantId: 'tenant-1', fullName: 'Dr One', name: 'Dr One', createdAt: '2026-01-01' },
  { id: 'provider-2', tenantId: 'tenant-1', fullName: 'Dr Two', name: 'Dr Two', createdAt: '2026-01-01' },
];

const patients = [
  { id: 'patient-1', tenantId: 'tenant-1', firstName: 'Ana', lastName: 'Derm', createdAt: '2026-01-01' },
];

const locations = [
  { id: 'loc-1', tenantId: 'tenant-1', name: 'Main Clinic', createdAt: '2026-01-01' },
];

const appointmentTypes = [
  { id: 'type-1', tenantId: 'tenant-1', name: 'Consult', durationMinutes: 30, createdAt: '2026-01-01' },
];

const toLocalIso = (date: string, time: string): string => {
  return getPracticeDateTime(date, time, 'America/Denver')!.toISOString();
};

describe('AppointmentModal', () => {
  it('shows only provider available times and excludes booked/blocked slots', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AppointmentModal
        isOpen
        onClose={vi.fn()}
        onSave={onSave}
        patients={patients as any}
        providers={providers as any}
        locations={locations as any}
        appointmentTypes={appointmentTypes as any}
        initialData={{
          patientId: 'patient-1',
          providerId: 'provider-1',
          locationId: 'loc-1',
          date: '2026-02-23',
          time: '09:00',
        }}
        availability={[
          { id: 'avail-1', tenantId: 'tenant-1', providerId: 'provider-1', dayOfWeek: 1, startTime: '09:00', endTime: '11:00', createdAt: '2026-01-01' } as any,
        ]}
        appointments={[
          {
            id: 'appt-1',
            tenantId: 'tenant-1',
            patientId: 'patient-1',
            providerId: 'provider-1',
            locationId: 'loc-1',
            appointmentTypeId: 'type-1',
            scheduledStart: toLocalIso('2026-02-23', '09:00'),
            scheduledEnd: toLocalIso('2026-02-23', '09:30'),
            status: 'scheduled',
            createdAt: '2026-01-01',
          } as any,
        ]}
        timeBlocks={[
          {
            id: 'tb-1',
            tenantId: 'tenant-1',
            providerId: 'provider-1',
            title: 'Meeting',
            blockType: 'meeting',
            startTime: toLocalIso('2026-02-23', '10:00'),
            endTime: toLocalIso('2026-02-23', '10:30'),
            isRecurring: false,
            status: 'active',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          } as any,
        ]}
      />
    );

    const timeSelect = screen.getByLabelText(/Time/i);
    await waitFor(() => {
      const optionValues = within(timeSelect).getAllByRole('option').map((option) => option.getAttribute('value'));
      expect(optionValues).toContain('09:30');
      expect(optionValues).toContain('10:30');
      expect(optionValues).not.toContain('09:00');
      expect(optionValues).not.toContain('10:00');
    });
  });

  it('recomputes available times when provider changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AppointmentModal
        isOpen
        onClose={vi.fn()}
        onSave={onSave}
        patients={patients as any}
        providers={providers as any}
        locations={locations as any}
        appointmentTypes={appointmentTypes as any}
        initialData={{
          patientId: 'patient-1',
          providerId: 'provider-1',
          locationId: 'loc-1',
          date: '2026-02-23',
          time: '09:00',
        }}
        availability={[
          { id: 'avail-1', tenantId: 'tenant-1', providerId: 'provider-1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', createdAt: '2026-01-01' } as any,
          { id: 'avail-2', tenantId: 'tenant-1', providerId: 'provider-2', dayOfWeek: 1, startTime: '13:00', endTime: '14:00', createdAt: '2026-01-01' } as any,
        ]}
        appointments={[]}
        timeBlocks={[]}
      />
    );

    const timeSelect = screen.getByLabelText(/Time/i);
    await waitFor(() => {
      const optionValues = within(timeSelect).getAllByRole('option').map((option) => option.getAttribute('value'));
      expect(optionValues).toContain('09:00');
      expect(optionValues).not.toContain('13:00');
    });

    fireEvent.change(screen.getByLabelText(/Provider/i), { target: { value: 'provider-2' } });

    await waitFor(() => {
      const optionValues = within(screen.getByLabelText(/Time/i)).getAllByRole('option').map((option) => option.getAttribute('value'));
      expect(optionValues).toContain('13:00');
      expect(optionValues).not.toContain('09:00');
    });
  });

  it('blocks a slot occupied across the repeated DST fall-back hour', async () => {
    render(
      <AppointmentModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        patients={patients as any}
        providers={providers as any}
        locations={locations as any}
        appointmentTypes={appointmentTypes as any}
        practiceTimeZone="America/Denver"
        initialData={{
          patientId: 'patient-1',
          providerId: 'provider-1',
          locationId: 'loc-1',
          date: '2026-11-01',
          time: '01:30',
        }}
        availability={[
          { id: 'avail-fallback', tenantId: 'tenant-1', providerId: 'provider-1', dayOfWeek: 0, startTime: '01:30', endTime: '02:00', createdAt: '2026-01-01' } as any,
        ]}
        appointments={[
          {
            id: 'appt-fallback',
            tenantId: 'tenant-1',
            patientId: 'patient-1',
            providerId: 'provider-1',
            locationId: 'loc-1',
            appointmentTypeId: 'type-1',
            scheduledStart: '2026-11-01T07:30:00.000Z',
            scheduledEnd: '2026-11-01T08:30:00.000Z',
            status: 'scheduled',
            createdAt: '2026-01-01',
          } as any,
        ]}
        timeBlocks={[]}
      />
    );

    const timeSelect = screen.getByLabelText(/Time/i);
    await waitFor(() => expect(timeSelect).toBeDisabled());
    expect(within(timeSelect).queryByRole('option', { name: '1:30 AM' })).not.toBeInTheDocument();
  });
});
