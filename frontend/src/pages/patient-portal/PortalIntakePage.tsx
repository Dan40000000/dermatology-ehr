import { Navigate } from 'react-router-dom';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import IntakePage from '../Portal/IntakePage';

export function PortalIntakePage() {
  const { isAuthenticated, isLoading, sessionToken, tenantId } = usePatientPortalAuth();

  if (isLoading) {
    return (
      <PatientPortalLayout>
        <div style={{ padding: '2rem' }}>Loading intake forms...</div>
      </PatientPortalLayout>
    );
  }

  if (!isAuthenticated || !sessionToken || !tenantId) {
    return <Navigate to="/portal/login" replace />;
  }

  return (
    <PatientPortalLayout>
      <IntakePage tenantId={tenantId} portalToken={sessionToken} />
    </PatientPortalLayout>
  );
}
