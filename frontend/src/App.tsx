import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import "./App.css";
import { Toast } from "./components/Toast";
import { ConflictBanner } from "./components/ConflictBanner";
import { Legend } from "./components/Legend";
import {
  fetchAppointmentTypes,
  fetchAppointments,
  fetchAvailability,
  fetchCharges,
  fetchDocuments,
  fetchEncounters,
  fetchLocations,
  fetchMe,
  fetchMessages,
  fetchPatients,
  fetchPhotos,
  fetchProviders,
  fetchTasks,
  fetchAnalytics,
  fetchVitals,
  fetchAudit,
  fetchAppointmentsByDay,
  fetchAppointmentsByProvider,
  fetchRevenueByDay,
  fetchNoteTemplates,
  fetchOrders,
  fetchInteropCapability,
  fetchStatusCounts,
  fetchReportAppointmentsCsv,
  fetchFhirExamples,
  sendErx,
  completePresign,
  getPresignedAccess,
  API_BASE_URL,
  TENANT_HEADER_NAME,
  presignS3,
  updateOrderStatus,
  login,
  createPatient,
  createAppointment,
  createTask,
  createEncounter,
  createMessage,
  createCharge,
  createDocument,
  createPhoto,
  updateAppointmentStatus,
  updateEncounterStatus,
  rescheduleAppointment,
  uploadDocumentFile,
  uploadPhotoFile,
  updateVitals,
  updateEncounterFields,
  createOrder,
} from "./api";

type Session = {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  user: {
    email: string;
    role: string;
    fullName: string;
  };
} | null;

