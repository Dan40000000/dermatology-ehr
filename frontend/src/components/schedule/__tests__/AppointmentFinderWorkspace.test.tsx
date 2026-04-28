import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentFinderWorkspace } from '../AppointmentFinderWorkspace';

const patient = {
  id: 'patient-mason',
  tenantId: 'tenant-demo',
  firstName: 'Mason',
  lastName: 'Anderson',
  dob: '1990-05-15',
  mobilePhone: '5412318693',
  mrn: 'MRN-1001',
  createdAt: '2026-01-01',
};

const provider = {
  id: 'provider-skin',
  tenantId: 'tenant-demo',
  fullName: 'Dr. David Skin',
  name: 'Dr. David Skin',
  createdAt: '2026-01-01',
};

const location = {
  id: 'loc-main',
  tenantId: 'tenant-demo',
  name: 'Main Clinic',
  createdAt: '2026-01-01',
};

const appointmentTypes = [
  {
    id: 'type-botox',
    tenantId: 'tenant-demo',
    name: 'Botox',
    category: 'Cosmetic Services',
    durationMinutes: 15,
    createdAt: '2026-01-01',
  },
  {
    id: 'type-consult',
    tenantId: 'tenant-demo',
    name: 'Derm Consult',
    category: 'Clinical',
    durationMinutes: 30,
    createdAt: '2026-01-01',
  },
];

