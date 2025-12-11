import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

// Eager load critical pages (login, home, app layout)
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';

// Lazy load all other pages for better performance
const SchedulePage = lazy(() => import('../pages/SchedulePage').then(m => ({ default: m.SchedulePage })));
const PatientsPage = lazy(() => import('../pages/PatientsPage').then(m => ({ default: m.PatientsPage })));
const PatientDetailPage = lazy(() => import('../pages/PatientDetailPage').then(m => ({ default: m.PatientDetailPage })));
const NewPatientPage = lazy(() => import('../pages/NewPatientPage').then(m => ({ default: m.NewPatientPage })));
const EncounterPage = lazy(() => import('../pages/EncounterPage').then(m => ({ default: m.EncounterPage })));
const OrdersPage = lazy(() => import('../pages/OrdersPage').then(m => ({ default: m.OrdersPage })));
const DocumentsPage = lazy(() => import('../pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
const PhotosPage = lazy(() => import('../pages/PhotosPage').then(m => ({ default: m.PhotosPage })));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const PrescriptionsPage = lazy(() => import('../pages/PrescriptionsPage').then(m => ({ default: m.PrescriptionsPage })));
const LabsPage = lazy(() => import('../pages/LabsPage').then(m => ({ default: m.LabsPage })));
const RadiologyPage = lazy(() => import('../pages/RadiologyPage').then(m => ({ default: m.RadiologyPage })));
const MailPage = lazy(() => import('../pages/MailPage').then(m => ({ default: m.MailPage })));
const TasksPage = lazy(() => import('../pages/TasksPage').then(m => ({ default: m.TasksPage })));
const RemindersPage = lazy(() => import('../pages/RemindersPage').then(m => ({ default: m.RemindersPage })));
const TextMessagesPage = lazy(() => import('../pages/TextMessagesPage'));
const TelehealthPage = lazy(() => import('../pages/TelehealthPage').then(m => ({ default: m.TelehealthPage })));
const InventoryPage = lazy(() => import('../pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const FinancialsPage = lazy(() => import('../pages/FinancialsPage').then(m => ({ default: m.FinancialsPage })));
const QuotesPage = lazy(() => import('../pages/QuotesPage').then(m => ({ default: m.QuotesPage })));
const OfficeFlowPage = lazy(() => import('../pages/OfficeFlowPage').then(m => ({ default: m.OfficeFlowPage })));
const AppointmentFlowPage = lazy(() => import('../pages/AppointmentFlowPage').then(m => ({ default: m.AppointmentFlowPage })));
const FeeSchedulePage = lazy(() => import('../pages/FeeSchedulePage').then(m => ({ default: m.FeeSchedulePage })));
const ClaimsPage = lazy(() => import('../pages/ClaimsPage').then(m => ({ default: m.ClaimsPage })));
const NoteTemplatesPage = lazy(() => import('../pages/NoteTemplatesPage').then(m => ({ default: m.NoteTemplatesPage })));
const AuditLogPage = lazy(() => import('../pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const BodyDiagramPage = lazy(() => import('../pages/BodyDiagramPage').then(m => ({ default: m.BodyDiagramPage })));
const FaceSheetPage = lazy(() => import('../pages/FaceSheetPage').then(m => ({ default: m.FaceSheetPage })));
const PriorAuthPage = lazy(() => import('../pages/PriorAuthPage').then(m => ({ default: m.PriorAuthPage })));
const WaitlistPage = lazy(() => import('../pages/WaitlistPage').then(m => ({ default: m.WaitlistPage })));
const HandoutsPage = lazy(() => import('../pages/HandoutsPage').then(m => ({ default: m.HandoutsPage })));

// Loading fallback component
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
      <LoadingSpinner size="lg" message="Loading page..." />
    </div>
  );
}

// Wrapper to add Suspense to lazy-loaded components
function lazyWithSuspense(Component: React.LazyExoticComponent<any>) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <HomePage /> },

      // Scheduling
      { path: 'schedule', element: lazyWithSuspense(SchedulePage) },
      { path: 'office-flow', element: lazyWithSuspense(OfficeFlowPage) },
      { path: 'appt-flow', element: lazyWithSuspense(AppointmentFlowPage) },
      { path: 'waitlist', element: lazyWithSuspense(WaitlistPage) },

      // Patients
      { path: 'patients', element: lazyWithSuspense(PatientsPage) },
      { path: 'patients/new', element: lazyWithSuspense(NewPatientPage) },
      { path: 'patients/:patientId', element: lazyWithSuspense(PatientDetailPage) },
      { path: 'patients/:patientId/face-sheet', element: lazyWithSuspense(FaceSheetPage) },
      { path: 'patients/:patientId/encounter/new', element: lazyWithSuspense(EncounterPage) },
      { path: 'patients/:patientId/encounter/:encounterId', element: lazyWithSuspense(EncounterPage) },

      // Clinical
      { path: 'orders', element: lazyWithSuspense(OrdersPage) },
      { path: 'rx', element: lazyWithSuspense(PrescriptionsPage) },
      { path: 'prior-auth', element: lazyWithSuspense(PriorAuthPage) },
      { path: 'labs', element: lazyWithSuspense(LabsPage) },
      { path: 'radiology', element: lazyWithSuspense(RadiologyPage) },

      // Communication
      { path: 'text-messages', element: lazyWithSuspense(TextMessagesPage) },
      { path: 'mail', element: lazyWithSuspense(MailPage) },
      { path: 'tasks', element: lazyWithSuspense(TasksPage) },
      { path: 'reminders', element: lazyWithSuspense(RemindersPage) },

      // Documents
      { path: 'documents', element: lazyWithSuspense(DocumentsPage) },
      { path: 'photos', element: lazyWithSuspense(PhotosPage) },
      { path: 'body-diagram', element: lazyWithSuspense(BodyDiagramPage) },
      { path: 'handouts', element: lazyWithSuspense(HandoutsPage) },

      // Operations
      { path: 'telehealth', element: lazyWithSuspense(TelehealthPage) },
      { path: 'inventory', element: lazyWithSuspense(InventoryPage) },
      { path: 'financials', element: lazyWithSuspense(FinancialsPage) },
      { path: 'claims', element: lazyWithSuspense(ClaimsPage) },
      { path: 'quotes', element: lazyWithSuspense(QuotesPage) },
      { path: 'analytics', element: lazyWithSuspense(AnalyticsPage) },
      { path: 'reports', element: lazyWithSuspense(ReportsPage) },

      // Admin
      { path: 'admin/fee-schedules', element: lazyWithSuspense(FeeSchedulePage) },
      { path: 'admin/note-templates', element: lazyWithSuspense(NoteTemplatesPage) },
      { path: 'admin/audit-log', element: lazyWithSuspense(AuditLogPage) },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/home" replace />,
  },
]);
