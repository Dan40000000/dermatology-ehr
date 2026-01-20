/**
 * EXAMPLE USAGE - Metrics Tracking
 *
 * This file demonstrates how to integrate metrics tracking
 * into your components. Copy and adapt these patterns.
 *
 * DO NOT IMPORT THIS FILE - It's for reference only!
 */

import { useState, useEffect } from 'react';
import { useMetrics, useEncounterMetrics, useFormMetrics, usePageMetrics } from '../../hooks/useMetrics';
import { EfficiencyBadge } from './EfficiencyBadge';
import { EncounterSummary } from './EncounterSummary';

// ================================================
// EXAMPLE 1: Basic Button Click Tracking
// ================================================

export function Example1_BasicTracking() {
  const { trackClick, trackButtonClick } = useMetrics();

  return (
    <div>
      {/* Simple click tracking */}
      <button onClick={() => trackClick('save-button', 'click')}>
        Save
      </button>

      {/* Better: use trackButtonClick with label */}
      <button onClick={() => trackButtonClick('save-button', 'Save Patient')}>
        Save Patient
      </button>

      {/* Track with metadata */}
      <button
        onClick={() =>
          trackClick('export-button', 'export', {
            format: 'pdf',
            includePhotos: true,
          })
        }
      >
        Export to PDF
      </button>
    </div>
  );
}

// ================================================
// EXAMPLE 2: Form Tracking
// ================================================

export function Example2_FormTracking() {
  const formMetrics = useFormMetrics('patient-intake-form', 'Patient Intake');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Track successful submission
    formMetrics.trackFormComplete();

    // Save form...
  };

  const handleCancel = () => {
    // Track abandonment
    formMetrics.trackFormAbandon();
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        onFocus={() => formMetrics.trackFieldInteraction()}
        onChange={() => formMetrics.trackFieldInteraction()}
      />

      <button type="submit">Submit</button>
      <button type="button" onClick={handleCancel}>
        Cancel
      </button>
    </form>
  );
}

// ================================================
// EXAMPLE 3: Page View Tracking
// ================================================

export function Example3_PageTracking() {
  // Automatically tracks page view and load time
  usePageMetrics('/patients/list', undefined, undefined);

  return <div>Patient List</div>;
}

// ================================================
// EXAMPLE 4: Encounter Tracking (Full Example)
// ================================================

