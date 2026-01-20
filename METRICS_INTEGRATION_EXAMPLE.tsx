/**
 * METRICS INTEGRATION EXAMPLE
 *
 * This file shows how to integrate the metrics system into your existing app.
 * Copy the relevant sections to your actual files.
 */

// ================================================================
// EXAMPLE 1: App.tsx or main.tsx Integration
// ================================================================

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { MetricsProvider } from './components/Metrics/MetricsProvider';
import { ToastContext } from './contexts/ToastContext';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Add MetricsProvider here, after AuthProvider */}
        <MetricsProvider>
          <ToastContext>
            {/* Your existing app content */}
            <YourAppContent />
          </ToastContext>
        </MetricsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

// ================================================================
// EXAMPLE 2: Backend index.ts Integration
// ================================================================

/*
// In /backend/src/index.ts

import express from 'express';
import cors from 'cors';
import { authenticateToken } from './middleware/auth.js';

// Import metrics routes
import metricsRouter from './routes/metrics.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Existing routes
app.use('/api/auth', authRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/encounters', encountersRouter);
// ... other routes

// Add metrics routes
app.use('/api/metrics', metricsRouter);

// Start server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
*/

// ================================================================
// EXAMPLE 3: Router Configuration (React Router)
// ================================================================

/*
import { Routes, Route } from 'react-router-dom';
import MetricsDashboard from './pages/admin/MetricsDashboard';

function AppRoutes() {
  return (
    <Routes>
      {/* Existing routes */}
      <Route path="/" element={<Dashboard />} />
      <Route path="/patients" element={<PatientList />} />
      <Route path="/encounters/:id" element={<EncounterDetail />} />

      {/* Admin routes */}
      <Route path="/admin/analytics" element={<AnalyticsDashboard />} />

      {/* Add metrics dashboard */}
      <Route path="/admin/metrics" element={<MetricsDashboard />} />

      {/* ... other routes */}
    </Routes>
  );
}
*/

// ================================================================
// EXAMPLE 4: Navigation Menu Integration
// ================================================================

/*
// In your navigation/sidebar component

const adminMenuItems = [
  {
    label: 'Dashboard',
    path: '/admin',
    icon: '📊',
  },
  {
    label: 'Analytics',
    path: '/admin/analytics',
    icon: '📈',
  },
  // Add metrics menu item
  {
    label: 'Efficiency Metrics',
    path: '/admin/metrics',
    icon: '⚡',
    badge: 'NEW',
  },
  {
    label: 'Settings',
    path: '/admin/settings',
    icon: '⚙️',
  },
];
*/

// ================================================================
// EXAMPLE 5: Encounter Page Integration
// ================================================================

import { useState } from 'react';
import { EfficiencyBadge, EncounterSummary, useEncounterMetrics } from './components/Metrics';

