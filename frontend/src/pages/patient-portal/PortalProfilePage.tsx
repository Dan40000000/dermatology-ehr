export function PortalProfilePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827' }}>My Profile</h1>
        <p style={{ marginTop: '0.5rem', color: '#4b5563' }}>Manage your profile and contact information</p>
        <div style={{ marginTop: '2rem', background: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>Profile settings will be displayed here.</p>
        </div>
      </div>
    </div>
  );
}
