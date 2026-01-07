import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import '../../styles/kiosk.css';

export function KioskCompletionPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      sessionStorage.clear();
      navigate('/kiosk');
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [navigate]);

  const handleDone = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: '1rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    padding: '3rem',
    textAlign: 'center',
  };

  const stepStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  };

  const stepNumberStyle: React.CSSProperties = {
    width: '2rem',
    height: '2rem',
    background: '#7c3aed',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '0.25rem',
    fontWeight: 700,
  };

  return (
    <KioskLayout showProgress={false}>
      <div style={cardStyle}>
        {/* Success icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '8rem',
            height: '8rem',
            background: '#dcfce7',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 2s infinite',
          }}>
            <svg style={{ width: '5rem', height: '5rem', color: '#16a34a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Success message */}
        <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>
          You're All Checked In!
        </h1>

        <div style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '1.5rem', color: '#374151', marginBottom: '1rem' }}>
            Thank you for completing the check-in process.
          </p>
          <p style={{ fontSize: '1.25rem', color: '#4b5563' }}>
            Please have a seat in the waiting room. A staff member will call you shortly.
          </p>
        </div>

        {/* Instructions */}
        <div style={{
          background: '#f3e8ff',
          border: '2px solid #c4b5fd',
          borderRadius: '0.75rem',
          padding: '2rem',
          marginBottom: '2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#6b21a8', marginBottom: '1rem' }}>
            What happens next?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
            <div style={stepStyle}>
              <div style={stepNumberStyle}>1</div>
              <p style={{ fontSize: '1.125rem', color: '#6b21a8' }}>
                Our staff has been notified of your arrival
              </p>
            </div>
            <div style={stepStyle}>
              <div style={stepNumberStyle}>2</div>
              <p style={{ fontSize: '1.125rem', color: '#6b21a8' }}>
                Please wait in the designated waiting area
              </p>
            </div>
            <div style={stepStyle}>
              <div style={stepNumberStyle}>3</div>
              <p style={{ fontSize: '1.125rem', color: '#6b21a8' }}>
                You will be called when we are ready for you
              </p>
            </div>
          </div>
        </div>

        {/* Auto-return message */}
        <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '2rem' }}>
          This screen will automatically return to the welcome page in a few seconds...
        </p>

        {/* Done button */}
        <button
          onClick={handleDone}
          style={{
            padding: '1.25rem 4rem',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'white',
            background: 'linear-gradient(to right, #7c3aed, #6d28d9)',
            border: 'none',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 25px rgba(124, 58, 237, 0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Done
        </button>

        {/* Thank you message */}
        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '1.25rem', color: '#4b5563' }}>
            Thank you for choosing our practice!
          </p>
          <p style={{ fontSize: '1.125rem', color: '#6b7280', marginTop: '0.5rem' }}>
            We appreciate your time and look forward to serving you.
          </p>
        </div>
      </div>
    </KioskLayout>
  );
}
