import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import { KioskWelcomePage } from '../kiosk/WelcomePage';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

beforeEach(() => {
  navigateMock.mockReset();
});

describe('Kiosk flow', () => {
  it('renders kiosk layout with progress and timeout handling', () => {
    vi.useFakeTimers();
    const timeoutMock = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <KioskLayout currentStep={1} totalSteps={3} stepName="Verify" onTimeout={timeoutMock} timeoutSeconds={1}>
        <div>Child Content</div>
      </KioskLayout>
    );

    expect(screen.getByText('Patient Check-In')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Need Help\? See Staff/i }));
    expect(alertSpy).toHaveBeenCalledWith('Please see the front desk staff for assistance.');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(timeoutMock).toHaveBeenCalled();

    alertSpy.mockRestore();
    vi.useRealTimers();
  });

  it('toggles language and starts check-in from welcome page', () => {
    vi.useFakeTimers();

    render(<KioskWelcomePage />);

    expect(screen.getByText('Welcome')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Espanol/i }));
    expect(screen.getByText('Bienvenido')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Welcome')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Check In/i }));
    expect(navigateMock).toHaveBeenCalledWith('/kiosk/verify');

    vi.useRealTimers();
  });
});
