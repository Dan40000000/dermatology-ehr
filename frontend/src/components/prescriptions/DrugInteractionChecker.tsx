/**
 * Drug Interaction Checker (STUB)
 *
 * This is a placeholder component that will be replaced with actual
 * drug interaction checking once integrated with First Databank or similar service.
 */

interface DrugInteractionCheckerProps {
  medicationId?: string;
  patientId?: string;
}

export function DrugInteractionChecker({ medicationId, patientId }: DrugInteractionCheckerProps) {
  // STUB: In production, this would call an API to check interactions
  // For now, just show a placeholder message

  if (!medicationId || !patientId) {
    return null;
  }

  return (
    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '1rem',
        marginTop: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.875rem' }}>
            Drug Interaction Check
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.25rem' }}>
            Checking for drug interactions...
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid #bfdbfe',
          borderRadius: '4px',
          padding: '0.75rem',
          fontSize: '0.75rem',
          color: '#1e40af',
        }}
      >
        <div style={{ marginBottom: '0.5rem', fontWeight: 500 }}>✓ No interactions found</div>
        <div style={{ color: '#3b82f6' }}>
          Note: Full interaction checking with First Databank will be available with Surescripts
          integration.
        </div>
      </div>
    </div>
  );
}
