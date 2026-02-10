import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { CourseSetup } from '../components/phototherapy/CourseSetup';
import { TreatmentLogger } from '../components/phototherapy/TreatmentLogger';
import { DoseCalculator } from '../components/phototherapy/DoseCalculator';
import { TreatmentHistory } from '../components/phototherapy/TreatmentHistory';
import { CumulativeDose } from '../components/phototherapy/CumulativeDose';
import { ErythemaScale } from '../components/phototherapy/ErythemaScale';
import type { Patient, Provider } from '../types';
import { fetchPatients, fetchProviders } from '../api';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../api';

// Types
type MainTab = 'active-courses' | 'new-course' | 'protocols' | 'cabinets' | 'alerts';

interface PhototherapyCourse {
  id: string;
  patient_id: string;
  patient_name: string;
  mrn?: string;
  protocol_id: string;
  protocol_name: string;
  light_type: string;
  condition: string;
  fitzpatrick_skin_type: number;
  start_date: string;
  end_date?: string;
  status: 'active' | 'completed' | 'discontinued' | 'on_hold';
  total_treatments: number;
  cumulative_dose_course: number;
  last_treatment_date?: string;
  prescribing_provider_name: string;
}

interface PhototherapyProtocol {
  id: string;
  name: string;
  condition: string;
  light_type: string;
  starting_dose?: number;
  increment_percent: number;
  max_dose?: number;
  frequency: string;
  is_template: boolean;
}

interface PhototherapyAlert {
  id: string;
  patient_id?: string;
  patient_name?: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: string;
}

// Light type display info
const LIGHT_TYPE_INFO: Record<string, { color: string; description: string }> = {
  'NB-UVB': { color: 'bg-purple-100 text-purple-800', description: '311nm - Psoriasis, Vitiligo, Eczema' },
  'BB-UVB': { color: 'bg-blue-100 text-blue-800', description: '280-320nm - Less common' },
  'PUVA': { color: 'bg-orange-100 text-orange-800', description: 'Psoralen + UVA - Psoriasis, CTCL' },
  'UVA1': { color: 'bg-yellow-100 text-yellow-800', description: '340-400nm - Morphea, Atopic Dermatitis' },
};

// Fitzpatrick skin type descriptions
const FITZPATRICK_DESCRIPTIONS: Record<number, string> = {
  1: 'Type I - Very fair, always burns',
  2: 'Type II - Fair, usually burns',
  3: 'Type III - Medium, sometimes burns',
  4: 'Type IV - Olive, rarely burns',
  5: 'Type V - Brown, very rarely burns',
  6: 'Type VI - Dark brown/black, never burns',
};

