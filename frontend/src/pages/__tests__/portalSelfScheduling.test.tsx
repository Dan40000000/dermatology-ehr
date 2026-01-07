import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SelfSchedulingPage from '../Portal/SelfSchedulingPage';

describe('SelfSchedulingPage', () => {
  afterEach(() => {
    vi.useRealTimers();
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
