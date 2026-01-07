import { useState, useEffect } from 'react';
import { exportToCSV, exportToPDF, formatCurrency, formatDate } from '../utils/exportUtils';

type ReportType = 'appointments' | 'financial' | 'clinical' | 'patients' | 'productivity' | 'no-shows';

interface ReportFilters {
  startDate: string;
  endDate: string;
  providerId?: string;
  locationId?: string;
  status?: string;
  appointmentTypeId?: string;
  paymentStatus?: string;
  diagnosisCode?: string;
  procedureCode?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  active?: boolean;
}

interface Provider {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface AppointmentType {
  id: string;
  name: string;
}

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType>('appointments');
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [reportData, setReportData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);

  // Fetch filter options
  useEffect(() => {
    const token = localStorage.getItem('accessToken');

    // Fetch providers
    fetch('/api/reports/filters/providers', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setProviders(data.providers || []))
      .catch(console.error);

    // Fetch locations
    fetch('/api/reports/filters/locations', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setLocations(data.locations || []))
      .catch(console.error);

    // Fetch appointment types
    fetch('/api/reports/filters/appointment-types', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setAppointmentTypes(data.appointmentTypes || []))
      .catch(console.error);
  }, []);

  const generateReport = async () => {
    setLoading(true);
    const token = localStorage.getItem('accessToken');

    try {
      const endpoint = `/api/reports/${selectedReport}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(filters),
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const result = await response.json();
      setReportData(result.data || []);
      setSummary(result.summary || result.noShowRate !== undefined ? {
        noShowRate: result.noShowRate,
        totalAppointments: result.totalAppointments,
      } : null);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    const token = localStorage.getItem('accessToken');
    const endpoint = `/api/reports/${selectedReport}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...filters, format: 'csv' }),
      });

      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedReport}_report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV');
    }
  };

  const handleExportPDF = () => {
    let title = '';
    let headers: string[] = [];
    let data: any[][] = [];

    switch (selectedReport) {
      case 'appointments':
        title = 'Appointments Report';
        headers = ['Date', 'Time', 'Patient', 'Provider', 'Location', 'Type', 'Status', 'Duration'];
        data = reportData.map((r) => [
          r.date,
          r.time,
          r.patientName,
          r.providerName,
          r.locationName,
          r.appointmentType,
          r.status,
          `${r.duration} min`,
        ]);
        break;

      case 'financial':
        title = 'Financial Report';
        headers = ['Date', 'Patient', 'Services', 'Charges', 'Payments', 'Balance'];
        data = reportData.map((r) => [
          r.date,
          r.patientName,
          r.services,
          formatCurrency(r.chargesCents),
          formatCurrency(r.paymentsCents),
          formatCurrency(r.balanceCents),
        ]);
        break;

      case 'clinical':
        title = 'Clinical Report';
        headers = ['Date', 'Patient', 'Diagnosis Code', 'Diagnosis', 'Procedure Code', 'Procedure', 'Provider'];
        data = reportData.map((r) => [
          r.date,
          r.patientName,
          r.diagnosisCode,
          r.diagnosisDescription,
          r.procedureCode,
          r.procedureDescription,
          r.providerName,
        ]);
        break;

      case 'patients':
        title = 'Patient List';
        headers = ['Name', 'DOB', 'Age', 'Gender', 'Phone', 'Email', 'Last Visit', 'Status'];
        data = reportData.map((r) => [
          r.name,
          r.dob,
          r.age.toString(),
          r.gender,
          r.phone,
          r.email,
          r.lastVisit || 'Never',
          r.status,
        ]);
        break;

      case 'productivity':
        title = 'Provider Productivity Report';
        headers = ['Provider', 'Patients Seen', 'Appointments', 'Revenue', 'Avg/Patient'];
        data = reportData.map((r) => [
          r.providerName,
          r.patientsSeen.toString(),
          r.appointments.toString(),
          formatCurrency(r.revenueCents),
          formatCurrency(r.avgPerPatientCents),
        ]);
        break;

      case 'no-shows':
        title = 'No-Show Report';
        headers = ['Date', 'Patient', 'Provider', 'Type', 'Reason', 'Status'];
        data = reportData.map((r) => [
          r.date,
          r.patientName,
          r.providerName,
          r.appointmentType,
          r.reason,
          r.status,
        ]);
        break;
    }

    const subtitle = `${filters.startDate} to ${filters.endDate}`;
    const summaryItems: { label: string; value: string }[] = [];

    if (summary && selectedReport === 'financial') {
      summaryItems.push(
        { label: 'Total Charges', value: formatCurrency(summary.totalCharges || 0) },
        { label: 'Total Payments', value: formatCurrency(summary.totalPayments || 0) },
        { label: 'Outstanding', value: formatCurrency(summary.totalOutstanding || 0) }
      );
    } else if (summary && selectedReport === 'no-shows') {
      summaryItems.push(
        { label: 'No-Show Rate', value: `${summary.noShowRate}%` },
        { label: 'Total Appointments', value: summary.totalAppointments.toString() }
      );
    }

    exportToPDF({
      title,
      subtitle,
      headers,
      data,
      filename: `${selectedReport}_report_${new Date().toISOString().split('T')[0]}.pdf`,
      summary: summaryItems.length > 0 ? summaryItems : undefined,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const reportTypes = [
    { id: 'appointments' as ReportType, name: 'Appointments', icon: '' },
    { id: 'financial' as ReportType, name: 'Financial', icon: '' },
    { id: 'clinical' as ReportType, name: 'Clinical', icon: '' },
    { id: 'patients' as ReportType, name: 'Patient List', icon: '' },
    { id: 'productivity' as ReportType, name: 'Provider Productivity', icon: '' },
    { id: 'no-shows' as ReportType, name: 'No-Shows', icon: '' },
  ];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: '#f9fafb' }}>
      {/* Left Sidebar - Report Types */}
      <div style={{ width: '250px', background: 'white', borderRight: '1px solid #e5e7eb', padding: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
          Report Types
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reportTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => {
                setSelectedReport(type.id);
                setReportData([]);
                setSummary(null);
              }}
              style={{
                padding: '12px 16px',
                textAlign: 'left',
                border: 'none',
                borderRadius: '8px',
                background: selectedReport === type.id ? '#3b82f6' : 'transparent',
                color: selectedReport === type.id ? 'white' : '#374151',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: selectedReport === type.id ? '600' : '400',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ marginRight: '8px' }}>{type.icon}</span>
              {type.name}
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel - Report Builder */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', color: '#111827' }}>
            {reportTypes.find((t) => t.id === selectedReport)?.name} Report
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            Generate and export custom reports with filters
          </p>

          {/* Filters Panel */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
              Filters
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {/* Date Range */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>

              {/* Provider Filter */}
              {['appointments', 'financial', 'clinical', 'productivity', 'no-shows'].includes(selectedReport) && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                    Provider
                  </label>
                  <select
                    value={filters.providerId || ''}
                    onChange={(e) => setFilters({ ...filters, providerId: e.target.value || undefined })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">All Providers</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location Filter */}
              {['appointments', 'patients'].includes(selectedReport) && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                    Location
                  </label>
                  <select
                    value={filters.locationId || ''}
                    onChange={(e) => setFilters({ ...filters, locationId: e.target.value || undefined })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">All Locations</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Appointment Type Filter */}
              {selectedReport === 'appointments' && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                    Appointment Type
                  </label>
                  <select
                    value={filters.appointmentTypeId || ''}
                    onChange={(e) => setFilters({ ...filters, appointmentTypeId: e.target.value || undefined })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">All Types</option>
                    {appointmentTypes.map((at) => (
                      <option key={at.id} value={at.id}>{at.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
              {selectedReport === 'appointments' && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                    Status
                  </label>
                  <select
                    value={filters.status || ''}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">All Statuses</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="checked_in">Checked In</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No Show</option>
                  </select>
                </div>
              )}

              {/* Payment Status Filter */}
              {selectedReport === 'financial' && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                    Payment Status
                  </label>
                  <select
                    value={filters.paymentStatus || ''}
                    onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value || undefined })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="accepted">Accepted</option>
                    <option value="paid">Paid</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}

              {/* Clinical Filters */}
              {selectedReport === 'clinical' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                      Diagnosis Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., L70.0"
                      value={filters.diagnosisCode || ''}
                      onChange={(e) => setFilters({ ...filters, diagnosisCode: e.target.value || undefined })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                      Procedure Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., 17000"
                      value={filters.procedureCode || ''}
                      onChange={(e) => setFilters({ ...filters, procedureCode: e.target.value || undefined })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                </>
              )}

              {/* Patient List Filters */}
              {selectedReport === 'patients' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                      Min Age
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={filters.ageMin || ''}
                      onChange={(e) => setFilters({ ...filters, ageMin: e.target.value ? parseInt(e.target.value) : undefined })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                      Max Age
                    </label>
                    <input
                      type="number"
                      placeholder="120"
                      value={filters.ageMax || ''}
                      onChange={(e) => setFilters({ ...filters, ageMax: e.target.value ? parseInt(e.target.value) : undefined })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                      Gender
                    </label>
                    <select
                      value={filters.gender || ''}
                      onChange={(e) => setFilters({ ...filters, gender: e.target.value || undefined })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="">All Genders</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                      Status
                    </label>
                    <select
                      value={filters.active === undefined ? '' : filters.active ? 'active' : 'inactive'}
                      onChange={(e) => setFilters({ ...filters, active: e.target.value === '' ? undefined : e.target.value === 'active' })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Generate Button */}
            <div style={{ marginTop: '20px' }}>
              <button
                onClick={generateReport}
                disabled={loading}
                style={{
                  padding: '10px 24px',
                  background: loading ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          {reportData.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              {/* Header with Export Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                    Results
                  </h3>
                  <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
                    {reportData.length} record{reportData.length !== 1 ? 's' : ''} found
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleExportCSV}
                    style={{
                      padding: '8px 16px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={handleExportPDF}
                    style={{
                      padding: '8px 16px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Export PDF
                  </button>
                  <button
                    onClick={handlePrint}
                    style={{
                      padding: '8px 16px',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Print
                  </button>
                </div>
              </div>

              {/* Summary */}
              {summary && (
                <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                    Summary
                  </h4>
                  {selectedReport === 'financial' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Charges</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                          {formatCurrency(summary.totalCharges || 0)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Payments</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>
                          {formatCurrency(summary.totalPayments || 0)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Outstanding</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444' }}>
                          {formatCurrency(summary.totalOutstanding || 0)}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedReport === 'no-shows' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>No-Show Rate</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444' }}>
                          {summary.noShowRate}%
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Appointments</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                          {summary.totalAppointments}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      {selectedReport === 'appointments' && (
                        <>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Time</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Patient</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Provider</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Location</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Status</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Duration</th>
                        </>
                      )}
                      {selectedReport === 'financial' && (
                        <>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Patient</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Services</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Charges</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Payments</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Balance</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Claim #</th>
                        </>
                      )}
                      {selectedReport === 'clinical' && (
                        <>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Patient</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Dx Code</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Diagnosis</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Proc Code</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Procedure</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Provider</th>
                        </>
                      )}
                      {selectedReport === 'patients' && (
                        <>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Name</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>DOB</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Age</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Gender</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Phone</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Email</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Last Visit</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Status</th>
                        </>
                      )}
                      {selectedReport === 'productivity' && (
                        <>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Provider</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Patients</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Appointments</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Revenue</th>
                          <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Avg/Patient</th>
                        </>
                      )}
                      {selectedReport === 'no-shows' && (
                        <>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Patient</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Provider</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Reason</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Status</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.slice(0, 100).map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        {selectedReport === 'appointments' && (
                          <>
                            <td style={{ padding: '12px' }}>{row.date}</td>
                            <td style={{ padding: '12px' }}>{row.time}</td>
                            <td style={{ padding: '12px' }}>{row.patientName}</td>
                            <td style={{ padding: '12px' }}>{row.providerName}</td>
                            <td style={{ padding: '12px' }}>{row.locationName}</td>
                            <td style={{ padding: '12px' }}>{row.appointmentType}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '500',
                                background: row.status === 'completed' ? '#d1fae5' : row.status === 'cancelled' ? '#fee2e2' : '#dbeafe',
                                color: row.status === 'completed' ? '#065f46' : row.status === 'cancelled' ? '#991b1b' : '#1e40af',
                              }}>
                                {row.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>{row.duration} min</td>
                          </>
                        )}
                        {selectedReport === 'financial' && (
                          <>
                            <td style={{ padding: '12px' }}>{row.date}</td>
                            <td style={{ padding: '12px' }}>{row.patientName}</td>
                            <td style={{ padding: '12px' }}>{row.services}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(row.chargesCents)}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(row.paymentsCents)}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: row.balanceCents > 0 ? '#ef4444' : '#10b981' }}>
                              {formatCurrency(row.balanceCents)}
                            </td>
                            <td style={{ padding: '12px' }}>{row.claimNumber || '-'}</td>
                          </>
                        )}
                        {selectedReport === 'clinical' && (
                          <>
                            <td style={{ padding: '12px' }}>{row.date}</td>
                            <td style={{ padding: '12px' }}>{row.patientName}</td>
                            <td style={{ padding: '12px', fontFamily: 'monospace' }}>{row.diagnosisCode}</td>
                            <td style={{ padding: '12px' }}>{row.diagnosisDescription}</td>
                            <td style={{ padding: '12px', fontFamily: 'monospace' }}>{row.procedureCode}</td>
                            <td style={{ padding: '12px' }}>{row.procedureDescription}</td>
                            <td style={{ padding: '12px' }}>{row.providerName}</td>
                          </>
                        )}
                        {selectedReport === 'patients' && (
                          <>
                            <td style={{ padding: '12px', fontWeight: '500' }}>{row.name}</td>
                            <td style={{ padding: '12px' }}>{formatDate(row.dob)}</td>
                            <td style={{ padding: '12px' }}>{row.age}</td>
                            <td style={{ padding: '12px' }}>{row.gender}</td>
                            <td style={{ padding: '12px' }}>{row.phone}</td>
                            <td style={{ padding: '12px' }}>{row.email}</td>
                            <td style={{ padding: '12px' }}>{row.lastVisit ? formatDate(row.lastVisit) : 'Never'}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '500',
                                background: row.status === 'Active' ? '#d1fae5' : '#fee2e2',
                                color: row.status === 'Active' ? '#065f46' : '#991b1b',
                              }}>
                                {row.status}
                              </span>
                            </td>
                          </>
                        )}
                        {selectedReport === 'productivity' && (
                          <>
                            <td style={{ padding: '12px', fontWeight: '500' }}>{row.providerName}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>{row.patientsSeen}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>{row.appointments}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#10b981' }}>
                              {formatCurrency(row.revenueCents)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(row.avgPerPatientCents)}</td>
                          </>
                        )}
                        {selectedReport === 'no-shows' && (
                          <>
                            <td style={{ padding: '12px' }}>{row.date}</td>
                            <td style={{ padding: '12px' }}>{row.patientName}</td>
                            <td style={{ padding: '12px' }}>{row.providerName}</td>
                            <td style={{ padding: '12px' }}>{row.appointmentType}</td>
                            <td style={{ padding: '12px' }}>{row.reason}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '500',
                                background: row.status === 'no_show' ? '#fee2e2' : '#fef3c7',
                                color: row.status === 'no_show' ? '#991b1b' : '#92400e',
                              }}>
                                {row.status.replace('_', ' ')}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {reportData.length > 100 && (
                <p style={{ marginTop: '16px', fontSize: '14px', color: '#6b7280', textAlign: 'center' }}>
                  Showing first 100 of {reportData.length} records. Export to see all data.
                </p>
              )}
            </div>
          )}

          {/* Empty State */}
          {!loading && reportData.length === 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                No Data Generated
              </h3>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                Configure your filters and click "Generate Report" to view data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
