/**
 * InsuranceVerificationPage
 *
 * Dashboard for all insurance verification tasks
 * - Patients needing verification
 * - Patients with issues
 * - Batch verification tools
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Users, TrendingUp, Calendar, AlertCircle, Clock, Shield, Search, FileText, RefreshCw, Power } from 'lucide-react';
import { api } from '../api';
import { BatchEligibility } from '../components/Insurance/BatchEligibility';
import { CoverageSummaryCard } from '../components/Insurance/CoverageSummaryCard';

interface PatientsWithIssues {
  patientId: string;
  firstName: string;
  lastName: string;
  payerName: string;
  verificationStatus: string;
  verifiedAt: string;
  issueType: string;
  issueNotes: string;
  nextAppointment: string | null;
}

interface PatientsNeedingVerification {
  patientId: string;
  patientName: string;
  lastVerifiedAt: string | null;
  daysSinceVerification: number | null;
  upcomingAppointmentDate: string | null;
}

interface AutoVerificationStats {
  enabled: boolean;
  lastRun: string | null;
  todayCount: number;
  tomorrowScheduled: number;
}

interface BenefitsDetail {
  patientId: string;
  payerName: string;
  planName: string;
  officeCopay: number;
  specialistCopay: number;
  deductibleTotal: number;
  deductibleMet: number;
  deductibleRemaining: number;
  oopMax: number;
  oopMet: number;
  oopRemaining: number;
  coinsurancePercent: number;
  effectiveDate: string;
  terminationDate: string | null;
  verificationStatus: string;
}

interface CPTAuthRequirement {
  cptCode: string;
  description: string;
  requiresAuth: boolean;
  payerSpecific: {
    payerName: string;
    required: boolean;
    notes: string;
  }[];
}

export const InsuranceVerificationPage: React.FC = () => {
  const [patientsWithIssues, setPatientsWithIssues] = useState<PatientsWithIssues[]>([]);
  const [patientsNeedingVerification, setPatientsNeedingVerification] = useState<PatientsNeedingVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'batch' | 'issues' | 'benefits' | 'priorauth'>('overview');
  const [stats, setStats] = useState({
    totalIssues: 0,
    needingVerification: 0,
    upcomingAppointments: 0,
  });

  // Auto-verification state
  const [autoVerifyStats, setAutoVerifyStats] = useState<AutoVerificationStats>({
    enabled: true,
    lastRun: null,
    todayCount: 0,
    tomorrowScheduled: 0,
  });
  const [togglingAutoVerify, setTogglingAutoVerify] = useState(false);

  // Benefits lookup state
  const [selectedPatientForBenefits, setSelectedPatientForBenefits] = useState<string>('');
  const [benefitsDetail, setBenefitsDetail] = useState<BenefitsDetail | null>(null);
  const [loadingBenefits, setLoadingBenefits] = useState(false);

  // Prior auth lookup state
  const [cptCodeLookup, setCptCodeLookup] = useState('');
  const [authRequirement, setAuthRequirement] = useState<CPTAuthRequirement | null>(null);
  const [loadingAuthReq, setLoadingAuthReq] = useState(false);

  useEffect(() => {
    loadData();
    loadAutoVerifyStats();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [issuesResponse, pendingResponse] = await Promise.all([
        api.get('/api/eligibility/issues'),
        api.get('/api/eligibility/pending?daysThreshold=30'),
      ]);

      if (issuesResponse.data.success) {
        setPatientsWithIssues(issuesResponse.data.patients);
      }

      if (pendingResponse.data.success) {
        setPatientsNeedingVerification(pendingResponse.data.patients);
      }

      // Calculate stats
      const upcomingCount = pendingResponse.data.patients.filter(
        (p: any) => p.upcoming_appointment_date
      ).length;

      setStats({
        totalIssues: issuesResponse.data.count || 0,
        needingVerification: pendingResponse.data.count || 0,
        upcomingAppointments: upcomingCount,
      });
    } catch (error) {
      console.error('Error loading verification data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAutoVerifyStats = async () => {
    try {
      const response = await api.get('/api/eligibility/auto-verify/stats');
      if (response.data.success) {
        setAutoVerifyStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error loading auto-verify stats:', error);
    }
  };

  const toggleAutoVerification = async () => {
    setTogglingAutoVerify(true);
    try {
      const response = await api.post('/api/eligibility/auto-verify/toggle', {
        enabled: !autoVerifyStats.enabled,
      });
      if (response.data.success) {
        setAutoVerifyStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error toggling auto-verification:', error);
      alert('Failed to toggle auto-verification');
    } finally {
      setTogglingAutoVerify(false);
    }
  };

  const loadPatientBenefits = async (patientId: string) => {
    if (!patientId) return;

    setLoadingBenefits(true);
    try {
      const response = await api.get(`/api/eligibility/benefits/${patientId}`);
      if (response.data.success) {
        setBenefitsDetail(response.data.benefits);
      }
    } catch (error) {
      console.error('Error loading benefits:', error);
      alert('Failed to load benefits details');
    } finally {
      setLoadingBenefits(false);
    }
  };

  const lookupCPTAuth = async (cptCode: string) => {
    if (!cptCode) return;

    setLoadingAuthReq(true);
    try {
      const response = await api.get(`/api/eligibility/prior-auth/${cptCode}`);
      if (response.data.success) {
        setAuthRequirement(response.data.requirement);
      }
    } catch (error) {
      console.error('Error looking up CPT auth:', error);
      alert('Failed to look up prior auth requirement');
    } finally {
      setLoadingAuthReq(false);
    }
  };

  const renderAutoVerificationPanel = () => (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Clock className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Auto-Verification</h2>
            <p className="text-sm text-gray-600">Automatically verify patients 24 hours before appointments</p>
          </div>
        </div>
        <button
          onClick={toggleAutoVerification}
          disabled={togglingAutoVerify}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
            autoVerifyStats.enabled ? 'bg-blue-600' : 'bg-gray-300'
          } ${togglingAutoVerify ? 'opacity-50' : ''}`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
              autoVerifyStats.enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-900">Auto-Verified Today</p>
          </div>
          <p className="text-3xl font-bold text-green-900">{autoVerifyStats.todayCount}</p>
          <p className="text-xs text-green-700 mt-1">patients verified automatically</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <p className="text-sm font-medium text-blue-900">Scheduled for Tomorrow</p>
          </div>
          <p className="text-3xl font-bold text-blue-900">{autoVerifyStats.tomorrowScheduled}</p>
          <p className="text-xs text-blue-700 mt-1">appointments with insurance</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-5 h-5 text-purple-600" />
            <p className="text-sm font-medium text-purple-900">Last Auto-Run</p>
          </div>
          <p className="text-lg font-semibold text-purple-900">
            {autoVerifyStats.lastRun ? new Date(autoVerifyStats.lastRun).toLocaleString() : 'Never'}
          </p>
          <p className="text-xs text-purple-700 mt-1">
            {autoVerifyStats.enabled ? 'Next run: Tomorrow 6:00 AM' : 'Auto-verification disabled'}
          </p>
        </div>
      </div>

      {autoVerifyStats.enabled && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-medium">Auto-verification is active</p>
              <p className="mt-1">
                The system will automatically verify insurance for all patients with appointments scheduled for tomorrow.
                Verifications run daily at 6:00 AM.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderBenefitsTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Real-Time Benefits Lookup</h2>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            View detailed insurance benefits breakdown for any patient
          </p>
        </div>

        <div className="p-6">
          <div className="flex space-x-3 mb-6">
            <select
              value={selectedPatientForBenefits}
              onChange={(e) => {
                setSelectedPatientForBenefits(e.target.value);
                if (e.target.value) loadPatientBenefits(e.target.value);
              }}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a patient...</option>
              {patientsNeedingVerification.map((patient) => (
                <option key={patient.patientId} value={patient.patientId}>
                  {patient.patientName}
                </option>
              ))}
            </select>
            <button
              onClick={() => selectedPatientForBenefits && loadPatientBenefits(selectedPatientForBenefits)}
              disabled={!selectedPatientForBenefits || loadingBenefits}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              <RefreshCw className={`w-4 h-4 ${loadingBenefits ? 'animate-spin' : ''}`} />
              <span>{loadingBenefits ? 'Loading...' : 'Load Benefits'}</span>
            </button>
          </div>

          {benefitsDetail && (
            <div className="space-y-6">
              {/* Payer & Plan Information */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900 mb-3">Plan Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Payer</p>
                    <p className="font-medium text-gray-900">{benefitsDetail.payerName}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Plan Name</p>
                    <p className="font-medium text-gray-900">{benefitsDetail.planName}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Effective Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(benefitsDetail.effectiveDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Termination Date</p>
                    <p className="font-medium text-gray-900">
                      {benefitsDetail.terminationDate
                        ? new Date(benefitsDetail.terminationDate).toLocaleDateString()
                        : 'Active'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefits Breakdown */}
              <div className="grid grid-cols-2 gap-6">
                {/* Copays */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Copays</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Office Visit</span>
                      <span className="text-lg font-bold text-gray-900">
                        ${(benefitsDetail.officeCopay / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Specialist</span>
                      <span className="text-lg font-bold text-gray-900">
                        ${(benefitsDetail.specialistCopay / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Coinsurance */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Coinsurance</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Patient Responsibility</span>
                    <span className="text-3xl font-bold text-blue-600">
                      {benefitsDetail.coinsurancePercent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Deductible & OOP */}
              <div className="grid grid-cols-2 gap-6">
                {/* Deductible */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Deductible</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total</span>
                      <span className="font-medium">${(benefitsDetail.deductibleTotal / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Met</span>
                      <span className="font-medium text-green-600">
                        ${(benefitsDetail.deductibleMet / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Remaining</span>
                      <span className="font-medium text-red-600">
                        ${(benefitsDetail.deductibleRemaining / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${(benefitsDetail.deductibleMet / benefitsDetail.deductibleTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Out-of-Pocket Max */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Out-of-Pocket Maximum</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total</span>
                      <span className="font-medium">${(benefitsDetail.oopMax / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Met</span>
                      <span className="font-medium text-green-600">
                        ${(benefitsDetail.oopMet / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Remaining</span>
                      <span className="font-medium text-red-600">
                        ${(benefitsDetail.oopRemaining / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${(benefitsDetail.oopMet / benefitsDetail.oopMax) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <span
                  className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    benefitsDetail.verificationStatus === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  Status: {benefitsDetail.verificationStatus.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {!benefitsDetail && !loadingBenefits && (
            <div className="text-center py-12 text-gray-500">
              <Shield className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>Select a patient to view their insurance benefits</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPriorAuthTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Prior Authorization Lookup</h2>
          </div>
          <p className="text-sm text-gray-600 mt-2">Check if a CPT code requires prior authorization</p>
        </div>

        <div className="p-6">
          <div className="flex space-x-3 mb-6">
            <input
              type="text"
              value={cptCodeLookup}
              onChange={(e) => setCptCodeLookup(e.target.value)}
              placeholder="Enter CPT code (e.g., 17311)"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => lookupCPTAuth(cptCodeLookup)}
              disabled={!cptCodeLookup || loadingAuthReq}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              <Search className={`w-4 h-4 ${loadingAuthReq ? 'animate-spin' : ''}`} />
              <span>Lookup</span>
            </button>
          </div>

          {/* Common Dermatology Codes */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Common Dermatology Codes</h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => {
                  setCptCodeLookup('17311');
                  lookupCPTAuth('17311');
                }}
                className="border border-gray-300 rounded-lg p-3 hover:bg-gray-50 text-left"
              >
                <p className="font-mono font-semibold text-blue-600">17311</p>
                <p className="text-xs text-gray-600">Mohs Surgery (first stage)</p>
              </button>
              <button
                onClick={() => {
                  setCptCodeLookup('96920');
                  lookupCPTAuth('96920');
                }}
                className="border border-gray-300 rounded-lg p-3 hover:bg-gray-50 text-left"
              >
                <p className="font-mono font-semibold text-blue-600">96920</p>
                <p className="text-xs text-gray-600">Laser Treatment</p>
              </button>
              <button
                onClick={() => {
                  setCptCodeLookup('J0881');
                  lookupCPTAuth('J0881');
                }}
                className="border border-gray-300 rounded-lg p-3 hover:bg-gray-50 text-left"
              >
                <p className="font-mono font-semibold text-blue-600">J0881</p>
                <p className="text-xs text-gray-600">Darzalex Injection</p>
              </button>
            </div>
          </div>

          {/* Auth Requirement Results */}
          {authRequirement && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-mono text-lg font-bold text-gray-900">{authRequirement.cptCode}</p>
                    <p className="text-sm text-gray-600">{authRequirement.description}</p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-semibold ${
                      authRequirement.requiresAuth
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {authRequirement.requiresAuth ? 'Prior Auth Required' : 'No Prior Auth Required'}
                  </span>
                </div>
              </div>

              {/* Payer-Specific Requirements */}
              {authRequirement.payerSpecific.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Payer-Specific Requirements</h3>
                  <div className="space-y-2">
                    {authRequirement.payerSpecific.map((payer, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-lg p-4 flex items-start justify-between"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{payer.payerName}</p>
                          <p className="text-sm text-gray-600 mt-1">{payer.notes}</p>
                        </div>
                        <span
                          className={`ml-4 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                            payer.required ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {payer.required ? 'Required' : 'Not Required'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!authRequirement && !loadingAuthReq && (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>Enter a CPT code to check prior authorization requirements</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Note about Schedule Integration */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">Schedule Integration</h3>
            <p className="text-sm text-blue-800 mb-3">
              Insurance verification status is automatically displayed on the schedule page for each appointment.
            </p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>
                <span className="font-medium">Verified badge:</span> Insurance verified within 30 days
              </li>
              <li>
                <span className="font-medium">Expired badge:</span> Verification older than 30 days
              </li>
              <li>
                <span className="font-medium">Issue badge:</span> Problems detected during verification
              </li>
            </ul>
            <p className="text-sm text-blue-800 mt-3">
              Click "Verify Insurance" on any patient card in the schedule to run a quick verification.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Auto-Verification Panel */}
      {renderAutoVerificationPanel()}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow border-2 border-red-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Patients with Issues</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.totalIssues}</p>
              <p className="text-sm text-gray-500 mt-1">Require attention</p>
            </div>
            <AlertTriangle className="w-12 h-12 text-red-600" />
          </div>
          <button
            onClick={() => setActiveTab('issues')}
            className="mt-4 w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            View Issues
          </button>
        </div>

        <div className="bg-white rounded-lg shadow border-2 border-yellow-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Needing Verification</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.needingVerification}</p>
              <p className="text-sm text-gray-500 mt-1">Not verified in 30 days</p>
            </div>
            <Users className="w-12 h-12 text-yellow-600" />
          </div>
          <button
            onClick={() => setActiveTab('batch')}
            className="mt-4 w-full bg-yellow-600 text-white py-2 px-4 rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
          >
            Batch Verify
          </button>
        </div>

        <div className="bg-white rounded-lg shadow border-2 border-blue-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Upcoming Appointments</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.upcomingAppointments}</p>
              <p className="text-sm text-gray-500 mt-1">With unverified insurance</p>
            </div>
            <Calendar className="w-12 h-12 text-blue-600" />
          </div>
          <button
            onClick={() => setActiveTab('batch')}
            className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Verify Now
          </button>
        </div>
      </div>

      {/* Recent Issues Preview */}
      {patientsWithIssues.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Recent Issues</h2>
              <button
                onClick={() => setActiveTab('issues')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                View All
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {patientsWithIssues.slice(0, 5).map((patient) => (
              <div key={patient.patientId} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-1" />
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {patient.firstName} {patient.lastName}
                      </h3>
                      <p className="text-sm text-gray-600">{patient.payerName}</p>
                      <p className="text-sm text-red-700 mt-1">{patient.issueNotes}</p>
                    </div>
                  </div>
                  {patient.nextAppointment && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Next Appointment</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(patient.nextAppointment).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patients Needing Verification Preview */}
      {patientsNeedingVerification.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Patients Needing Verification</h2>
              <button
                onClick={() => setActiveTab('batch')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Batch Verify
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Verified</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Since</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Appointment</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {patientsNeedingVerification.slice(0, 10).map((patient) => (
                  <tr key={patient.patientId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{patient.patientName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {patient.lastVerifiedAt
                        ? new Date(patient.lastVerifiedAt).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        !patient.daysSinceVerification || patient.daysSinceVerification > 60
                          ? 'bg-red-100 text-red-800'
                          : patient.daysSinceVerification > 30
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {patient.daysSinceVerification ? `${patient.daysSinceVerification} days` : 'Never'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {patient.upcomingAppointmentDate
                        ? new Date(patient.upcomingAppointmentDate).toLocaleDateString()
                        : 'None scheduled'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderIssuesTab = () => (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Patients with Insurance Issues</h2>
        <p className="text-sm text-gray-600 mt-1">{patientsWithIssues.length} patients require attention</p>
      </div>
      <div className="divide-y divide-gray-200">
        {patientsWithIssues.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <p className="text-gray-600">No insurance issues found</p>
            <p className="text-sm text-gray-500 mt-1">All patient insurance verifications are up to date</p>
          </div>
        ) : (
          patientsWithIssues.map((patient) => (
            <div key={patient.patientId} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <AlertTriangle className="w-6 h-6 text-red-600 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">
                      {patient.firstName} {patient.lastName}
                    </h3>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Payer:</span> {patient.payerName}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Status:</span>{' '}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          patient.verificationStatus === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {patient.verificationStatus.toUpperCase()}
                        </span>
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Verified:</span>{' '}
                        {new Date(patient.verifiedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm font-medium text-red-900">Issue:</p>
                      <p className="text-sm text-red-800 mt-1 whitespace-pre-line">{patient.issueNotes}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  {patient.nextAppointment && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Next Appointment</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(patient.nextAppointment).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => window.open(`/patients/${patient.patientId}`, '_blank')}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View Patient
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading verification data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Insurance Verification</h1>
              <p className="text-gray-600 mt-1">
                Manage and verify patient insurance eligibility
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-gray-700">
                <span className="font-medium">Tip:</span> Verify insurance 24 hours before appointments
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>Overview</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'batch'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Batch Verification</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('issues')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'issues'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Issues</span>
                  {stats.totalIssues > 0 && (
                    <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full">
                      {stats.totalIssues}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('benefits')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'benefits'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4" />
                  <span>Benefits</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('priorauth')}
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'priorauth'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>Prior Auth</span>
                </div>
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'batch' && <BatchEligibility onComplete={loadData} />}
        {activeTab === 'issues' && renderIssuesTab()}
        {activeTab === 'benefits' && renderBenefitsTab()}
        {activeTab === 'priorauth' && renderPriorAuthTab()}
      </div>
    </div>
  );
};