function App() {
  const [tenantId, setTenantId] = useState("tenant-demo");
  const [email, setEmail] = useState("admin@demo.practice");
  const [password, setPassword] = useState("Password123!");
  const [session, setSession] = useState<Session>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [vitals, setVitals] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [appointmentsByDay, setAppointmentsByDay] = useState<any[]>([]);
  const [appointmentsByProvider, setAppointmentsByProvider] = useState<any[]>([]);
  const [noteTemplates, setNoteTemplates] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [interop, setInterop] = useState<any | null>(null);
  const [statusCounts, setStatusCounts] = useState<any[]>([]);
  const [revenueByDay, setRevenueByDay] = useState<any[]>([]);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<{ provider: string; time: string; count: number; patients: string[] }[]>([]);
  const [fhirExamples, setFhirExamples] = useState<any | null>(null);
  const [analyticsView, setAnalyticsView] = useState<string>(() => localStorage.getItem("analytics:view") || "volume");
  const [analyticsFilter, setAnalyticsFilter] = useState<{ startDate: string; endDate: string; providerId: string }>({
    startDate: localStorage.getItem("analytics:start") || "",
    endDate: localStorage.getItem("analytics:end") || "",
    providerId: localStorage.getItem("analytics:provider") || "all",
  });
  const [slotDuration, setSlotDuration] = useState<number>(() => {
    const stored = Number(localStorage.getItem("sched:duration") || 30);
    return Number.isNaN(stored) ? 30 : stored;
  });
  const [loading, setLoading] = useState(false);
  const [dayOffset, setDayOffset] = useState(() => {
    const stored = Number(localStorage.getItem("sched:dayOffset") || 0);
    return Number.isNaN(stored) ? 0 : stored;
  });
  const [providerFilter, setProviderFilter] = useState<string>(() => localStorage.getItem("sched:provider") || "all");
  const [typeFilter, setTypeFilter] = useState<string>(() => localStorage.getItem("sched:type") || "all");
  const [weekViewStart, setWeekViewStart] = useState(() => {
    const stored = localStorage.getItem("sched:weekStart");
    const parsed = stored ? new Date(stored) : new Date();
    const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [monthStart, setMonthStart] = useState(() => {
    const stored = localStorage.getItem("sched:monthStart");
    const parsed = stored ? new Date(stored) : new Date();
    const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [noteEditor, setNoteEditor] = useState<any>({ encounterId: "", chiefComplaint: "", hpi: "", ros: "", exam: "", assessmentPlan: "" });
  const [vitalsForm, setVitalsForm] = useState<any>({ encounterId: "", heightCm: "", weightKg: "", bpSystolic: "", bpDiastolic: "", pulse: "", tempC: "" });
  const [formState, setFormState] = useState<any>({
    patient: { firstName: "", lastName: "", email: "", phone: "" },
    appointment: { patientId: "", providerId: "", locationId: "", appointmentTypeId: "", start: "", end: "" },
    task: { title: "", dueAt: "" },
    encounter: { patientId: "", providerId: "", chiefComplaint: "" },
    message: { patientId: "", subject: "", body: "" },
    charge: { encounterId: "", cptCode: "99213", icd: "L30.9", amount: 15000 },
    document: { patientId: "", title: "", url: "", file: null },
    photo: { patientId: "", bodyLocation: "", url: "", file: null },
    order: { encounterId: "", patientId: "", providerId: "", type: "", details: "", medication: "", sig: "", pharmacy: "" },
  });
  const usePresign = import.meta.env.VITE_USE_PRESIGN === "true";

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Signing in...");
    setError(null);
    setMe(null);
    try {
      const resp = await login(tenantId, email, password);
      setSession({
        tenantId: resp.tenantId,
        accessToken: resp.tokens.accessToken,
        refreshToken: resp.tokens.refreshToken,
        user: {
          email: resp.user.email,
          role: resp.user.role,
          fullName: resp.user.fullName,
        },
      });
      setStatus("Signed in");
    } catch (err: any) {
      setError(err.message);
      setStatus(null);
    }
  };

  const handleFetchMe = async () => {
    if (!session) return;
    setStatus("Fetching profile...");
    setError(null);
    try {
      const data = await fetchMe(session.tenantId, session.accessToken);
      setMe(data.user);
      setStatus("Profile loaded");
    } catch (err: any) {
      setError(err.message);
      setStatus(null);
    }
  };

  const handleLoadData = async () => {
    if (!session) return;
    setStatus("Loading data...");
    setError(null);
    setLoading(true);
    try {
      const [
        pRes,
        aRes,
        eRes,
        tRes,
        mRes,
        prRes,
        locRes,
        atRes,
        avRes,
        chRes,
        dRes,
        phRes,
        anRes,
        vRes,
        auditRes,
        anDayRes,
        anProvRes,
        noteTplRes,
        orderRes,
        interopRes,
        statusCountRes,
        revenueDayRes,
        fhirExampleRes,
      ] = await Promise.all([
        fetchPatients(session.tenantId, session.accessToken),
        fetchAppointments(session.tenantId, session.accessToken),
        fetchEncounters(session.tenantId, session.accessToken),
        fetchTasks(session.tenantId, session.accessToken),
        fetchMessages(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
        fetchLocations(session.tenantId, session.accessToken),
        fetchAppointmentTypes(session.tenantId, session.accessToken),
        fetchAvailability(session.tenantId, session.accessToken),
        fetchCharges(session.tenantId, session.accessToken),
        fetchDocuments(session.tenantId, session.accessToken),
        fetchPhotos(session.tenantId, session.accessToken),
        fetchAnalytics(session.tenantId, session.accessToken),
        fetchVitals(session.tenantId, session.accessToken),
        fetchAudit(session.tenantId, session.accessToken),
        fetchAppointmentsByDay(session.tenantId, session.accessToken, analyticsFilter),
        fetchAppointmentsByProvider(session.tenantId, session.accessToken, analyticsFilter),
        fetchNoteTemplates(session.tenantId, session.accessToken),
        fetchOrders(session.tenantId, session.accessToken),
        fetchInteropCapability(session.tenantId, session.accessToken),
        fetchStatusCounts(session.tenantId, session.accessToken, analyticsFilter),
        fetchRevenueByDay(session.tenantId, session.accessToken, analyticsFilter),
        fetchFhirExamples(session.tenantId, session.accessToken),
      ]);
      setPatients(pRes.patients || []);
      setAppointments(aRes.appointments || []);
      setEncounters(eRes.encounters || []);
      setTasks(tRes.tasks || []);
      setMessages(mRes.messages || []);
      setProviders(prRes.providers || []);
      setLocations(locRes.locations || []);
      setAppointmentTypes(atRes.appointmentTypes || []);
      setAvailability(avRes.availability || []);
      setCharges(chRes.charges || []);
      setDocuments(dRes.documents || []);
      setPhotos(phRes.photos || []);
      setAnalytics(anRes.counts || null);
      setVitals(vRes.vitals || []);
      setAuditLog(auditRes.audit || []);
      setAppointmentsByDay(anDayRes.points || []);
      setAppointmentsByProvider(anProvRes.points || []);
      setNoteTemplates(noteTplRes.templates || []);
      setOrders(orderRes.orders || []);
      setInterop(interopRes || null);
      setStatusCounts(statusCountRes.points || []);
      setRevenueByDay(revenueDayRes.points || []);
      setFhirExamples(fhirExampleRes || null);
      setStatus("Data loaded");
    } catch (err: any) {
      setError(err.message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const openFileSecurely = async (file: { url: string; storage?: string; objectKey?: string }) => {
    if (!session) return;
    try {
      if (file.storage === "local" && file.url?.startsWith("/uploads")) {
        const signRes = await fetch(`${API_BASE_URL}/api/uploads/sign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
            [TENANT_HEADER_NAME]: session.tenantId,
          } as any,
          body: JSON.stringify({ key: file.objectKey || file.url.split("/").pop() }),
        });
        if (!signRes.ok) throw new Error("Unable to sign file url");
        const signed = await signRes.json();
        window.open(`${API_BASE_URL}${signed.url}`, "_blank", "noreferrer");
        setStatus("File opened");
        return;
      }
      if (file.storage === "s3" && file.objectKey) {
        const signed = await getPresignedAccess(session.tenantId, session.accessToken, file.objectKey);
        window.open(signed.url, "_blank", "noreferrer");
        setStatus("File opened");
        return;
      }
      window.open(file.url, "_blank", "noreferrer");
    } catch (e: any) {
      setError(e.message || "Unable to open file");
    }
  };

  useEffect(() => {
    if (session) {
      handleLoadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "r" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleLoadData();
      }
      if (e.key === "b" && session) {
        e.preventDefault();
        setDayOffset(0);
        setWeekViewStart(() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [session]);

  useEffect(() => {
    localStorage.setItem("sched:provider", providerFilter);
    localStorage.setItem("sched:type", typeFilter);
    localStorage.setItem("sched:dayOffset", String(dayOffset));
    localStorage.setItem("sched:weekStart", weekViewStart.toISOString());
    localStorage.setItem("sched:monthStart", monthStart.toISOString());
    localStorage.setItem("sched:duration", String(slotDuration || 30));
  }, [providerFilter, typeFilter, dayOffset, weekViewStart, monthStart, slotDuration]);

  useEffect(() => {
    localStorage.setItem("analytics:view", analyticsView);
    localStorage.setItem("analytics:start", analyticsFilter.startDate);
    localStorage.setItem("analytics:end", analyticsFilter.endDate);
    localStorage.setItem("analytics:provider", analyticsFilter.providerId);
  }, [analyticsView, analyticsFilter.startDate, analyticsFilter.endDate, analyticsFilter.providerId]);

  useEffect(() => {
    const grouped = new Map<string, any[]>();
    appointments.forEach((appt) => {
      const list = grouped.get(appt.providerId) || [];
      list.push(appt);
      grouped.set(appt.providerId, list);
    });
    const conflictMap = new Map<string, { provider: string; time: string; count: number; patients: Set<string> }>();
    grouped.forEach((list) => {
      const sorted = list.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const start = new Date(current.scheduledStart).getTime();
        const end = new Date(current.scheduledEnd).getTime();
        const nextStart = new Date(next.scheduledStart).getTime();
        if (start < nextStart && end > nextStart) {
          const providerName = current.providerName || next.providerName || "Provider";
          const startLabel = new Date(current.scheduledStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const key = `${providerName}-${startLabel}`;
          const existing = conflictMap.get(key) || {
            provider: providerName,
            time: startLabel,
            count: 0,
            patients: new Set<string>(),
          };
          existing.count += 1;
          if (current.patientName) existing.patients.add(current.patientName);
          if (next.patientName) existing.patients.add(next.patientName);
          conflictMap.set(key, existing);
        }
      }
    });
    const conflicts = Array.from(conflictMap.values()).map((c) => ({
      provider: c.provider,
      time: c.time,
      count: c.count,
      patients: Array.from(c.patients),
    }));
    setOverlaps(conflicts);
  }, [appointments]);

  const bind = (section: string, field: string) => ({
    value: formState[section][field] || "",
    onChange: (e: any) =>
      setFormState((s: any) => ({
        ...s,
        [section]: { ...s[section], [field]: e.target.value },
      })),
  });

  const requireFields = (fields: { label: string; value: any }[]) => {
    const missing = fields.filter((f) => !f.value);
    if (missing.length) {
      setError(`Missing: ${missing.map((m) => m.label).join(", ")}`);
      setStatus(null);
      return false;
    }
    return true;
  };

  const createAndReload = async (fn: () => Promise<any>) => {
    setStatus("Saving...");
    setError(null);
    try {
      await fn();
      await handleLoadData();
      setStatus("Saved");
    } catch (err: any) {
      setError(err.message);
      setStatus(null);
    }
  };

  // If not logged in, show ONLY the login page
  if (!session) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e1147 0%, #3d2785 50%, #2d1b69 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '420px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          padding: '2.5rem',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
            <h1 style={{ margin: '0 0 0.5rem 0', color: '#1e1147', fontSize: '1.5rem', fontWeight: 700 }}>
              Mountain Pine Dermatology
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9375rem' }}>
              Sign in to access your practice dashboard
            </p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <label style={{ color: '#374151', fontSize: '0.875rem', fontWeight: 600 }}>
              Practice ID
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                placeholder="tenant-demo"
                style={{ marginTop: '0.375rem', padding: '0.75rem 1rem', fontSize: '1rem' }}
              />
            </label>
            <label style={{ color: '#374151', fontSize: '0.875rem', fontWeight: 600 }}>
              Email Address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="admin@demo.practice"
                style={{ marginTop: '0.375rem', padding: '0.75rem 1rem', fontSize: '1rem' }}
              />
            </label>
            <label style={{ color: '#374151', fontSize: '0.875rem', fontWeight: 600 }}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••••"
                style={{ marginTop: '0.375rem', padding: '0.75rem 1rem', fontSize: '1rem' }}
              />
            </label>
            <button type="submit" style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
              Sign In
            </button>
          </form>
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
              Demo Credentials
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.8125rem', margin: 0 }}>
              <strong>admin@demo.practice</strong> / <strong>Password123!</strong>
            </p>
          </div>
          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500
            }}>
              {error}
            </div>
          )}
        </div>
        <p style={{ marginTop: '2rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
          © 2025 DermEHR • Version 1.0.0
        </p>
      </div>
    );
  }

  // Logged in - show full app
  return (
    <div className="page">
      <div className="layout">
        <div className="topbar">
          <div className="brand">Mountain Pine Dermatology PLLC</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, justifyContent: 'center', maxWidth: '500px', margin: '0 2rem' }}>
            <select
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'white',
                fontSize: '0.875rem',
                color: '#374151'
              }}
              defaultValue=""
            >
              <option value="" disabled>Patient Search...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer'
              }}
              onClick={handleLoadData}
            >
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: 600 }}>
              {session.user.fullName}
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}>
              {session.user.role}
            </span>
            <button
              type="button"
              onClick={handleFetchMe}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem'
              }}
            >
              Help • Feedback • Preferences • Logout
            </button>
          </div>
        </div>

        <div className="nav">
          <span>Home</span>
          <span>OfficeFlow</span>
          <span className="active">Schedule</span>
          <span>Appt Flow</span>
          <span>Tasks</span>
          <span>Patients</span>
          <span>Rx</span>
          <span>Mail</span>
          <span>Document Mgmt</span>
          <span>Orders</span>
          <span>Path / Labs</span>
          <span>Radiology / Other</span>
          <span>Reminders</span>
          <span>Analytics</span>
          <span>Telehealth</span>
          <span>Inventory</span>
          <span>Financials</span>
          <span>Quotes</span>
        </div>

        <div className="subnav">
          <span>Recalls</span>
        </div>

        <div className="content-card">
          <div className="section-title-bar">Today's Overview</div>
              <div style={{ display: 'flex', gap: '1rem', padding: '1rem', flexWrap: 'wrap' }}>
                <div className="stat-card-teal">
                  <div className="stat-number">{appointments.filter(a => a.status === 'scheduled').length}</div>
                  <div className="stat-label">Scheduled<br/>Appointments</div>
                </div>
                <div className="stat-card-teal">
                  <div className="stat-number">{appointments.filter(a => a.status === 'checked_in').length}</div>
                  <div className="stat-label">Checked In<br/>Patients</div>
                </div>
                <div className="stat-card-teal">
                  <div className="stat-number">{appointments.filter(a => a.status === 'completed').length}</div>
                  <div className="stat-label">Completed<br/>Visits</div>
                </div>
                <div className="stat-card-teal">
                  <div className="stat-number">{patients.length}</div>
                  <div className="stat-label">Total<br/>Patients</div>
                </div>
              </div>

          <div className="sticky-header">
            <div className="day-nav">
              <button type="button" className="ghost" onClick={() => setDayOffset((d) => d - 1)}>
                ◀ Prev Day
              </button>
              <button type="button" className="ghost" onClick={() => setDayOffset(0)}>
                Today
              </button>
              <button type="button" className="ghost" onClick={() => setDayOffset((d) => d + 1)}>
                Next Day ▶
              </button>
              <button type="button" className="ghost" onClick={handleLoadData}>
                Reload (⌘/Ctrl+R)
              </button>
            </div>
          </div>

          <div className="quick-actions">
            <Legend />
            <details>
              <summary className="ghost">+ New Patient</summary>
              <div className="sheet">
                <label>
                  First
                  <input {...bind("patient", "firstName")} />
                </label>
                <label>
                  Last
                  <input {...bind("patient", "lastName")} />
                </label>
                <label>
                  Email
                  <input {...bind("patient", "email")} />
                </label>
                <label>
                  Phone
                  <input {...bind("patient", "phone")} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !requireFields([
                        { label: "First", value: formState.patient.firstName },
                        { label: "Last", value: formState.patient.lastName },
                      ])
                    )
                      return;
                    createAndReload(() =>
                      createPatient(session!.tenantId, session!.accessToken, {
                        firstName: formState.patient.firstName,
                        lastName: formState.patient.lastName,
                        email: formState.patient.email || undefined,
                        phone: formState.patient.phone || undefined,
                      }),
                    );
                  }}
                >
                  Save patient
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Schedule</summary>
              <div className="sheet">
                <label>
                  Patient
                  <select {...bind("appointment", "patientId")}>
                    <option value="">Select</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Provider
                  <select {...bind("appointment", "providerId")}>
                    <option value="">Select</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Location
                  <select {...bind("appointment", "locationId")}>
                    <option value="">Select</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select {...bind("appointment", "appointmentTypeId")}>
                    <option value="">Select</option>
                    {appointmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start
                  <input type="datetime-local" {...bind("appointment", "start")} />
                </label>
                <label>
                  End
                  <input type="datetime-local" {...bind("appointment", "end")} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !requireFields([
                        { label: "Patient", value: formState.appointment.patientId },
                        { label: "Provider", value: formState.appointment.providerId },
                        { label: "Location", value: formState.appointment.locationId },
                        { label: "Type", value: formState.appointment.appointmentTypeId },
                        { label: "Start", value: formState.appointment.start },
                        { label: "End", value: formState.appointment.end },
                      ])
                    )
                      return;
                    createAndReload(() =>
                      createAppointment(session!.tenantId, session!.accessToken, {
                        patientId: formState.appointment.patientId,
                        providerId: formState.appointment.providerId,
                        locationId: formState.appointment.locationId,
                        appointmentTypeId: formState.appointment.appointmentTypeId,
                        scheduledStart: formState.appointment.start,
                        scheduledEnd: formState.appointment.end,
                      }),
                    );
                  }}
                >
                  Save appointment
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Encounter</summary>
              <div className="sheet">
                <label>
                  Patient
                  <select {...bind("encounter", "patientId")}>
                    <option value="">Select</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Provider
                  <select {...bind("encounter", "providerId")}>
                    <option value="">Select</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Chief Complaint
                  <input {...bind("encounter", "chiefComplaint")} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !requireFields([
                        { label: "Patient", value: formState.encounter.patientId },
                        { label: "Provider", value: formState.encounter.providerId },
                      ])
                    )
                      return;
                    createAndReload(() =>
                      createEncounter(session!.tenantId, session!.accessToken, {
                        patientId: formState.encounter.patientId,
                        providerId: formState.encounter.providerId,
                        chiefComplaint: formState.encounter.chiefComplaint,
                      }),
                    );
                  }}
                >
                  Save encounter
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Task</summary>
              <div className="sheet">
                <label>
                  Title
                  <input {...bind("task", "title")} />
                </label>
                <label>
                  Due
                  <input type="datetime-local" {...bind("task", "dueAt")} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!requireFields([{ label: "Title", value: formState.task.title }])) return;
                    createAndReload(() =>
                      createTask(session!.tenantId, session!.accessToken, {
                        title: formState.task.title,
                        dueAt: formState.task.dueAt || undefined,
                      }),
                    );
                  }}
                >
                  Save task
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Message</summary>
              <div className="sheet">
                <label>
                  Patient
                  <select {...bind("message", "patientId")}>
                    <option value="">Select</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Subject
                  <input {...bind("message", "subject")} />
                </label>
                <label>
                  Body
                  <input {...bind("message", "body")} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !requireFields([
                        { label: "Patient", value: formState.message.patientId },
                        { label: "Subject", value: formState.message.subject },
                        { label: "Body", value: formState.message.body },
                      ])
                    )
                      return;
                    createAndReload(() =>
                      createMessage(session!.tenantId, session!.accessToken, {
                        patientId: formState.message.patientId || undefined,
                        subject: formState.message.subject,
                        body: formState.message.body,
                      }),
                    );
                  }}
                >
                  Send
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Charge</summary>
              <div className="sheet">
                <label>
                  Encounter
                  <select {...bind("charge", "encounterId")}>
                    <option value="">Select</option>
                    {encounters.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  CPT
                  <input {...bind("charge", "cptCode")} />
                </label>
                <label>
                  ICD
                  <input {...bind("charge", "icd")} />
                </label>
                <label>
                  Amount (cents)
                  <input type="number" {...bind("charge", "amount")} />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    createAndReload(() =>
                      createCharge(session!.tenantId, session!.accessToken, {
                        encounterId: formState.charge.encounterId || undefined,
                        cptCode: formState.charge.cptCode,
                        icdCodes: formState.charge.icd ? formState.charge.icd.split(",").map((s: string) => s.trim()) : [],
                        amountCents: Number(formState.charge.amount || 0),
                      }),
                    )
                  }
                >
                  Save charge
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Document</summary>
              <div className="sheet">
                <label>
                  Patient
                  <select {...bind("document", "patientId")}>
                    <option value="">Select</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Title
                  <input {...bind("document", "title")} />
                </label>
                <label>
                  File
                  <input
                    type="file"
                    onChange={(e) =>
                      setFormState((s: any) => ({
                        ...s,
                        document: { ...s.document, file: e.target.files?.[0] || null },
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    createAndReload(async () => {
                      if (
                        !requireFields([
                          { label: "Patient", value: formState.document.patientId },
                          { label: "Title", value: formState.document.title },
                          { label: "File or URL", value: formState.document.file || formState.document.url },
                        ])
                      )
                        return Promise.reject(new Error("Missing document fields"));
                      let stored: { url: string; storage?: string; objectKey?: string } | null = null;
                      if (formState.document.file) {
                        if (usePresign) {
                          try {
                            const presigned = await presignS3(
                              session!.tenantId,
                              session!.accessToken,
                              formState.document.file.name,
                              formState.document.file.type,
                            );
                            await fetch(presigned.url, {
                              method: "PUT",
                              headers: { "Content-Type": formState.document.file.type },
                              body: formState.document.file,
                            });
                            stored = await completePresign(session!.tenantId, session!.accessToken, presigned.key);
                          } catch (e: any) {
                            setStatus("Presign unavailable, using direct upload");
                            stored = await uploadDocumentFile(session!.tenantId, session!.accessToken, formState.document.file);
                          }
                        } else {
                          stored = await uploadDocumentFile(session!.tenantId, session!.accessToken, formState.document.file);
                        }
                      }
                      return createDocument(session!.tenantId, session!.accessToken, {
                        patientId: formState.document.patientId,
                        title: formState.document.title,
                        url: stored?.url || formState.document.url,
                        storage: stored?.storage,
                        objectKey: stored?.objectKey,
                      });
                    })
                  }
                >
                  Save document
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Photo</summary>
              <div className="sheet">
                <label>
                  Patient
                  <select {...bind("photo", "patientId")}>
                    <option value="">Select</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Body location
                  <input {...bind("photo", "bodyLocation")} />
                </label>
                <label>
                  File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setFormState((s: any) => ({
                        ...s,
                        photo: { ...s.photo, file: e.target.files?.[0] || null },
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    createAndReload(async () => {
                      if (
                        !requireFields([
                          { label: "Patient", value: formState.photo.patientId },
                          { label: "File or URL", value: formState.photo.file || formState.photo.url },
                        ])
                      )
                        return Promise.reject(new Error("Missing photo fields"));
                      let stored: { url: string; storage?: string; objectKey?: string } | null = null;
                      if (formState.photo.file) {
                        if (usePresign) {
                          try {
                            const presigned = await presignS3(
                              session!.tenantId,
                              session!.accessToken,
                              formState.photo.file.name,
                              formState.photo.file.type,
                            );
                            await fetch(presigned.url, {
                              method: "PUT",
                              headers: { "Content-Type": formState.photo.file.type },
                              body: formState.photo.file,
                            });
                            stored = await completePresign(session!.tenantId, session!.accessToken, presigned.key);
                          } catch (e: any) {
                            setStatus("Presign unavailable, using direct upload");
                            stored = await uploadPhotoFile(session!.tenantId, session!.accessToken, formState.photo.file);
                          }
                        } else {
                          stored = await uploadPhotoFile(session!.tenantId, session!.accessToken, formState.photo.file);
                        }
                      }
                      return createPhoto(session!.tenantId, session!.accessToken, {
                        patientId: formState.photo.patientId,
                        bodyLocation: formState.photo.bodyLocation,
                        url: stored?.url || formState.photo.url,
                        storage: stored?.storage,
                        objectKey: stored?.objectKey,
                      });
                    })
                  }
                >
                  Save photo
                </button>
              </div>
            </details>

            <details>
              <summary className="ghost">+ Order</summary>
              <div className="sheet">
                <label>
                  Encounter
                  <select {...bind("order", "encounterId")}>
                    <option value="">Select</option>
                    {encounters.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Patient
                  <select {...bind("order", "patientId")}>
                    <option value="">Select</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Provider
                  <select {...bind("order", "providerId")}>
                    <option value="">Select</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <input {...bind("order", "type")} placeholder="Lab, Imaging, etc." />
                </label>
                <label>
                  Medication
                  <input {...bind("order", "medication")} placeholder="Medication name" />
                </label>
                <label>
                  Sig
                  <input {...bind("order", "sig")} placeholder="1 tab PO BID" />
                </label>
                <label>
                  Pharmacy
                  <input {...bind("order", "pharmacy")} placeholder="Pharmacy name" />
                </label>
                <label>
                  Details
                  <input {...bind("order", "details")} placeholder="Extra instructions" />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !requireFields([
                        { label: "Patient", value: formState.order.patientId },
                        { label: "Provider", value: formState.order.providerId },
                        { label: "Type/Medication", value: formState.order.type || formState.order.medication },
                      ])
                    )
                      return;
                    const detailText =
                      formState.order.details ||
                      [formState.order.medication, formState.order.sig, formState.order.pharmacy].filter(Boolean).join(" · ");
                    createAndReload(() =>
                      createOrder(session!.tenantId, session!.accessToken, {
                        encounterId: formState.order.encounterId || undefined,
                        patientId: formState.order.patientId,
                        providerId: formState.order.providerId,
                        type: formState.order.type || formState.order.medication,
                        details: detailText || undefined,
                      }),
                    );
                  }}
                >
                  Save order
                </button>
              </div>
            </details>
          </div>

          <div className="grid">
            <div className="panel">
              <p className="panel-title">Schedule</p>
              <div className="list">
                {loading && appointments.length === 0 && (
                  <>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="list-row skeleton" style={{ height: 60 }} />
                    ))}
                  </>
                )}
                {!loading &&
                  appointments.map((a) => (
                    <div key={a.id} className="list-row">
                      <div>
                        <p className="strong">{a.appointmentTypeName}</p>
                        <p className="muted">
                          {new Date(a.scheduledStart).toLocaleString()} → {new Date(a.scheduledEnd).toLocaleString()}
                        </p>
                        <p className="muted">
                          {a.patientName} · {a.providerName} · {a.locationName}
                        </p>
                      </div>
                      <div className="status">
                        <span className="pill subtle">{a.status}</span>
                        <select
                          onChange={(e) =>
                            updateAppointmentStatus(session!.tenantId, session!.accessToken, a.id, e.target.value).then(handleLoadData)
                          }
                          defaultValue=""
                        >
                          <option value="">Set status</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="checked-in">Checked-in</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Schedule Grid</p>
              <div className="filters">
                <label>
                  Provider
                  <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
                    <option value="all">All</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="all">All</option>
                    {appointmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Slot minutes
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value) || 30)}
                  />
                </label>
              </div>
              {overlaps.length > 0 && (
                <div className="conflict-strip">
                  {overlaps.slice(0, 4).map((c, idx) => (
                    <span className="pill warn tiny" key={idx}>
                      {c.provider} overlap @ {c.time}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid schedule-grid">
                {[dayOffset, dayOffset + 1, dayOffset + 2].map((offset) => {
                  const date = new Date();
                  date.setDate(date.getDate() + offset);
                  const dayIdx = date.getDay();
                  const dayLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                  return (
                    <div key={offset} className="panel schedule-col">
                      <p className="strong">{dayLabel}</p>
                      <div className="slots">
                        {providers
                          .filter((pr) => providerFilter === "all" || pr.id === providerFilter)
                          .map((pr) => (
                            <div key={pr.id} className="slot-block">
                              <p className="muted">{pr.fullName}</p>
                              {Array.from({ length: 10 }).map((_, idx) => {
                                const hour = 8 + idx;
                                const slotDate = new Date(date);
                                slotDate.setHours(hour, 0, 0, 0);
                                const dayMatches = appointments
                                  .filter((a) => {
                                    const d = new Date(a.scheduledStart);
                                    const typeOk = typeFilter === "all" || a.appointmentTypeId === typeFilter;
                                    return (
                                      a.providerName === pr.fullName &&
                                      d.getHours() === hour &&
                                      d.getDate() === slotDate.getDate() &&
                                      typeOk
                                    );
                                  })
                                  .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
                                const match = dayMatches[0];
                                const conflictCount = dayMatches.length;
                                const avail = availability.find((av) => av.providerId === pr.id && av.dayOfWeek === dayIdx);
                                const inAvail = avail ? hour >= Number(avail.startTime?.split(":")[0]) && hour < Number(avail.endTime?.split(":")[0]) : false;
                                return (
                                  <div
                                    key={hour}
                                    className={`slot ${inAvail ? "avail" : "off"} ${match ? "booked" : ""} ${
                                      conflictCount > 1 ? "conflict" : ""
                                    }`}
                                    onClick={async () => {
                                      if (!session) return;
                                      if (match && match.appointmentTypeId) {
                                        const type = appointmentTypes.find((t) => t.id === match.appointmentTypeId);
                                        const dur = slotDuration || type?.durationMinutes || 30;
                                        const start = new Date(slotDate);
                                        const end = new Date(start.getTime() + dur * 60000);
                                        try {
                                          await rescheduleAppointment(session.tenantId, session.accessToken, match.id, start.toISOString(), end.toISOString());
                                          await handleLoadData();
                                          setStatus("Rescheduled");
                                          setConflictMsg(null);
                                        } catch (e: any) {
                                          setConflictMsg(e.message);
                                        }
                                      } else if (patients[0] && (providerFilter !== "all" || providers.length) && availability.length) {
                                        const type = appointmentTypes[0];
                                        const dur = slotDuration || type?.durationMinutes || 30;
                                        const start = new Date(slotDate);
                                        const end = new Date(start.getTime() + dur * 60000);
                                        try {
                                          await createAppointment(session.tenantId, session.accessToken, {
                                            patientId: patients[0].id,
                                            providerId: providerFilter === "all" ? providers[0]?.id : providerFilter,
                                            locationId: locations[0]?.id,
                                            appointmentTypeId: type?.id,
                                            scheduledStart: start.toISOString(),
                                            scheduledEnd: end.toISOString(),
                                          });
                                          await handleLoadData();
                                          setStatus("Booked");
                                          setConflictMsg(null);
                                        } catch (e: any) {
                                          setConflictMsg(e.message);
                                        }
                                      }
                                    }}
                                  >
                                    <span className="muted">{hour}:00</span>
                                    {match && (
                                      <span className="strong">
                                        {match.patientName} ({match.appointmentTypeName}
                                        {conflictCount > 1 ? ` +${conflictCount - 1}` : ""})
                                      </span>
                                    )}
                                    {conflictCount > 1 && <span className="pill warn tiny">{conflictCount} overlapping</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Week View</p>
              <div className="filters">
                <button className="ghost" type="button" onClick={() => setWeekViewStart((d) => new Date(d.getTime() - 7 * 86400000))}>
                  ◀ Prev Week
                </button>
                <button className="ghost" type="button" onClick={() => setWeekViewStart(() => {
                  const d = new Date();
                  d.setHours(0,0,0,0);
                  return d;
                })}>
                  This Week
                </button>
                <button className="ghost" type="button" onClick={() => setWeekViewStart((d) => new Date(d.getTime() + 7 * 86400000))}>
                  Next Week ▶
                </button>
              </div>
              <div className="grid schedule-grid">
                {Array.from({ length: 7 }).map((_, idx) => {
                  const date = new Date(weekViewStart);
                  date.setDate(date.getDate() + idx);
                  const dayIdx = date.getDay();
                  const dayLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                  return (
                    <div key={idx} className="panel schedule-col">
                      <p className="strong">{dayLabel}</p>
                      <div className="slots">
                        {providers
                          .filter((pr) => providerFilter === "all" || pr.id === providerFilter)
                          .map((pr) => (
                            <div key={pr.id} className="slot-block">
                              <p className="muted">{pr.fullName}</p>
                              {Array.from({ length: 10 }).map((_, hIdx) => {
                                const hour = 8 + hIdx;
                                const slotDate = new Date(date);
                                slotDate.setHours(hour, 0, 0, 0);
                                const dayMatches = appointments.filter((a) => {
                                  const d = new Date(a.scheduledStart);
                                  const typeOk = typeFilter === "all" || a.appointmentTypeId === typeFilter;
                                  return a.providerName === pr.fullName && d.getHours() === hour && d.getDate() === slotDate.getDate() && typeOk;
                                });
                                const match = dayMatches[0];
                                const conflictCount = dayMatches.length;
                                const avail = availability.find((av) => av.providerId === pr.id && av.dayOfWeek === dayIdx);
                                const inAvail = avail ? hour >= Number(avail.startTime?.split(":")[0]) && hour < Number(avail.endTime?.split(":")[0]) : false;
                                return (
                                  <div
                                    key={hour}
                                    className={`slot ${inAvail ? "avail" : "off"} ${match ? "booked" : ""} ${conflictCount > 1 ? "conflict" : ""}`}
                                    draggable={!!match}
                                    onDragStart={(e) => e.dataTransfer.setData("text/plain", match ? match.id : "")}
                                    onDragOver={(e) => {
                                      if (match) return;
                                      e.preventDefault();
                                    }}
                                    onDrop={(e) => {
                                      const id = e.dataTransfer.getData("text/plain");
                                      if (!id || !session) return;
                                      const targetAppt = appointments.find((a) => a.id === id);
                                      const dur =
                                        slotDuration ||
                                        appointmentTypes.find((t) => t.id === targetAppt?.appointmentTypeId)?.durationMinutes ||
                                        30;
                                      const start = new Date(slotDate);
                                      const end = new Date(start.getTime() + dur * 60000);
                                      createAndReload(() => rescheduleAppointment(session.tenantId, session.accessToken, id, start.toISOString(), end.toISOString()));
                                    }}
                                    onClick={() => {
                                      if (!session) return;
                                      if (match && match.appointmentTypeId) {
                                        const type = appointmentTypes.find((t) => t.id === match.appointmentTypeId);
                                        const dur = slotDuration || type?.durationMinutes || 30;
                                        const start = new Date(slotDate);
                                        const end = new Date(start.getTime() + dur * 60000);
                                        createAndReload(() =>
                                          rescheduleAppointment(session.tenantId, session.accessToken, match.id, start.toISOString(), end.toISOString()),
                                        );
                                      }
                                    }}
                                  >
                                    <span className="muted">{hour}:00</span>
                                    {match && (
                                      <span className="strong">
                                        {match.patientName} ({match.appointmentTypeName})
                                      </span>
                                    )}
                                    {conflictCount > 1 && <span className="pill warn tiny">{conflictCount} overlapping</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Conflict Drilldown</p>
              {overlaps.length === 0 && <p className="muted">No overlapping appointments detected.</p>}
              {overlaps.length > 0 && (
                <div className="list">
                  {overlaps.map((c, idx) => (
                    <div key={`${c.provider}-${c.time}-${idx}`} className="list-row">
                      <div>
                        <p className="strong">
                          {c.provider} · {c.time}
                        </p>
                        <p className="muted">{c.patients.join(", ")}</p>
                      </div>
                      <span className="pill warn tiny">{c.count} overlapping</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <p className="panel-title">Month View</p>
              <div className="filters">
                <button
                  className="ghost"
                  type="button"
                  onClick={() =>
                    setMonthStart((d) => {
                      const nd = new Date(d);
                      nd.setMonth(nd.getMonth() - 1);
                      return nd;
                    })
                  }
                >
                  ◀ Prev Month
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() =>
                    setMonthStart(() => {
                      const nd = new Date();
                      nd.setDate(1);
                      nd.setHours(0, 0, 0, 0);
                      return nd;
                    })
                  }
                >
                  This Month
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() =>
                    setMonthStart((d) => {
                      const nd = new Date(d);
                      nd.setMonth(nd.getMonth() + 1);
                      return nd;
                    })
                  }
                >
                  Next Month ▶
                </button>
              </div>
              <div className="month-grid">
                {Array.from({ length: 42 }).map((_, idx) => {
                  const firstDay = new Date(monthStart);
                  const startWeekDay = firstDay.getDay();
                  const date = new Date(firstDay);
                  date.setDate(1 - startWeekDay + idx);
                  const dayAppts = appointments.filter((a) => {
                    const d = new Date(a.scheduledStart);
                    const providerOk = providerFilter === "all" || a.providerId === providerFilter || a.providerName === providerFilter;
                    const typeOk = typeFilter === "all" || a.appointmentTypeId === typeFilter;
                    return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && providerOk && typeOk;
                  });
                  return (
                    <div key={idx} className={`month-cell ${date.getMonth() === monthStart.getMonth() ? "" : "faded"}`}>
                      <div className="month-cell-header">
                        <span>{date.getDate()}</span>
                      </div>
                      <div className="month-cell-body">
                        {dayAppts.slice(0, 3).map((a) => (
                          <div key={a.id} className="pill subtle small">
                            {new Date(a.scheduledStart).getHours()}:00 {a.patientName}
                          </div>
                        ))}
                        {dayAppts.length > 3 && <span className="muted tiny">+{dayAppts.length - 3} more</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Patients</p>
              <div className="list">
                {loading && patients.length === 0 && (
                  <>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="list-row skeleton" style={{ height: 60 }} />
                    ))}
                  </>
                )}
                {!loading &&
                  patients.map((p) => (
                    <div key={p.id} className="list-row">
                      <div>
                        <p className="strong">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="muted">
                          {p.email || "No email"} · {p.phone || "No phone"}
                        </p>
                        <p className="muted">{p.address ? `${p.address}, ${p.city || ""}` : "No address"}</p>
                      </div>
                      <span className="muted">{p.createdAt?.slice(0, 10)}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Encounters</p>
              <div className="list">
                {encounters.map((e) => (
                  <div key={e.id} className="list-row">
                    <div>
                      <p className="strong">CC: {e.chiefComplaint || "N/A"}</p>
                      <p className="muted">Status: {e.status}</p>
                      <p className="muted">{e.assessmentPlan || "Assessment/plan not set"}</p>
                    </div>
                    <div className="status">
                      <span className="pill subtle">{e.status}</span>
                      <select
                        onChange={(ev) =>
                          updateEncounterStatus(session!.tenantId, session!.accessToken, e.id, ev.target.value).then(handleLoadData)
                        }
                        defaultValue=""
                      >
                        <option value="">Set status</option>
                        <option value="draft">Draft</option>
                        <option value="signed">Signed</option>
                        <option value="locked">Locked</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Tasks</p>
              <div className="list">
                {tasks.map((t) => (
                  <div key={t.id} className="list-row">
                    <div>
                      <p className="strong">{t.title}</p>
                      <p className="muted">Status: {t.status}</p>
                    </div>
                    <span className="muted">{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "No due date"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Messages</p>
              <div className="list">
                {messages.map((m) => (
                  <div key={m.id} className="list-row">
                    <div>
                      <p className="strong">{m.subject || "Message"}</p>
                      <p className="muted">{m.body}</p>
                    </div>
                    <span className="muted">{m.sender}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Charges</p>
              <div className="list">
                {charges.map((c) => (
                  <div key={c.id} className="list-row">
                    <div>
                      <p className="strong">CPT {c.cptCode}</p>
                      <p className="muted">ICD: {Array.isArray(c.icdCodes) ? c.icdCodes.join(", ") : (c.icdCodes || "n/a")}</p>
                    </div>
                    <span className="muted">${(c.amountCents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Documents</p>
              <div className="list">
                {documents.map((d) => (
                  <div key={d.id} className="list-row">
                    <div>
                      <p className="strong">{d.title}</p>
                      <p className="muted">{d.type || "Document"} · {d.storage || "local"}</p>
                    </div>
                    <button className="ghost" type="button" onClick={() => openFileSecurely(d)}>
                      Open securely
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Photos</p>
              <div className="list">
                {photos.map((p) => (
                  <div key={p.id} className="list-row">
                    <div>
                      <p className="strong">{p.bodyLocation || "Photo"}</p>
                      <p className="muted">
                        {p.storage || "local"} · {p.url}
                      </p>
                    </div>
                    <button className="ghost" type="button" onClick={() => openFileSecurely(p)}>
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Availability</p>
              <div className="list">
                {availability.map((a) => (
                  <div key={a.id} className="list-row">
                    <div>
                      <p className="strong">
                        {providers.find((p) => p.id === a.providerId)?.fullName || a.providerId}
                      </p>
                      <p className="muted">
                        Day {a.dayOfWeek} · {a.startTime} - {a.endTime}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Reference</p>
              <div className="list">
                <div className="list-row">
                  <div>
                    <p className="strong">Providers</p>
                    <p className="muted">{providers.length} total</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Locations</p>
                    <p className="muted">{locations.length} total</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Appointment Types</p>
                    <p className="muted">{appointmentTypes.length} total</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Analytics</p>
              <div className="filters">
                <button className={`ghost ${analyticsView === "volume" ? "active" : ""}`} type="button" onClick={() => setAnalyticsView("volume")}>
                  Volume
                </button>
                <button className={`ghost ${analyticsView === "revenue" ? "active" : ""}`} type="button" onClick={() => setAnalyticsView("revenue")}>
                  Revenue
                </button>
                <label>
                  Provider
                  <select
                    value={analyticsFilter.providerId}
                    onChange={(e) => setAnalyticsFilter((f) => ({ ...f, providerId: e.target.value }))}
                  >
                    <option value="all">All</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start
                  <input
                    type="date"
                    value={analyticsFilter.startDate}
                    onChange={(e) => setAnalyticsFilter((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </label>
                <label>
                  End
                  <input
                    type="date"
                    value={analyticsFilter.endDate}
                    onChange={(e) => setAnalyticsFilter((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </label>
                <button className="ghost" type="button" onClick={handleLoadData}>
                  Apply filters
                </button>
              </div>
              <div className="list">
                <div className="list-row">
                  <div>
                    <p className="strong">Patients</p>
                    <p className="muted">{analytics?.patients ?? "-"}</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Appointments</p>
                    <p className="muted">{analytics?.appointments ?? "-"}</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Encounters</p>
                    <p className="muted">{analytics?.encounters ?? "-"}</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Charges</p>
                    <p className="muted">{analytics?.charges ?? "-"}</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Providers</p>
                    <p className="muted">{analytics?.providers ?? "-"}</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Revenue</p>
                    <p className="muted">${((analytics?.revenueCents ?? 0) / 100).toFixed(2)}</p>
                  </div>
                </div>
              </div>
              <div className="stats-row">
                <div className="stat-card">
                  <p className="muted tiny">Patients</p>
                  <p className="strong">{analytics?.patients ?? "-"}</p>
                </div>
                <div className="stat-card">
                  <p className="muted tiny">Appointments</p>
                  <p className="strong">{analytics?.appointments ?? "-"}</p>
                </div>
                <div className="stat-card">
                  <p className="muted tiny">Revenue</p>
                  <p className="strong">${((analytics?.revenueCents ?? 0) / 100).toFixed(2)}</p>
                </div>
              </div>
              {analyticsView === "volume" && (
                <>
                  {appointmentsByDay.length > 0 && (
                    <div className="chart">
                      {appointmentsByDay.map((p) => (
                        <div key={p.day} className="chart-row">
                          <span className="muted">{p.day?.slice(0, 10)}</span>
                          <div className="bar" style={{ width: `${Math.min(100, Number(p.count) * 10)}%` }} />
                          <span className="muted">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {appointmentsByProvider.length > 0 && (
                    <div className="chart">
                      {appointmentsByProvider.map((p) => (
                        <div key={p.provider} className="chart-row">
                          <span className="muted">{p.provider}</span>
                          <div className="bar" style={{ width: `${Math.min(100, Number(p.count) * 10)}%` }} />
                          <span className="muted">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {statusCounts.length > 0 && (
                    <div className="chart">
                      {statusCounts.map((p) => (
                        <div key={p.status} className="chart-row">
                          <span className="muted">{p.status}</span>
                          <div className="bar" style={{ width: `${Math.min(100, Number(p.count) * 10)}%` }} />
                          <span className="muted">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {analyticsView === "revenue" && revenueByDay.length > 0 && (
                <div className="chart">
                  {revenueByDay.map((p) => (
                    <div key={p.day} className="chart-row">
                      <span className="muted">{p.day?.slice(0, 10)}</span>
                      <div className="bar" style={{ width: `${Math.min(100, Number(p.amount) / 500)}%` }} />
                      <span className="muted">${(Number(p.amount || 0) / 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <p className="panel-title">Orders</p>
              <div className="list">
                {orders.map((o) => (
                  <div key={o.id} className="list-row">
                    <div>
                      <p className="strong">{o.type}</p>
                      <p className="muted">{o.details || "No details"}</p>
                    </div>
                    <div className="status">
                      <span className="pill subtle">{o.status}</span>
                      <select
                        onChange={(e) =>
                          updateOrderStatus(session!.tenantId, session!.accessToken, o.id, e.target.value).then(handleLoadData)
                        }
                        defaultValue=""
                      >
                        <option value="">Set status</option>
                        <option value="draft">Draft</option>
                        <option value="ordered">Ordered</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() =>
                          createAndReload(() =>
                            sendErx(session!.tenantId, session!.accessToken, {
                              orderId: o.id,
                              medication: o.type,
                              sig: o.details,
                              pharmacy: formState.order.pharmacy || "Demo Pharmacy",
                            }),
                          )
                        }
                      >
                        Send eRx stub
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Interop Capability</p>
              <div className="list">
                <div className="list-row">
                  <div>
                    <p className="strong">FHIR Version</p>
                    <p className="muted">{interop?.fhirVersion || "-"}</p>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <p className="strong">Resources</p>
                    <p className="muted">{Array.isArray(interop?.resources) ? interop.resources.join(", ") : (interop?.resources || "-")}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={async () => {
                  try {
                    const csv = await fetchReportAppointmentsCsv(session!.tenantId, session!.accessToken);
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "appointments.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                    setStatus("Report exported");
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                Export Appointments CSV
              </button>
              {fhirExamples && (
                <div className="panel">
                  <p className="panel-title">FHIR Examples</p>
                  <pre>{JSON.stringify(fhirExamples.appointment, null, 2)}</pre>
                  <pre>{JSON.stringify(fhirExamples.observation, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="panel">
              <p className="panel-title">Vitals</p>
              <div className="list">
                {vitals.map((v) => (
                  <div key={v.id} className="list-row">
                    <div>
                      <p className="strong">BP: {v.bpSystolic}/{v.bpDiastolic}</p>
                      <p className="muted">Pulse: {v.pulse} · Temp: {v.tempC}C</p>
                    </div>
                    <span className="muted">{v.createdAt?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Notes Editor</p>
              {noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked" && (
                <p className="muted tiny">Encounter is locked; editing disabled.</p>
              )}
              {noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "signed" && (
                <p className="muted tiny">Signed encounter; updates will re-save.</p>
              )}
              <div className="sheet">
                <label>
                  Template
                  <select
                    value=""
                    onChange={(e) => {
                      const tpl = noteTemplates.find((t) => t.id === e.target.value);
                      if (tpl) {
                        setNoteEditor({
                          ...noteEditor,
                          chiefComplaint: tpl.chiefComplaint,
                          hpi: tpl.hpi,
                          ros: tpl.ros,
                          exam: tpl.exam,
                          assessmentPlan: tpl.assessmentPlan,
                        });
                      }
                    }}
                  >
                    <option value="">Select template</option>
                    {noteTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Encounter
                  <select
                    value={noteEditor.encounterId}
                    onChange={(e) => setNoteEditor({ ...noteEditor, encounterId: e.target.value })}
                  >
                    <option value="">Select</option>
                    {encounters.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id} ({e.chiefComplaint || "No CC"})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Chief Complaint
                  <input
                    value={noteEditor.chiefComplaint}
                    onChange={(e) => setNoteEditor({ ...noteEditor, chiefComplaint: e.target.value })}
                    disabled={noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  HPI
                  <textarea
                    value={noteEditor.hpi}
                    onChange={(e) => setNoteEditor({ ...noteEditor, hpi: e.target.value })}
                    disabled={noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  ROS
                  <textarea
                    value={noteEditor.ros}
                    onChange={(e) => setNoteEditor({ ...noteEditor, ros: e.target.value })}
                    disabled={noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  Exam
                  <textarea
                    value={noteEditor.exam}
                    onChange={(e) => setNoteEditor({ ...noteEditor, exam: e.target.value })}
                    disabled={noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  Assessment/Plan
                  <textarea
                    value={noteEditor.assessmentPlan}
                    onChange={(e) => setNoteEditor({ ...noteEditor, assessmentPlan: e.target.value })}
                    disabled={noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked"}
                  />
                </label>
                <button
                  type="button"
                  disabled={noteEditor.encounterId && encounters.find((e) => e.id === noteEditor.encounterId)?.status === "locked"}
                  onClick={() =>
                    createAndReload(() =>
                      updateEncounterFields(session!.tenantId, session!.accessToken, noteEditor.encounterId, {
                        chiefComplaint: noteEditor.chiefComplaint || undefined,
                        hpi: noteEditor.hpi || undefined,
                        ros: noteEditor.ros || undefined,
                        exam: noteEditor.exam || undefined,
                        assessmentPlan: noteEditor.assessmentPlan || undefined,
                      }),
                    )
                  }
                >
                  Save note
                </button>
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Vitals Entry</p>
              {vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked" && (
                <p className="muted tiny">Encounter locked; vitals entry disabled.</p>
              )}
              <div className="sheet">
                <label>
                  Encounter
                  <select
                    value={vitalsForm.encounterId}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, encounterId: e.target.value })}
                  >
                    <option value="">Select</option>
                    {encounters.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id} ({e.chiefComplaint || "No CC"})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  BP Systolic
                  <input
                    type="number"
                    value={vitalsForm.bpSystolic}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, bpSystolic: e.target.value })}
                    disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  BP Diastolic
                  <input
                    type="number"
                    value={vitalsForm.bpDiastolic}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, bpDiastolic: e.target.value })}
                    disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  Pulse
                  <input
                    type="number"
                    value={vitalsForm.pulse}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })}
                    disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  Temp (C)
                  <input
                    type="number"
                    value={vitalsForm.tempC}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, tempC: e.target.value })}
                    disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  Height (cm)
                  <input
                    type="number"
                    value={vitalsForm.heightCm}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, heightCm: e.target.value })}
                    disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  />
                </label>
                <label>
                  Weight (kg)
                  <input
                    type="number"
                    value={vitalsForm.weightKg}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, weightKg: e.target.value })}
                    disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  />
                </label>
                <button
                  type="button"
                  disabled={vitalsForm.encounterId && encounters.find((e) => e.id === vitalsForm.encounterId)?.status === "locked"}
                  onClick={() =>
                    createAndReload(() =>
                      updateVitals(session!.tenantId, session!.accessToken, {
                        encounterId: vitalsForm.encounterId,
                        bpSystolic: Number(vitalsForm.bpSystolic) || undefined,
                        bpDiastolic: Number(vitalsForm.bpDiastolic) || undefined,
                        pulse: Number(vitalsForm.pulse) || undefined,
                        tempC: Number(vitalsForm.tempC) || undefined,
                        heightCm: Number(vitalsForm.heightCm) || undefined,
                        weightKg: Number(vitalsForm.weightKg) || undefined,
                      }),
                    )
                  }
                >
                  Save vitals
                </button>
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Audit</p>
              <div className="list">
                {auditLog.map((a) => (
                  <div key={a.id} className="list-row">
                    <div>
                      <p className="strong">{a.action}</p>
                      <p className="muted">
                        {a.entity} · {a.entityId}
                      </p>
                    </div>
                    <span className="muted">{a.createdAt?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {me && (
            <div className="panel">
              <p className="panel-title">Current user (/me)</p>
              <pre>{JSON.stringify(me, null, 2)}</pre>
            </div>
          )}

          {status && <Toast message={status} onClose={() => setStatus(null)} />}
          {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
          <ConflictBanner message={conflictMsg} />
        </div>

        <footer className="footer">
          <div className="footer-content">
            <div className="footer-logo">DermEHR</div>
            <div className="footer-version">Version: 1.0.0 • Build: 2024.12.05</div>
            <div className="footer-legal">
              CPT©2025 American Medical Association. All rights reserved.
              Fee schedules, relative value units, conversion factors and/or related components are
              not assigned by the AMA, are not part of CPT, and the AMA is not recommending their use.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