export function Example4_EncounterPage({
  encounterId,
  patientId,
  patientName,
}: {
  encounterId: string;
  patientId: string;
  patientName: string;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const [currentSection, setCurrentSection] = useState('notes');

  // This hook:
  // 1. Starts encounter tracking on mount
  // 2. Ends encounter tracking on unmount
  // 3. Provides trackSection for section timing
  const metrics = useEncounterMetrics(encounterId, patientId);

  // Track section changes
  useEffect(() => {
    metrics.trackSection(currentSection);
  }, [currentSection, metrics]);

  const handleCompleteEncounter = async () => {
    // Track the completion action
    metrics.trackButtonClick('complete-encounter', 'Complete Encounter');

    // Save encounter...
    await saveEncounter();

    // Show summary modal
    setShowSummary(true);
  };

  return (
    <div>
      {/* Real-time efficiency badge */}
      <EfficiencyBadge position="top-right" compact={false} showDetails={true} />

      {/* Section tabs */}
      <div>
        <button onClick={() => setCurrentSection('notes')}>Notes</button>
        <button onClick={() => setCurrentSection('orders')}>Orders</button>
        <button onClick={() => setCurrentSection('photos')}>Photos</button>
        <button onClick={() => setCurrentSection('prescriptions')}>Prescriptions</button>
        <button onClick={() => setCurrentSection('billing')}>Billing</button>
      </div>

      {/* Section content */}
      {currentSection === 'notes' && <NotesSection metrics={metrics} />}
      {currentSection === 'orders' && <OrdersSection metrics={metrics} />}
      {/* etc... */}

      {/* Complete button */}
      <button onClick={handleCompleteEncounter}>Complete Encounter</button>

      {/* Summary modal */}
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

// ================================================
// EXAMPLE 5: Section with Detailed Tracking
// ================================================

function NotesSection({ metrics }: { metrics: ReturnType<typeof useEncounterMetrics> }) {
  const [notes, setNotes] = useState('');
  const [useAI, setUseAI] = useState(false);

  const handleAIGenerate = async () => {
    const endTimer = metrics.startTimer('ai-note-generation');

    try {
      const generatedNote = await generateAINote();
      setNotes(generatedNote);

      const duration = endTimer(); // Returns duration in ms

      // Track AI success with time saved
      metrics.trackAIFeature('note-generation', true, Math.floor(duration / 1000));
    } catch (error) {
      endTimer();
      metrics.trackAIFeature('note-generation', false);
      metrics.trackError('ai-generation-failed', error.message);
    }
  };

  const handleSave = () => {
    metrics.trackButtonClick('save-notes', 'Save Notes', {
      length: notes.length,
      usedAI: useAI,
    });

    // Save notes...
  };

  return (
    <div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />

      <button onClick={handleAIGenerate}>Generate with AI</button>

      <button onClick={handleSave}>Save Notes</button>
    </div>
  );
}

// ================================================
// EXAMPLE 6: Search Tracking
// ================================================

export function Example6_SearchTracking() {
  const { trackSearch } = useMetrics();
  const [results, setResults] = useState<unknown[]>([]);

  const handleSearch = async (query: string) => {
    const searchResults = await performSearch(query);
    setResults(searchResults);

    // Track search with result count
    trackSearch(query, searchResults.length, {
      filters: { status: 'active' },
    });
  };

  return <div>{/* Search UI */}</div>;
}

// ================================================
// EXAMPLE 7: Feature Usage Tracking
// ================================================

export function Example7_FeatureUsage() {
  const { trackFeatureUse, measureAsync } = useMetrics();

  const handlePhotoCapture = async () => {
    trackFeatureUse('photo-capture');

    // Measure how long it takes
    const photo = await measureAsync('capture-photo', async () => {
      return await capturePhoto();
    });

    // Additional tracking with details
    trackFeatureUse('photo-capture-success', {
      bodyLocation: 'left-arm',
      resolution: '1920x1080',
    });
  };

  return <button onClick={handlePhotoCapture}>Capture Photo</button>;
}

// ================================================
// EXAMPLE 8: Tab/Section Change Tracking
// ================================================

export function Example8_TabTracking() {
  const { trackTabChange } = useMetrics();
  const [activeTab, setActiveTab] = useState('demographics');

  const handleTabChange = (newTab: string) => {
    trackTabChange(newTab, activeTab);
    setActiveTab(newTab);
  };

  return (
    <div>
      <button onClick={() => handleTabChange('demographics')}>Demographics</button>
      <button onClick={() => handleTabChange('insurance')}>Insurance</button>
      <button onClick={() => handleTabChange('medical-history')}>Medical History</button>
    </div>
  );
}

// ================================================
// EXAMPLE 9: Filter/Sort Tracking
// ================================================

export function Example9_FilterTracking() {
  const { trackFilter, trackSort } = useMetrics();
  const [filters, setFilters] = useState({ status: 'all' });

  const handleFilterChange = (key: string, value: string) => {
    trackFilter(key, value);
    setFilters({ ...filters, [key]: value });
  };

  const handleSort = (field: string, direction: 'asc' | 'desc') => {
    trackSort(field, direction);
    // Apply sort...
  };

  return (
    <div>
      <select onChange={(e) => handleFilterChange('status', e.target.value)}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>

      <button onClick={() => handleSort('name', 'asc')}>Sort by Name</button>
    </div>
  );
}

// ================================================
// EXAMPLE 10: Modal Tracking
// ================================================

export function Example10_ModalTracking() {
  const { trackModalOpen, trackModalClose } = useMetrics();
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => {
    setIsOpen(true);
    trackModalOpen('patient-search-modal', { source: 'header' });
  };

  const closeModal = () => {
    setIsOpen(false);
    trackModalClose('patient-search-modal', { actionTaken: 'cancel' });
  };

  return (
    <div>
      <button onClick={openModal}>Search Patients</button>

      {isOpen && (
        <div>
          {/* Modal content */}
          <button onClick={closeModal}>Close</button>
        </div>
      )}
    </div>
  );
}

// ================================================
// EXAMPLE 11: Document Upload Tracking
// ================================================

export function Example11_DocumentTracking() {
  const { trackDocumentUpload } = useMetrics();

  const handleFileUpload = async (file: File) => {
    // Track the upload
    trackDocumentUpload(file.type, file.size, {
      fileName: file.name,
    });

    // Upload file...
    await uploadDocument(file);
  };

  return <input type="file" onChange={(e) => handleFileUpload(e.target.files![0])} />;
}

// ================================================
// EXAMPLE 12: Prescription Tracking
// ================================================

export function Example12_PrescriptionTracking() {
  const { trackPrescription } = useMetrics();

  const handlePrescribe = (medication: string, isERx: boolean) => {
    trackPrescription(medication, isERx, {
      dosage: '10mg',
      frequency: 'daily',
    });

    // Send prescription...
  };

  return (
    <div>
      <button onClick={() => handlePrescribe('Tretinoin', true)}>Send E-Prescription</button>
      <button onClick={() => handlePrescribe('Tretinoin', false)}>Print Prescription</button>
    </div>
  );
}

// ================================================
// EXAMPLE 13: Error Tracking
// ================================================

export function Example13_ErrorTracking() {
  const { trackError } = useMetrics();

  const handleAction = async () => {
    try {
      await performAction();
    } catch (error) {
      // Track the error
      trackError('action-failed', error.message, {
        action: 'performAction',
        timestamp: new Date().toISOString(),
      });

      // Show error to user...
    }
  };

  return <button onClick={handleAction}>Perform Action</button>;
}

// ================================================
// EXAMPLE 14: Complex Async Task Measurement
// ================================================

export function Example14_AsyncMeasurement() {
  const { measureAsync, trackFeatureUse } = useMetrics();

  const handleComplexOperation = async () => {
    try {
      const result = await measureAsync('complex-operation', async () => {
        // Step 1: Fetch data
        const data = await fetchData();

        // Step 2: Process data
        const processed = await processData(data);

        // Step 3: Save results
        await saveResults(processed);

        return processed;
      });

      // Track success
      trackFeatureUse('complex-operation-success', {
        recordsProcessed: result.length,
      });
    } catch (error) {
      // Error is automatically tracked with duration
      trackFeatureUse('complex-operation-failure');
    }
  };

  return <button onClick={handleComplexOperation}>Run Complex Operation</button>;
}

// ================================================
// EXAMPLE 15: Component Lifecycle Tracking
// ================================================

export function Example15_ComponentLifecycle() {
  // Automatically tracks component mount/unmount time
  useMetrics({
    trackComponentLifecycle: true,
    componentName: 'PatientDetailPanel',
  });

  return <div>Patient details...</div>;
}

// ================================================
// HELPER FUNCTIONS (for examples)
// ================================================

async function generateAINote(): Promise<string> {
  return 'AI-generated note';
}

async function performSearch(query: string): Promise<unknown[]> {
  return [];
}

async function capturePhoto(): Promise<unknown> {
  return {};
}

async function uploadDocument(file: File): Promise<void> {
  // Upload logic
}

async function performAction(): Promise<void> {
  // Action logic
}

async function saveEncounter(): Promise<void> {
  // Save logic
}

async function fetchData(): Promise<unknown[]> {
  return [];
}

async function processData(data: unknown[]): Promise<unknown[]> {
  return data;
}

async function saveResults(data: unknown[]): Promise<void> {
  // Save logic
}

// ================================================
// USAGE SUMMARY
// ================================================

/**
 * QUICK REFERENCE:
 *
 * Basic Tracking:
 * - trackClick(id, action, metadata?)
 * - trackButtonClick(id, label, metadata?)
 * - trackFormSubmit(id, data?)
 *
 * Navigation:
 * - trackNavigation(from, to)
 * - trackTabChange(tab, previousTab?, metadata?)
 *
 * Tasks & Timing:
 * - startTask(name)
 * - endTask(name)
 * - startTimer(name) -> returns endTimer()
 * - measureAsync(name, asyncFn)
 * - measureSync(name, syncFn)
 *
 * Specialized:
 * - trackSearch(query, resultCount?, metadata?)
 * - trackFilter(name, value, metadata?)
 * - trackSort(field, direction, metadata?)
 * - trackModalOpen(id, metadata?)
 * - trackModalClose(id, metadata?)
 * - trackFeatureUse(name, metadata?)
 * - trackError(type, message?, metadata?)
 * - trackAIFeature(name, success, timeSaved?, metadata?)
 * - trackDocumentUpload(type, size?, metadata?)
 * - trackPhotoCapture(type, location?, metadata?)
 * - trackPrescription(medication, isERx, metadata?)
 *
 * Hooks:
 * - useMetrics(options?)
 * - usePageMetrics(pageName, patientId?, encounterId?)
 * - useEncounterMetrics(encounterId, patientId)
 * - useFormMetrics(formId, formName?)
 *
 * Components:
 * - <EfficiencyBadge position? compact? showDetails? />
 * - <EncounterSummary encounterId patientName? onClose autoClose? autoCloseDelay? />
 *
 * Pages:
 * - <MetricsDashboard /> at /admin/metrics
 */
