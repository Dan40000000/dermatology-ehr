export function PortalRegisterPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '28rem', width: '100%', background: 'white', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: '0.5rem' }}>Create Account</h1>
        <p style={{ color: '#4b5563', textAlign: 'center', marginBottom: '2rem' }}>Register for patient portal access</p>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <p>Registration form will be displayed here.</p>
        </div>
      </div>
    </div>
  );
}