export function PhototherapyPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<PhototherapyCourse[]>([]);
  const [protocols, setProtocols] = useState<PhototherapyProtocol[]>([]);
  const [alerts, setAlerts] = useState<PhototherapyAlert[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>('active-courses');

  // Selected course for treatment
  const [selectedCourse, setSelectedCourse] = useState<PhototherapyCourse | null>(null);
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);
  const [showCourseDetails, setShowCourseDetails] = useState(false);
  const [courseDetails, setCourseDetails] = useState<any>(null);

  // API helpers
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!session) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        [TENANT_HEADER_NAME]: session.tenantId,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }, [session]);

  // Load data
  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [coursesRes, protocolsRes, alertsRes, patientsRes, providersRes] = await Promise.all([
        fetchWithAuth('/api/phototherapy/courses?status=active'),
        fetchWithAuth('/api/phototherapy/protocols'),
        fetchWithAuth('/api/phototherapy/alerts?status=active'),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setCourses(coursesRes.courses || []);
      setProtocols(protocolsRes.protocols || []);
      setAlerts(alertsRes.alerts || []);
      setPatients(patientsRes.data || patientsRes.patients || []);
      setProviders(providersRes.providers || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, fetchWithAuth, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle URL params
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['active-courses', 'new-course', 'protocols', 'cabinets', 'alerts'].includes(tab)) {
      setMainTab(tab as MainTab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: MainTab) => {
    setMainTab(tab);
    setSearchParams({ tab });
  };

  // Load course details
  const loadCourseDetails = async (courseId: string) => {
    try {
      const details = await fetchWithAuth(`/api/phototherapy/courses/${courseId}`);
      setCourseDetails(details);
      setShowCourseDetails(true);
    } catch (err: any) {
      showError(err.message || 'Failed to load course details');
    }
  };

  // Handle course creation
  const handleCourseCreated = () => {
    showSuccess('Phototherapy course created successfully');
    loadData();
    handleTabChange('active-courses');
  };

  // Handle treatment recorded
  const handleTreatmentRecorded = () => {
    showSuccess('Treatment recorded successfully');
    setShowTreatmentModal(false);
    loadData();
    if (selectedCourse) {
      loadCourseDetails(selectedCourse.id);
    }
  };

  // Handle alert acknowledgment
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await fetchWithAuth(`/api/phototherapy/alerts/${alertId}/acknowledge`, { method: 'PUT' });
      showSuccess('Alert acknowledged');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to acknowledge alert');
    }
  };

  // Render loading skeleton
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phototherapy Management</h1>
          <p className="text-sm text-gray-500">UV light therapy tracking for NB-UVB, BB-UVB, PUVA, and UVA1</p>
        </div>
        <div className="flex items-center gap-2">
          {alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length > 0 && (
            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
              {alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length} Active Alerts
            </span>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Active Courses</div>
          <div className="text-2xl font-bold text-gray-900">{courses.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Treatments Today</div>
          <div className="text-2xl font-bold text-gray-900">
            {courses.filter(c => c.last_treatment_date === new Date().toISOString().split('T')[0]).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Protocol Templates</div>
          <div className="text-2xl font-bold text-gray-900">{protocols.filter(p => p.is_template).length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Active Alerts</div>
          <div className={`text-2xl font-bold ${alerts.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {alerts.length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'active-courses', label: 'Active Courses' },
            { key: 'new-course', label: 'New Course' },
            { key: 'protocols', label: 'Protocols' },
            { key: 'cabinets', label: 'Cabinets' },
            { key: 'alerts', label: `Alerts (${alerts.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key as MainTab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                mainTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {mainTab === 'active-courses' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Active Phototherapy Courses</h2>
          </div>
          {courses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No active phototherapy courses</p>
              <button
                onClick={() => handleTabChange('new-course')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Start New Course
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {courses.map(course => (
                <div key={course.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-gray-900">{course.patient_name}</h3>
                        {course.mrn && <span className="text-sm text-gray-500">MRN: {course.mrn}</span>}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${LIGHT_TYPE_INFO[course.light_type]?.color || 'bg-gray-100'}`}>
                          {course.light_type}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <span className="font-medium">{course.protocol_name}</span>
                        <span className="mx-2">|</span>
                        <span>Skin Type {course.fitzpatrick_skin_type}</span>
                        <span className="mx-2">|</span>
                        <span>Treatments: {course.total_treatments}</span>
                        <span className="mx-2">|</span>
                        <span>Dose: {(course.cumulative_dose_course / 1000).toFixed(2)} J/cm2</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Started: {new Date(course.start_date).toLocaleDateString()}
                        {course.last_treatment_date && (
                          <span className="ml-3">
                            Last Treatment: {new Date(course.last_treatment_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadCourseDetails(course.id)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCourse(course);
                          setShowTreatmentModal(true);
                        }}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Record Treatment
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mainTab === 'new-course' && (
        <CourseSetup
          protocols={protocols.filter(p => p.is_template)}
          patients={patients}
          providers={providers}
          fetchWithAuth={fetchWithAuth}
          onCourseCreated={handleCourseCreated}
        />
      )}

      {mainTab === 'protocols' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Protocol Templates</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {protocols.filter(p => p.is_template).map(protocol => (
              <div key={protocol.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{protocol.name}</h3>
                    <div className="mt-1 flex items-center gap-3 text-sm text-gray-600">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${LIGHT_TYPE_INFO[protocol.light_type]?.color || 'bg-gray-100'}`}>
                        {protocol.light_type}
                      </span>
                      <span>Condition: {protocol.condition}</span>
                      <span>Increment: {protocol.increment_percent}%</span>
                      {protocol.max_dose && <span>Max: {protocol.max_dose} mJ/cm2</span>}
                      <span>Frequency: {protocol.frequency.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mainTab === 'cabinets' && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          <p>Cabinet management coming soon</p>
          <p className="text-sm mt-2">Track equipment calibration, bulb hours, and maintenance schedules</p>
        </div>
      )}

      {mainTab === 'alerts' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Active Alerts</h2>
          </div>
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No active alerts
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {alerts.map(alert => (
                <div key={alert.id} className={`p-4 ${
                  alert.severity === 'critical' ? 'bg-red-50' :
                  alert.severity === 'high' ? 'bg-orange-50' :
                  alert.severity === 'medium' ? 'bg-yellow-50' : 'bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                          alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <h3 className="font-medium text-gray-900">{alert.title}</h3>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{alert.message}</p>
                      {alert.patient_name && (
                        <p className="mt-1 text-sm text-gray-500">Patient: {alert.patient_name}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAcknowledgeAlert(alert.id)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-white"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Treatment Modal */}
      <Modal
        isOpen={showTreatmentModal}
        onClose={() => setShowTreatmentModal(false)}
        title={`Record Treatment - ${selectedCourse?.patient_name}`}
        size="lg"
      >
        {selectedCourse && (
          <TreatmentLogger
            course={selectedCourse}
            fetchWithAuth={fetchWithAuth}
            onTreatmentRecorded={handleTreatmentRecorded}
            onCancel={() => setShowTreatmentModal(false)}
          />
        )}
      </Modal>

      {/* Course Details Modal */}
      <Modal
        isOpen={showCourseDetails}
        onClose={() => setShowCourseDetails(false)}
        title="Course Details"
        size="xl"
      >
        {courseDetails && (
          <div className="space-y-6">
            {/* Course Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Course Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Patient:</span>
                  <span className="ml-2 font-medium">{courseDetails.course.patient_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Protocol:</span>
                  <span className="ml-2 font-medium">{courseDetails.course.protocol_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Light Type:</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${LIGHT_TYPE_INFO[courseDetails.course.light_type]?.color || 'bg-gray-100'}`}>
                    {courseDetails.course.light_type}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Skin Type:</span>
                  <span className="ml-2">{FITZPATRICK_DESCRIPTIONS[courseDetails.course.fitzpatrick_skin_type]}</span>
                </div>
                <div>
                  <span className="text-gray-500">Start Date:</span>
                  <span className="ml-2">{new Date(courseDetails.course.start_date).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Total Treatments:</span>
                  <span className="ml-2 font-medium">{courseDetails.course.total_treatments}</span>
                </div>
              </div>
            </div>

            {/* Next Dose Calculator */}
            <DoseCalculator nextDose={courseDetails.nextDose} />

            {/* Treatment History */}
            <TreatmentHistory treatments={courseDetails.treatments} />

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setSelectedCourse(courses.find(c => c.id === courseDetails.course.id) || null);
                  setShowCourseDetails(false);
                  setShowTreatmentModal(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Record Treatment
              </button>
              <button
                onClick={() => setShowCourseDetails(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PhototherapyPage;
