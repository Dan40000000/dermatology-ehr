import { lazy, Suspense } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { AppLayout } from '../components/layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

// Eager load critical pages (login, home, app layout)
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';

// Patient Portal pages
import { PatientPortalAuthProvider } from '../contexts/PatientPortalAuthContext';
import {
  PortalLoginPage,
  PortalRegisterPage,
  PortalDashboardPage,
  PortalAppointmentsPage,
  PortalVisitSummariesPage,
  PortalDocumentsPage,
  PortalHealthRecordPage,
  PortalProfilePage,
  PortalBillingPage,
  PortalBookAppointmentPage,
  PortalIntakePage,
  PortalCheckInPage,
} from '../pages/patient-portal';
import {
  KioskWelcomePage,
  KioskPatientVerificationPage,
  KioskAppointmentSelectionPage,
  KioskDemographicsReviewPage,
  KioskInsuranceReviewPage,
  KioskConsentFormsPage,
  KioskCompletionPage,
} from '../pages/kiosk';

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
const AnalyticsDashboard = lazy(() => import('../pages/admin/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const PrescriptionsPage = lazy(() => import('../pages/PrescriptionsPage').then(m => ({ default: m.PrescriptionsPage })));
const LabsPage = lazy(() => import('../pages/LabsPage').then(m => ({ default: m.LabsPage })));
const RadiologyPage = lazy(() => import('../pages/RadiologyPage').then(m => ({ default: m.RadiologyPage })));
const MessagingPage = lazy(() => import('../pages/MessagingPage').then(m => ({ default: m.MessagingPage })));
const TasksPage = lazy(() => import('../pages/TasksPage').then(m => ({ default: m.TasksPage })));
const RemindersPage = lazy(() => import('../pages/RemindersPage').then(m => ({ default: m.RemindersPage })));
const TextMessagesPage = lazy(() =>
  import('../pages/TextMessagesPage').then((module) => ({
    default: module.default || (module as any).TextMessagesPage,
  }))
);
const TelehealthPage = lazy(() =>
  import('../pages/TelehealthPage').then((module) => ({
    default: module.default || (module as any).TelehealthPage,
  }))
);
const InventoryPage = lazy(() => import('../pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const FinancialsHub = lazy(() => import('../pages/FinancialsHub').then(m => ({ default: m.FinancialsHub })));
const QuotesPage = lazy(() => import('../pages/QuotesPage').then(m => ({ default: m.QuotesPage })));
const OfficeFlowPage = lazy(() => import('../pages/OfficeFlowPage').then(m => ({ default: m.OfficeFlowPage })));
const AppointmentFlowPage = lazy(() => import('../pages/AppointmentFlowPage').then(m => ({ default: m.AppointmentFlowPage })));
const RoomBoardPage = lazy(() => import('../pages/RoomBoardPage').then(m => ({ default: m.RoomBoardPage })));
const FeeSchedulePage = lazy(() => import('../pages/FeeSchedulePage').then(m => ({ default: m.FeeSchedulePage })));
const ClaimsPage = lazy(() => import('../pages/ClaimsPage').then(m => ({ default: m.ClaimsPage })));
const NoteTemplatesPage = lazy(() => import('../pages/NoteTemplatesPage').then(m => ({ default: m.NoteTemplatesPage })));
const AuditLogPage = lazy(() => import('../pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const BodyDiagramPage = lazy(() => import('../pages/BodyDiagramPage').then(m => ({ default: m.BodyDiagramPage })));
const AmbientScribePage = lazy(() => import('../pages/AmbientScribePage'));
const FaceSheetPage = lazy(() => import('../pages/FaceSheetPage').then(m => ({ default: m.FaceSheetPage })));
const PriorAuthPage = lazy(() => import('../pages/PriorAuthPage').then(m => ({ default: m.PriorAuthPage })));
const WaitlistPage = lazy(() => import('../pages/WaitlistPage').then(m => ({ default: m.WaitlistPage })));
const HandoutsPage = lazy(() => import('../pages/HandoutsPage').then(m => ({ default: m.HandoutsPage })));
const FaxPage = lazy(() => import('../pages/FaxPage').then(m => ({ default: m.FaxPage })));
const NotesPage = lazy(() => import('../pages/NotesPage').then(m => ({ default: m.NotesPage })));
const ClearinghousePage = lazy(() => import('../pages/ClearinghousePage').then(m => ({ default: m.ClearinghousePage })));
const AdminPage = lazy(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AIAgentConfigsPage = lazy(() => import('../pages/AIAgentConfigsPage').then(m => ({ default: m.AIAgentConfigsPage })));
const RegistryPage = lazy(() => import('../pages/RegistryPage').then(m => ({ default: m.RegistryPage })));
const ReferralsPage = lazy(() => import('../pages/ReferralsPage').then(m => ({ default: m.ReferralsPage })));
const ProtocolsPage = lazy(() => import('../pages/ProtocolsPage').then(m => ({ default: m.ProtocolsPage })));
const PreferencesPage = lazy(() => import('../pages/PreferencesPage').then(m => ({ default: m.PreferencesPage })));
const FrontDeskDashboard = lazy(() => import('../pages/FrontDeskDashboard').then(m => ({ default: m.default })));

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

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  // Patient Portal Routes
  {
    path: '/portal',
    element: (
      <PatientPortalAuthProvider>
        <Outlet />
      </PatientPortalAuthProvider>
    ),
    children: [
      { path: 'login', element: <PortalLoginPage /> },
      { path: 'register', element: <PortalRegisterPage /> },
      { path: 'dashboard', element: <PortalDashboardPage /> },
      { path: 'appointments', element: <PortalAppointmentsPage /> },
      { path: 'check-in', element: <PortalCheckInPage /> },
      { path: 'intake', element: <PortalIntakePage /> },
      { path: 'book-appointment', element: <PortalBookAppointmentPage /> },
      { path: 'visits', element: <PortalVisitSummariesPage /> },
      { path: 'documents', element: <PortalDocumentsPage /> },
      { path: 'health-record', element: <PortalHealthRecordPage /> },
      { path: 'billing', element: <PortalBillingPage /> },
      { path: 'profile', element: <PortalProfilePage /> },
      { index: true, element: <Navigate to="/portal/login" replace /> },
    ],
  },
  // In-office iPad kiosk routes
  { path: '/kiosk', element: <KioskWelcomePage /> },
  { path: '/kiosk/verify', element: <KioskPatientVerificationPage /> },
  { path: '/kiosk/appointment', element: <KioskAppointmentSelectionPage /> },
  { path: '/kiosk/demographics', element: <KioskDemographicsReviewPage /> },
  { path: '/kiosk/insurance', element: <KioskInsuranceReviewPage /> },
  { path: '/kiosk/consent', element: <KioskConsentFormsPage /> },
  { path: '/kiosk/complete', element: <KioskCompletionPage /> },
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
      { path: 'front-desk', element: lazyWithSuspense(FrontDeskDashboard) },
      { path: 'waitlist', element: lazyWithSuspense(WaitlistPage) },
      { path: 'room-board', element: lazyWithSuspense(RoomBoardPage) },

      // Patients
      { path: 'patients', element: lazyWithSuspense(PatientsPage) },
      { path: 'patients/new', element: lazyWithSuspense(NewPatientPage) },
      { path: 'patients/register', element: lazyWithSuspense(NewPatientPage) },
      { path: 'patients/reports', element: lazyWithSuspense(ReportsPage) },
      { path: 'patients/:patientId', element: lazyWithSuspense(PatientDetailPage) },
      { path: 'patients/:patientId/face-sheet', element: lazyWithSuspense(FaceSheetPage) },
      { path: 'patients/:patientId/encounter/new', element: lazyWithSuspense(EncounterPage) },
      { path: 'patients/:patientId/encounter/:encounterId', element: lazyWithSuspense(EncounterPage) },

      // Clinical
      { path: 'notes', element: lazyWithSuspense(NotesPage) },
      { path: 'ambient-scribe', element: lazyWithSuspense(AmbientScribePage) },
      { path: 'orders', element: lazyWithSuspense(OrdersPage) },
      { path: 'rx', element: lazyWithSuspense(PrescriptionsPage) },
      { path: 'prior-auth', element: lazyWithSuspense(PriorAuthPage) },
      { path: 'labs', element: lazyWithSuspense(LabsPage) },
      { path: 'radiology', element: lazyWithSuspense(RadiologyPage) },

      // Communication
      { path: 'text-messages', element: lazyWithSuspense(TextMessagesPage) },
      { path: 'mail', element: lazyWithSuspense(MessagingPage) },
      { path: 'direct', element: lazyWithSuspense(MessagingPage) },
      { path: 'fax', element: lazyWithSuspense(FaxPage) },
      { path: 'tasks', element: lazyWithSuspense(TasksPage) },
      { path: 'reminders', element: lazyWithSuspense(RemindersPage) },
      { path: 'recalls', element: <Navigate to="/reminders?tab=due" replace /> },

      // Documents
      { path: 'documents', element: lazyWithSuspense(DocumentsPage) },
      { path: 'photos', element: lazyWithSuspense(PhotosPage) },
      { path: 'body-diagram', element: lazyWithSuspense(BodyDiagramPage) },
      { path: 'handouts', element: lazyWithSuspense(HandoutsPage) },

      // Operations
      { path: 'telehealth', element: lazyWithSuspense(TelehealthPage) },
      { path: 'inventory', element: lazyWithSuspense(InventoryPage) },
      { path: 'financials', element: lazyWithSuspense(FinancialsHub) },
      { path: 'claims', element: lazyWithSuspense(ClaimsPage) },
      { path: 'clearinghouse', element: lazyWithSuspense(ClearinghousePage) },
      { path: 'quotes', element: lazyWithSuspense(QuotesPage) },
      { path: 'analytics', element: lazyWithSuspense(AnalyticsPage) },
      { path: 'reports', element: lazyWithSuspense(ReportsPage) },
      { path: 'quality/*', element: <Navigate to="/analytics?tab=operational" replace /> },
      { path: 'registry', element: lazyWithSuspense(RegistryPage) },
      { path: 'referrals', element: lazyWithSuspense(ReferralsPage) },
      { path: 'forms', element: <Navigate to="/documents?section=forms" replace /> },
      { path: 'protocols', element: lazyWithSuspense(ProtocolsPage) },
      { path: 'templates', element: lazyWithSuspense(NoteTemplatesPage) },
      { path: 'preferences', element: lazyWithSuspense(PreferencesPage) },
      { path: 'help', element: <Navigate to="/home" replace /> },

      // Admin
      { path: 'admin', element: lazyWithSuspense(AdminPage) },
      { path: 'admin/analytics', element: lazyWithSuspense(AnalyticsDashboard) },
      { path: 'admin/fee-schedules', element: lazyWithSuspense(FeeSchedulePage) },
      { path: 'admin/note-templates', element: lazyWithSuspense(NoteTemplatesPage) },
      { path: 'admin/audit-log', element: lazyWithSuspense(AuditLogPage) },
      { path: 'admin/ai-agents', element: lazyWithSuspense(AIAgentConfigsPage) },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/home" replace />,
  },
];
