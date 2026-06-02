import { render } from '@testing-library/react';
import { PatientBanner } from '../PatientBanner';
import type { Patient } from '../../../types';

describe('PatientBanner', () => {
  it('renders DOB calendar dates without timezone drift', () => {
    const patient: Patient = {
      id: 'patient-1',
      tenantId: 'tenant-demo',
      firstName: 'Daniel',
      lastName: 'Perry',
      dateOfBirth: '1988-06-17T00:00:00.000Z',
      sex: 'M',
    };

    const { container } = render(<PatientBanner patient={patient} />);

    expect(container).toHaveTextContent(/DOB:\s*6\/17\/1988/);
    expect(container).not.toHaveTextContent('6/16/1988');
  });
});