const appointmentDateTime = (dayOffset: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

describe('AppointmentFinderWorkspace', () => {
  it('searches next available after patient and provider selection without requiring a manual visit-type click', async () => {
    const onUseSlot = vi.fn();
    const onShowSuccess = vi.fn();
    const onShowError = vi.fn();

    render(
      <AppointmentFinderWorkspace
        patients={[patient] as any}
        providers={[provider] as any}
        locations={[location] as any}
        appointmentTypes={appointmentTypes as any}
        appointments={[]}
        timeBlocks={[]}
        availability={[]}
        onUseSlot={onUseSlot}
        onShowSuccess={onShowSuccess}
        onShowError={onShowError}
      />
    );

    fireEvent.change(screen.getByLabelText(/Search patient by name or date of birth/i), {
      target: { value: 'Mason 5/15/1990' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Anderson, Mason/i }));
    fireEvent.click(screen.getByRole('button', { name: /Dr\. David Skin/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next available/i }));
    fireEvent.click(screen.getByRole('button', { name: /Search openings/i }));

    await waitFor(() => expect(onShowSuccess).toHaveBeenCalledWith(expect.stringContaining('Found')));
    expect(onShowError).not.toHaveBeenCalledWith('Select an appointment type first.');
    expect(screen.getAllByText(/Derm Consult/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /Use this slot/i })[0]);

    expect(onUseSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'patient-mason',
        providerId: 'provider-skin',
        locationId: 'loc-main',
        appointmentTypeId: 'type-consult',
        duration: 30,
      })
    );
  });

  it('filters appointment openings to selected specific weekdays', async () => {
    const onUseSlot = vi.fn();
    const onShowSuccess = vi.fn();

    render(
      <AppointmentFinderWorkspace
        patients={[patient] as any}
        providers={[provider] as any}
        locations={[location] as any}
        appointmentTypes={appointmentTypes as any}
        appointments={[]}
        timeBlocks={[]}
        availability={[]}
        onUseSlot={onUseSlot}
        onShowSuccess={onShowSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tue' }));
    fireEvent.click(screen.getByRole('button', { name: /Search openings/i }));

    await waitFor(() => expect(onShowSuccess).toHaveBeenCalledWith(expect.stringContaining('Found')));

    const resultDateLabels = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /);
    expect(resultDateLabels.length).toBeGreaterThan(0);
    expect(resultDateLabels.every((label) => label.textContent?.startsWith('Tue,'))).toBe(true);
  });

  it('shows current and future appointments for a selected patient, including today no-shows', () => {
    const todayNoShowAppointment = {
      id: 'appt-today-no-show',
      tenantId: 'tenant-demo',
      patientId: 'patient-mason',
      providerId: 'provider-skin',
      locationId: 'loc-main',
      appointmentTypeId: 'type-consult',
      scheduledStart: appointmentDateTime(0, 8, 0),
      scheduledEnd: appointmentDateTime(0, 8, 30),
      status: 'no_show',
      createdAt: '2026-01-01',
    };
    const futureAppointment = {
      id: 'appt-future',
      tenantId: 'tenant-demo',
      patientId: 'patient-mason',
      providerId: 'provider-skin',
      locationId: 'loc-main',
      appointmentTypeId: 'type-consult',
      scheduledStart: appointmentDateTime(2, 10, 0),
      scheduledEnd: appointmentDateTime(2, 10, 30),
      status: 'scheduled',
      createdAt: '2026-01-01',
    };
    const pastAppointment = {
      id: 'appt-past',
      tenantId: 'tenant-demo',
      patientId: 'patient-mason',
      providerId: 'provider-skin',
      locationId: 'loc-main',
      appointmentTypeId: 'type-consult',
      scheduledStart: appointmentDateTime(-1, 10, 0),
      scheduledEnd: appointmentDateTime(-1, 10, 30),
      status: 'scheduled',
      createdAt: '2026-01-01',
    };
    const cancelledTodayAppointment = {
      id: 'appt-cancelled',
      tenantId: 'tenant-demo',
      patientId: 'patient-mason',
      providerId: 'provider-skin',
      locationId: 'loc-main',
      appointmentTypeId: 'type-consult',
      scheduledStart: appointmentDateTime(0, 11, 0),
      scheduledEnd: appointmentDateTime(0, 11, 30),
      status: 'cancelled',
      createdAt: '2026-01-01',
    };
    const onUseSlot = vi.fn();
    const onOpenExistingAppointment = vi.fn();

    render(
      <AppointmentFinderWorkspace
        patients={[patient] as any}
        providers={[provider] as any}
        locations={[location] as any}
        appointmentTypes={appointmentTypes as any}
        appointments={[
          todayNoShowAppointment,
          futureAppointment,
          pastAppointment,
          cancelledTodayAppointment,
        ] as any}
        timeBlocks={[]}
        availability={[]}
        onUseSlot={onUseSlot}
        onOpenExistingAppointment={onOpenExistingAppointment}
      />
    );

    fireEvent.change(screen.getByLabelText(/Search patient by name or date of birth/i), {
      target: { value: 'Mason' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Anderson, Mason/i }));

    expect(screen.getByText('Current appointments')).toBeInTheDocument();
    expect(screen.getByText('2 found')).toBeInTheDocument();
    expect(screen.getByText('No Show')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Open appointment/i })[0]);
    expect(onOpenExistingAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: 'appt-today-no-show' }));
  });

  it('quick-adds a patient with first and last name and selects them for scheduling', async () => {
    const onCreatePatient = vi.fn().mockResolvedValue({
      id: 'patient-jamie',
      tenantId: 'tenant-demo',
      firstName: 'Jamie',
      lastName: 'Patient',
      createdAt: '2026-01-01',
    });
    const onShowSuccess = vi.fn();

    render(
      <AppointmentFinderWorkspace
        patients={[] as any}
        providers={[provider] as any}
        locations={[location] as any}
        appointmentTypes={appointmentTypes as any}
        appointments={[]}
        timeBlocks={[]}
        availability={[]}
        onUseSlot={vi.fn()}
        onCreatePatient={onCreatePatient}
        onShowSuccess={onShowSuccess}
      />
    );

    expect(screen.queryByText(/Search Anything/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ New Patient/i }));
    fireEvent.change(screen.getByLabelText(/Quick add patient first name/i), {
      target: { value: 'Jamie' },
    });
    fireEvent.change(screen.getByLabelText(/Quick add patient last name/i), {
      target: { value: 'Patient' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add and Schedule/i }));

    await waitFor(() =>
      expect(onCreatePatient).toHaveBeenCalledWith({
        firstName: 'Jamie',
        lastName: 'Patient',
      })
    );

    expect(await screen.findByText('Scheduling for Jamie Patient')).toBeInTheDocument();
    expect(onShowSuccess).toHaveBeenCalledWith('Added Jamie Patient. Continue scheduling.');
  });
});
