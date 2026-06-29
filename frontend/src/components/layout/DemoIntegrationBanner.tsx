const DEMO_INTEGRATION_ITEMS = [
  { label: 'Insurance', detail: 'demo unless connected' },
  { label: 'Rx / eRx', detail: 'vendor approval required' },
  { label: 'Text/SMS', detail: 'live when enabled' },
  { label: 'Payments', detail: 'mock/test/live by keys' },
];

export function DemoIntegrationBanner() {
  return (
    <section
      aria-label="Demo integration status"
      style={{
        margin: '0.75rem 1rem 0',
        border: '1px solid #fbbf24',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)',
        boxShadow: '0 8px 24px rgba(146, 64, 14, 0.08)',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.875rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 240 }}>
        <div style={{ fontWeight: 800, color: '#92400e', letterSpacing: '0.01em' }}>
          Professional Review Demo
        </div>
        <div style={{ fontSize: '0.78rem', color: '#78350f', marginTop: '0.15rem' }}>
          Use synthetic patients in demo tenants. Check each environment before using live vendor networks.
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        {DEMO_INTEGRATION_ITEMS.map((item) => (
          <span
            key={item.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: '1px solid #fed7aa',
              borderRadius: '999px',
              background: '#ffffff',
              color: '#7c2d12',
              padding: '0.35rem 0.65rem',
              fontSize: '0.76rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{item.label}:</span>
            <span style={{ color: '#9a3412', fontWeight: 600 }}>{item.detail}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