function EncounterDetailPage({ encounterId, patientId, patientName }: {
  encounterId: string;
  patientId: string;
  patientName: string;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const [currentTab, setCurrentTab] = useState('notes');

  // Start tracking this encounter
  const metrics = useEncounterMetrics(encounterId, patientId);

  // Track section changes
  const handleTabChange = (newTab: string) => {
    metrics.trackSection(newTab);
    setCurrentTab(newTab);
  };

  const handleComplete = async () => {
    // Your existing save logic
    await saveEncounter(encounterId);

    // Show summary
    setShowSummary(true);
  };

  return (
    <div className="encounter-page">
      {/* Add the efficiency badge */}
      <EfficiencyBadge position="top-right" compact={false} showDetails={true} />

      {/* Your existing header */}
      <div className="encounter-header">
        <h1>Encounter: {patientName}</h1>
      </div>

      {/* Your existing tabs */}
      <div className="tabs">
        <button onClick={() => handleTabChange('notes')}>Notes</button>
        <button onClick={() => handleTabChange('orders')}>Orders</button>
        <button onClick={() => handleTabChange('photos')}>Photos</button>
        <button onClick={() => handleTabChange('prescriptions')}>Prescriptions</button>
        <button onClick={() => handleTabChange('billing')}>Billing</button>
      </div>

      {/* Your existing content */}
      <div className="tab-content">
        {currentTab === 'notes' && <NotesTab />}
        {currentTab === 'orders' && <OrdersTab />}
        {/* ... other tabs */}
      </div>

      {/* Your existing actions */}
      <div className="actions">
        <button onClick={handleComplete}>Complete Encounter</button>
      </div>

      {/* Add the summary modal */}
      {showSummary && (
        <EncounterSummary
          encounterId={encounterId}
          patientName={patientName}
          onClose={() => setShowSummary(false)}
          autoClose={true}
          autoCloseDelay={8000}
        />
      )}
    </div>
  );
}

// ================================================================
// EXAMPLE 6: Adding Tracking to Existing Components
// ================================================================

import { useMetrics } from './hooks/useMetrics';

function ExistingPatientForm() {
  const { trackButtonClick, trackFormSubmit } = useMetrics();

  const handleSave = async (formData: unknown) => {
    // Add tracking before your existing logic
    trackFormSubmit('patient-form', formData);

    // Your existing save logic
    await savePatient(formData);
  };

  const handleExport = () => {
    // Add tracking
    trackButtonClick('export-patient', 'Export Patient Data', {
      format: 'pdf',
    });

    // Your existing export logic
    exportPatientData();
  };

  return (
    <form onSubmit={handleSave}>
      {/* Your existing form fields */}

      <button type="submit">Save</button>
      <button type="button" onClick={handleExport}>
        Export
      </button>
    </form>
  );
}

// ================================================================
// EXAMPLE 7: AI Feature Tracking
// ================================================================

function NotesEditor() {
  const { trackAIFeature, measureAsync } = useMetrics();

  const handleAIGenerate = async () => {
    try {
      // Measure how long it takes
      const note = await measureAsync('ai-note-generation', async () => {
        return await generateNoteWithAI();
      });

      // Track success with time saved estimate
      trackAIFeature('note-generation', true, 45, {
        noteLength: note.length,
      });

      setNoteContent(note);
    } catch (error) {
      // Track failure
      trackAIFeature('note-generation', false, 0, {
        error: error.message,
      });
    }
  };

  return (
    <div>
      <textarea />
      <button onClick={handleAIGenerate}>Generate with AI</button>
    </div>
  );
}

// ================================================================
// EXAMPLE 8: Photo Capture Tracking
// ================================================================

function PhotoCapture() {
  const { trackPhotoCapture } = useMetrics();

  const handleCapture = async (bodyLocation: string) => {
    const photo = await capturePhoto();

    // Track the capture
    trackPhotoCapture('clinical', bodyLocation, {
      resolution: '1920x1080',
      timestamp: new Date().toISOString(),
    });

    savePhoto(photo);
  };

  return (
    <div>
      <button onClick={() => handleCapture('left-arm')}>
        Capture Photo
      </button>
    </div>
  );
}

// ================================================================
// EXAMPLE 9: Prescription Tracking
// ================================================================

function PrescriptionForm() {
  const { trackPrescription } = useMetrics();

  const handleSendERx = async (medication: string) => {
    // Track the prescription
    trackPrescription(medication, true, {
      dosage: '10mg',
      frequency: 'daily',
    });

    // Send e-prescription
    await sendERxPrescription(medication);
  };

  const handlePrintRx = (medication: string) => {
    // Track print prescription
    trackPrescription(medication, false, {
      dosage: '10mg',
      frequency: 'daily',
    });

    printPrescription(medication);
  };

  return (
    <div>
      <button onClick={() => handleSendERx('Tretinoin')}>
        Send E-Rx
      </button>
      <button onClick={() => handlePrintRx('Tretinoin')}>
        Print Rx
      </button>
    </div>
  );
}

// ================================================================
// EXAMPLE 10: Search Tracking
// ================================================================

function PatientSearch() {
  const { trackSearch } = useMetrics();
  const [results, setResults] = useState([]);

  const handleSearch = async (query: string) => {
    const searchResults = await searchPatients(query);
    setResults(searchResults);

    // Track the search
    trackSearch(query, searchResults.length, {
      filters: { status: 'active' },
      searchType: 'name',
    });
  };

  return (
    <div>
      <input
        type="search"
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search patients..."
      />
      <div>
        {results.map((result) => (
          <div key={result.id}>{result.name}</div>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// EXAMPLE 11: Page View Tracking
// ================================================================

import { usePageMetrics } from './hooks/useMetrics';

function PatientListPage() {
  // Automatically tracks page view and load time
  usePageMetrics('/patients/list');

  return (
    <div>
      <h1>Patient List</h1>
      {/* Your existing content */}
    </div>
  );
}

// ================================================================
// EXAMPLE 12: Modal Tracking
// ================================================================

function PatientSearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { trackModalOpen, trackModalClose } = useMetrics();

  useEffect(() => {
    if (isOpen) {
      trackModalOpen('patient-search-modal', {
        source: 'header-search',
      });
    } else {
      trackModalClose('patient-search-modal', {
        actionTaken: 'selected-patient', // or 'cancelled'
      });
    }
  }, [isOpen, trackModalOpen, trackModalClose]);

  return isOpen ? (
    <div className="modal">
      {/* Modal content */}
      <button onClick={onClose}>Close</button>
    </div>
  ) : null;
}

// ================================================================
// HELPER FUNCTIONS (for examples above)
// ================================================================

async function saveEncounter(id: string): Promise<void> {
  // Existing save logic
}

async function generateNoteWithAI(): Promise<string> {
  return 'AI generated note';
}

async function capturePhoto(): Promise<unknown> {
  return {};
}

async function sendERxPrescription(medication: string): Promise<void> {
  // E-prescribing logic
}

function printPrescription(medication: string): void {
  // Print logic
}

async function searchPatients(query: string): Promise<unknown[]> {
  return [];
}

function savePatient(data: unknown): Promise<void> {
  return Promise.resolve();
}

function exportPatientData(): void {
  // Export logic
}

function savePhoto(photo: unknown): void {
  // Save logic
}

// ================================================================
// INTEGRATION CHECKLIST
// ================================================================

/*
✅ Backend Integration:
  - [ ] Add metrics routes to index.ts
  - [ ] Run database migration
  - [ ] Restart backend server
  - [ ] Test API endpoints

✅ Frontend Integration:
  - [ ] Wrap app with MetricsProvider
  - [ ] Add MetricsDashboard to routes
  - [ ] Add metrics menu item
  - [ ] Add EfficiencyBadge to encounter pages
  - [ ] Add EncounterSummary on completion
  - [ ] Add tracking to key actions

✅ Testing:
  - [ ] Complete a test encounter
  - [ ] Verify events logged
  - [ ] Check summary displays
  - [ ] View dashboard
  - [ ] Test offline mode

✅ Deployment:
  - [ ] Run in staging
  - [ ] Performance test
  - [ ] Deploy to production
  - [ ] Monitor metrics
  - [ ] Train users
*/

// ================================================================
// QUICK IMPORTS REFERENCE
// ================================================================

/*
// All-in-one import
import {
  MetricsProvider,
  EfficiencyBadge,
  EncounterSummary,
  useMetrics,
  usePageMetrics,
  useEncounterMetrics,
  useFormMetrics,
} from './components/Metrics';

// Or individual imports
import { MetricsProvider } from './components/Metrics/MetricsProvider';
import { EfficiencyBadge } from './components/Metrics/EfficiencyBadge';
import { EncounterSummary } from './components/Metrics/EncounterSummary';
import { useMetrics } from './hooks/useMetrics';
*/

export default App;
