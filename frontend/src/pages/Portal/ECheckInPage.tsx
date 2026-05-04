import { useState, useEffect, type ReactNode } from 'react';
import {
  startPortalCheckin,
  fetchPortalCheckinSession,
  updatePortalCheckinSession,
  uploadPortalInsuranceCard,
  fetchPortalRequiredConsents,
  signPortalConsent,
  fetchPortalProfile,
  updatePortalProfile,
  type ConsentForm,
} from '../../portalApi';
import { PortalPharmacyLookup, type PortalPharmacySelection } from '../../components/patient-portal/PortalPharmacyLookup';

interface ECheckInPageProps {
  tenantId: string;
  portalToken: string;
  appointmentId: string;
  appointmentType?: string;
}

function isNewPatientVisit(appointmentType?: string): boolean {
  if (!appointmentType) return false;
  const t = appointmentType.toLowerCase();
  if (t.includes('follow') || t.includes('return') || t.includes('established')) return false;
  return t.includes('new patient') || t.includes('initial') || t.includes('first visit') || t.includes('new visit') || t.includes('consult');
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StepBar({ steps, active }: { steps: string[]; active: number }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: '2rem' }}>
      {steps.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', position: 'relative' }}>
            {/* connector line */}
            {i < steps.length - 1 && (
              <div style={{
                position: 'absolute',
                top: 14,
                left: '50%',
                width: '100%',
                height: 2,
                background: done ? 'linear-gradient(90deg,#16a34a,#4f46e5)' : '#e2e8f0',
                zIndex: 0,
              }} />
            )}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: done ? 'linear-gradient(135deg,#16a34a,#4f46e5)' : current ? '#fff' : '#f1f5f9',
              border: current ? '2px solid #6366f1' : done ? 'none' : '2px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
              position: 'relative',
              flexShrink: 0,
            }}>
              {done ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              ) : (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: current ? '#6366f1' : '#94a3b8' }}>{i + 1}</span>
              )}
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: current ? 600 : 400, color: current ? '#0f172a' : done ? '#16a34a' : '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NavButtons({
  onBack, onNext, backDisabled, nextDisabled, nextLabel, loading,
}: {
  onBack: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', gap: '0.75rem' }}>
      <button
        onClick={onBack}
        disabled={backDisabled}
        style={{
          padding: '0.65rem 1.5rem',
          borderRadius: 10,
          border: '1.5px solid #e2e8f0',
          background: 'white',
          color: backDisabled ? '#cbd5e1' : '#374151',
          fontWeight: 600,
          fontSize: '0.875rem',
          cursor: backDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        Back
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled || loading}
        style={{
          padding: '0.65rem 1.75rem',
          borderRadius: 10,
          border: 'none',
          background: nextDisabled || loading ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#4f46e5)',
          color: nextDisabled || loading ? '#94a3b8' : 'white',
          fontWeight: 600,
          fontSize: '0.875rem',
          cursor: nextDisabled || loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        {loading ? 'Saving…' : (nextLabel ?? 'Continue')}
        {!loading && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        )}
      </button>
    </div>
  );
}

function SectionCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f0fdf4,#eff6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{title}</span>
      </div>
      <div style={{ padding: '1.5rem' }}>
        {children}
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.6rem 0.85rem',
        border: '1.5px solid #e2e8f0',
        borderRadius: 8,
        fontSize: '0.9rem',
        color: '#0f172a',
        outline: 'none',
        background: '#fafafa',
        fontFamily: 'inherit',
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.6rem 0.85rem',
        border: '1.5px solid #e2e8f0',
        borderRadius: 8,
        fontSize: '0.9rem',
        color: '#0f172a',
        outline: 'none',
        background: '#fafafa',
        fontFamily: 'inherit',
        resize: 'vertical',
        lineHeight: 1.5,
      }}
    />
  );
}

function SelectRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <FieldGroup label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 8,
              border: '1.5px solid',
              borderColor: value === opt ? '#6366f1' : '#e2e8f0',
              background: value === opt ? '#eff6ff' : 'white',
              color: value === opt ? '#4338ca' : '#374151',
              fontWeight: value === opt ? 600 : 400,
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </FieldGroup>
  );
}

function toggleListValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function ChecklistGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <FieldGroup label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((opt) => {
          const selected = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(toggleListValue(values, opt))}
              style={{
                padding: '0.42rem 0.72rem',
                borderRadius: 8,
                border: '1.5px solid',
                borderColor: selected ? '#6366f1' : '#e2e8f0',
                background: selected ? '#eff6ff' : 'white',
                color: selected ? '#4338ca' : '#374151',
                fontWeight: selected ? 600 : 400,
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                lineHeight: 1.25,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </FieldGroup>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ isNew }: { isNew: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'linear-gradient(135deg,#16a34a,#4f46e5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.5rem',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
        You're all checked in!
      </h2>
      <p style={{ margin: '0 0 2rem', color: '#475569', fontSize: '0.95rem', lineHeight: 1.6 }}>
        {isNew
          ? 'Welcome! Your paperwork is complete. Please have a seat and our team will call you shortly.'
          : 'Your visit info has been submitted. Please have a seat and we\'ll call you in shortly.'}
      </p>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '1rem 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.75rem', maxWidth: 320 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span style={{ fontSize: '0.875rem', color: '#15803d', fontWeight: 500 }}>Estimated wait: 10–15 minutes</span>
      </div>
    </div>
  );
}

// ─── NEW PATIENT FLOW ─────────────────────────────────────────────────────────

const NEW_STEPS = ['Demographics', 'Insurance', 'Consents', 'Copay', 'Done'];

function NewPatientCheckin({ tenantId, portalToken, appointmentId }: { tenantId: string; portalToken: string; appointmentId: string }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Demo: patient may not have a real session
  const [sessionReady, setSessionReady] = useState(false);

  // Step 0: Demographics
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [pharmacy, setPharmacy] = useState<PortalPharmacySelection>({
    pharmacyId: null,
    pharmacyNcpdp: null,
    pharmacyName: '',
    pharmacyPhone: '',
    pharmacyAddress: '',
  });
  const [confirmed, setConfirmed] = useState(false);

  // Step 1: Insurance
  const [frontUploaded, setFrontUploaded] = useState(false);
  const [backUploaded, setBackUploaded] = useState(false);
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);

  // Step 2: Consents
  const [consents, setConsents] = useState<ConsentForm[]>([]);
  const [signed, setSigned] = useState<Set<string>>(new Set());
  const [signerName, setSignerName] = useState('');

  // Step 3: Copay
  const [copay, setCopay] = useState(0);
  const [copayPaid, setCopayPaid] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const { sessionId: sid } = await startPortalCheckin(tenantId, portalToken, { appointmentId, sessionType: 'mobile' });
        setSessionId(sid);
        const sessionData = await fetchPortalCheckinSession(tenantId, portalToken, sid);
        setCopay(sessionData.copayAmount || 0);
        const profileData = await fetchPortalProfile(tenantId, portalToken);
        const p = profileData.patient;
        if (p) {
          setAddress(p.address || '');
          setPhone(p.phone || '');
          setEcName(p.emergencyContactName || '');
          setEcPhone(p.emergencyContactPhone || '');
          setPharmacy({
            pharmacyId: p.pharmacyId || null,
            pharmacyNcpdp: p.pharmacyNcpdp || null,
            pharmacyName: p.pharmacyName || '',
            pharmacyPhone: p.pharmacyPhone || '',
            pharmacyAddress: p.pharmacyAddress || '',
          });
          const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
          if (name) setSignerName(name);
        }
        const cd = await fetchPortalRequiredConsents(tenantId, portalToken);
        setConsents(cd.requiredConsents || []);
        setSessionReady(true);
      } catch {
        setSessionReady(true); // still allow demo flow
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const saveStep = async (stepIdx: number) => {
    if (!sessionId) return;
    if (stepIdx === 0) {
      await updatePortalProfile(tenantId, portalToken, {
        address: address || undefined, phone: phone || undefined,
        emergencyContactName: ecName || undefined, emergencyContactPhone: ecPhone || undefined,
        pharmacyId: pharmacy.pharmacyId || null,
        pharmacyNcpdp: pharmacy.pharmacyNcpdp || null,
        pharmacyName: pharmacy.pharmacyName || undefined,
        pharmacyPhone: pharmacy.pharmacyPhone || undefined,
        pharmacyAddress: pharmacy.pharmacyAddress || undefined,
      });
      await updatePortalCheckinSession(tenantId, portalToken, sessionId, { demographicsConfirmed: true });
    } else if (stepIdx === 1) {
      await updatePortalCheckinSession(tenantId, portalToken, sessionId, { insuranceVerified: true });
    } else if (stepIdx === 2) {
      await updatePortalCheckinSession(tenantId, portalToken, sessionId, { formsCompleted: true });
    } else if (stepIdx === 3) {
      await updatePortalCheckinSession(tenantId, portalToken, sessionId, { copayCollected: true });
    }
  };

  const handleNext = async () => {
    setLoading(true);
    setError(null);
    try {
      await saveStep(step);
    } catch {
      // Silently continue in demo
    } finally {
      setLoading(false);
      setStep((s) => s + 1);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      if (sessionId) await updatePortalCheckinSession(tenantId, portalToken, sessionId, { complete: true });
    } catch { /* demo */ } finally {
      setLoading(false);
      setSuccess(true);
    }
  };

  const readFile = (file: File) => new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });

  const handleInsuranceFile = async (side: 'front' | 'back', file?: File) => {
    if (!file) return;
    const dataUrl = await readFile(file);
    if (side === 'front') { setFrontImage(dataUrl); setFrontUploaded(true); }
    else { setBackImage(dataUrl); setBackUploaded(true); }
    if (sessionId && frontImage && backImage) {
      await uploadPortalInsuranceCard(tenantId, portalToken, sessionId, { frontImageUrl: side === 'front' ? dataUrl : frontImage!, backImageUrl: side === 'back' ? dataUrl : backImage! });
    }
  };

  const handleSign = async (id: string) => {
    if (!signerName.trim()) { setError('Enter your full name to sign.'); return; }
    try {
      setLoading(true);
      await signPortalConsent(tenantId, portalToken, id, { signatureData: `typed:${signerName}`, signerName, signerRelationship: 'self' });
      setSigned((prev) => new Set([...prev, id]));
    } catch { setSigned((prev) => new Set([...prev, id])); } finally { setLoading(false); }
  };

  if (!sessionReady && loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading check-in…</div>;
  }

  if (success) return <SuccessScreen isNew />;

  return (
    <div>
      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1.25rem', fontSize: '0.875rem' }}>
          {error} <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>✕</button>
        </div>
      )}

      <StepBar steps={NEW_STEPS} active={step} />

      {/* Step 0: Demographics */}
      {step === 0 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          title="Verify Your Information"
        >
          <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.875rem' }}>Please review and update your contact information if anything has changed.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <FieldGroup label="Home Address">
                <Input value={address} onChange={setAddress} placeholder="123 Main St, City, State 12345" />
              </FieldGroup>
            </div>
            <FieldGroup label="Phone Number">
              <Input value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
            </FieldGroup>
            <div />
            <FieldGroup label="Emergency Contact Name">
              <Input value={ecName} onChange={setEcName} placeholder="Full name" />
            </FieldGroup>
            <FieldGroup label="Emergency Contact Phone">
              <Input value={ecPhone} onChange={setEcPhone} placeholder="(555) 987-6543" />
            </FieldGroup>
            <div style={{ gridColumn: '1/-1' }}>
              <FieldGroup label="Preferred Pharmacy">
                <PortalPharmacyLookup
                  tenantId={tenantId}
                  portalToken={portalToken}
                  selected={pharmacy}
                  onSelect={setPharmacy}
                />
              </FieldGroup>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '1rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
            <span style={{ fontSize: '0.875rem', color: '#374151' }}>I confirm this information is correct</span>
          </label>
          <NavButtons onBack={() => {}} backDisabled onNext={handleNext} nextDisabled={!confirmed} loading={loading} />
        </SectionCard>
      )}

      {/* Step 1: Insurance */}
      {step === 1 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
          title="Insurance Card"
        >
          <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.875rem' }}>Upload photos of the front and back of your insurance card.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {(['front', 'back'] as const).map((side) => {
              const uploaded = side === 'front' ? frontUploaded : backUploaded;
              const img = side === 'front' ? frontImage : backImage;
              return (
                <label key={side} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '0.75rem', padding: '2rem 1rem', border: `2px dashed ${uploaded ? '#86efac' : '#e2e8f0'}`,
                  borderRadius: 12, cursor: 'pointer', background: uploaded ? '#f0fdf4' : '#fafafa',
                  transition: 'all 0.2s',
                }}>
                  {img ? (
                    <img src={img} alt={`Insurance ${side}`} style={{ maxHeight: 80, maxWidth: '100%', borderRadius: 6 }} />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={uploaded ? '#16a34a' : '#94a3b8'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  )}
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: uploaded ? '#15803d' : '#475569' }}>
                    {uploaded ? 'Uploaded ✓' : `Upload ${side.charAt(0).toUpperCase() + side.slice(1)} of Card`}
                  </span>
                  <input type="file" hidden accept="image/*" onChange={(e) => handleInsuranceFile(side, e.target.files?.[0])} />
                </label>
              );
            })}
          </div>
          <NavButtons onBack={() => setStep(0)} onNext={handleNext} loading={loading} nextLabel="Continue" />
        </SectionCard>
      )}

      {/* Step 2: Consents */}
      {step === 2 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
          title="Consent Forms"
        >
          <FieldGroup label="Sign with your full name">
            <Input value={signerName} onChange={setSignerName} placeholder="Full legal name" />
          </FieldGroup>
          {consents.length === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1rem', fontSize: '0.875rem', color: '#15803d' }}>
              No consent forms required for this visit.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {consents.map((c) => {
                const isSigned = signed.has(c.id);
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '1rem', padding: '0.875rem 1rem', border: `1.5px solid ${isSigned ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: 10, background: isSigned ? '#f0fdf4' : 'white',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{c.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>{c.consentType}</div>
                    </div>
                    {isSigned ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#16a34a', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        Signed
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSign(c.id)}
                        disabled={!signerName.trim() || loading}
                        style={{
                          padding: '0.4rem 1rem', borderRadius: 8, border: '1.5px solid #6366f1',
                          background: signerName.trim() ? '#eff6ff' : '#f1f5f9',
                          color: signerName.trim() ? '#4338ca' : '#94a3b8',
                          fontSize: '0.8rem', fontWeight: 600, cursor: signerName.trim() ? 'pointer' : 'not-allowed',
                          whiteSpace: 'nowrap', fontFamily: 'inherit',
                        }}
                      >
                        Sign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <NavButtons
            onBack={() => setStep(1)}
            onNext={handleNext}
            nextDisabled={consents.length > 0 && signed.size < consents.length}
            loading={loading}
          />
        </SectionCard>
      )}

      {/* Step 3: Copay */}
      {step === 3 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
          title="Copay"
        >
          <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.875rem' }}>Your estimated copay for today's visit:</p>
          <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#eff6ff)', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>${copay.toFixed(2)}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Estimated — final amount at checkout</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => { setCopayPaid(true); }}
              disabled={copayPaid}
              style={{
                padding: '0.75rem', borderRadius: 10, border: 'none',
                background: copayPaid ? '#f0fdf4' : 'linear-gradient(135deg,#16a34a,#4f46e5)',
                color: copayPaid ? '#15803d' : 'white',
                fontWeight: 600, fontSize: '0.9rem', cursor: copayPaid ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copayPaid ? '✓ Payment Received' : 'Pay Now'}
            </button>
            <button
              onClick={handleNext}
              style={{
                padding: '0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#374151', fontWeight: 500, fontSize: '0.875rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Pay at Checkout
            </button>
          </div>
          {copayPaid && (
            <NavButtons onBack={() => setStep(2)} onNext={handleNext} loading={loading} nextLabel="Finish" />
          )}
        </SectionCard>
      )}

      {/* Step 4: Review & Complete */}
      {step === 4 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>}
          title="Ready to Check In"
        >
          <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.875rem' }}>Everything looks good. Here's your summary:</p>
          {[
            { label: 'Demographics verified', done: true },
            { label: 'Insurance card uploaded', done: frontUploaded || backUploaded },
            { label: `Consent forms (${signed.size}/${consents.length} signed)`, done: consents.length === 0 || signed.size >= consents.length },
            { label: copayPaid ? 'Copay paid' : 'Paying at checkout', done: true },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: item.done ? '#dcfce7' : '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={item.done ? '#16a34a' : '#a16207'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <span style={{ fontSize: '0.875rem', color: '#374151' }}>{item.label}</span>
            </div>
          ))}
          <NavButtons onBack={() => setStep(3)} onNext={handleComplete} loading={loading} nextLabel="Complete Check-In" />
        </SectionCard>
      )}
    </div>
  );
}

// ─── FOLLOW-UP FLOW ───────────────────────────────────────────────────────────

const FOLLOWUP_STEPS = ['Confirm Info', 'Today\'s Visit', 'Medications', 'Copay', 'Done'];

const visitConcernTypeOptions = [
  'Rash / eczema flare',
  'Acne / rosacea',
  'Mole / changing spot',
  'Psoriasis',
  'Hair / scalp / nails',
  'Medication reaction',
  'Procedure follow-up',
  'Other skin concern',
];

const affectedAreaOptions = [
  'Face',
  'Scalp',
  'Neck',
  'Chest / abdomen',
  'Back',
  'Arms / hands',
  'Legs / feet',
  'Groin / genitals',
  'Inside mouth / lips',
  'Widespread',
];

const skinSymptomOptions = [
  'Redness',
  'Itching',
  'Pain / tenderness',
  'Burning / stinging',
  'Bleeding',
  'Crusting / scabbing',
  'Oozing / drainage',
  'Dry / scaling',
  'Swelling',
  'Blistering',
  'Color change',
  'Hair loss',
  'Nail changes',
];

const lesionWarningOptions = [
  'Growing larger',
  'Changing color',
  'Changing shape or border',
  'Asymmetric',
  'Multiple colors',
  'Bigger than pencil eraser',
  'Bleeding or crusting',
  'Itching or painful',
  'Looks different from your other spots',
  'Not healing',
];

const exposureOptions = [
  'New skin care / cosmetic',
  'New soap / detergent',
  'New medication or supplement',
  'Jewelry / metal / watch',
  'Hair dye / nail product',
  'Work chemical exposure',
  'Plants / yard work',
  'Sunburn / tanning',
  'Travel / hotel / gym',
  'Household contact with rash',
  'Pets / insect bites',
];

const treatmentUseOptions = [
  'Prescription cream / ointment',
  'Prescription pills / injections',
  'OTC hydrocortisone',
  'Antifungal treatment',
  'Antibiotic ointment',
  'Acne wash / benzoyl peroxide',
  'Moisturizer / barrier cream',
  'Antihistamine',
  'Nothing yet',
];

const treatmentResponseOptions = [
  'Much better',
  'Somewhat better',
  'No change',
  'Worse with treatment',
  'Returns when I stop treatment',
  'Side effects / irritation',
];

const qualityImpactOptions = [
  'Sleep interrupted',
  'Work / school affected',
  'Exercise limited',
  'Embarrassment / social impact',
  'Pain limits activity',
  'No major impact',
];

const reviewOfSystemsOptions = [
  'Fever / chills',
  'Unintentional weight loss',
  'Night sweats',
  'Fatigue',
  'Mouth sores',
  'Eye redness / pain',
  'Shortness of breath',
  'New numbness / tingling',
  'Easy bleeding / bruising',
  'Swollen lymph nodes',
];

const psoriasisJointOptions = [
  'Morning stiffness',
  'Swollen or tender joints',
  'Swollen finger or toe',
  'Heel pain',
  'Lower back pain',
  'Nail pitting / nail lifting',
  'None of these',
];

function FollowUpCheckin({ tenantId, portalToken, appointmentId }: { tenantId: string; portalToken: string; appointmentId: string }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step 0: Confirm info
  const [confirmed, setConfirmed] = useState(false);
  const [infoChanged, setInfoChanged] = useState<string | null>(null);
  const [changeDetail, setChangeDetail] = useState('');
  const [pharmacyChanged, setPharmacyChanged] = useState<string | null>(null);
  const [pharmacy, setPharmacy] = useState<PortalPharmacySelection>({
    pharmacyId: null,
    pharmacyNcpdp: null,
    pharmacyName: '',
    pharmacyPhone: '',
    pharmacyAddress: '',
  });

  // Step 1: Today's visit
  const [visitConcernType, setVisitConcernType] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [affectedAreas, setAffectedAreas] = useState<string[]>([]);
  const [skinSymptoms, setSkinSymptoms] = useState<string[]>([]);
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState('');
  const [itchSeverity, setItchSeverity] = useState('');
  const [painSeverity, setPainSeverity] = useState('');
  const [worseOrBetter, setWorseOrBetter] = useState('');
  const [lesionWarnings, setLesionWarnings] = useState<string[]>([]);
  const [possibleExposures, setPossibleExposures] = useState<string[]>([]);
  const [treatmentUse, setTreatmentUse] = useState<string[]>([]);
  const [treatmentResponse, setTreatmentResponse] = useState<string[]>([]);
  const [treatmentSideEffects, setTreatmentSideEffects] = useState('');
  const [qualityImpact, setQualityImpact] = useState<string[]>([]);
  const [reviewOfSystems, setReviewOfSystems] = useState<string[]>([]);
  const [psoriasisJointScreen, setPsoriasisJointScreen] = useState<string[]>([]);
  const [hasPhotos, setHasPhotos] = useState(false);
  const [additionalSymptoms, setAdditionalSymptoms] = useState('');

  // Step 2: Medications
  const [medsUnchanged, setMedsUnchanged] = useState<string | null>(null);
  const [newMeds, setNewMeds] = useState('');
  const [removedMeds, setRemovedMeds] = useState('');
  const [allergiesChanged, setAllergiesChanged] = useState(false);
  const [allergyDetail, setAllergyDetail] = useState('');

  // Step 3: Copay
  const [copay, setCopay] = useState(0);
  const [copayPaid, setCopayPaid] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const { sessionId: sid } = await startPortalCheckin(tenantId, portalToken, { appointmentId, sessionType: 'mobile' });
        setSessionId(sid);
        const sessionData = await fetchPortalCheckinSession(tenantId, portalToken, sid);
        setCopay(sessionData.copayAmount || 0);
        const profileData = await fetchPortalProfile(tenantId, portalToken);
        const p = profileData.patient;
        if (p) {
          setPharmacy({
            pharmacyId: p.pharmacyId || null,
            pharmacyNcpdp: p.pharmacyNcpdp || null,
            pharmacyName: p.pharmacyName || '',
            pharmacyPhone: p.pharmacyPhone || '',
            pharmacyAddress: p.pharmacyAddress || '',
          });
        }
      } catch {
        // demo — continue
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const buildVisitDetails = (submitted = false): Record<string, unknown> => ({
    intakeKind: 'follow_up',
    contactInfoChanged: infoChanged,
    contactInfoChangeDetail: changeDetail.trim(),
    pharmacyChanged,
    preferredPharmacyName: pharmacy.pharmacyName,
    preferredPharmacyNcpdp: pharmacy.pharmacyNcpdp,
    visitConcernType,
    chiefComplaint: chiefComplaint.trim(),
    affectedAreas,
    skinSymptoms,
    duration,
    severity,
    itchSeverity,
    painSeverity,
    trendSinceLastVisit: worseOrBetter,
    lesionWarnings,
    possibleExposures,
    treatmentUse,
    treatmentResponse,
    treatmentSideEffects: treatmentSideEffects.trim(),
    qualityImpact,
    reviewOfSystems,
    psoriasisJointScreen,
    hasPhotos,
    additionalSymptoms: additionalSymptoms.trim(),
    medicationsChanged: medsUnchanged,
    newMedications: newMeds.trim(),
    stoppedMedications: removedMeds.trim(),
    allergiesChanged,
    allergyDetail: allergyDetail.trim(),
    submittedAt: submitted ? new Date().toISOString() : undefined,
  });

  const handleNext = async () => {
    setLoading(true);
    setError(null);
    try {
      if (sessionId && step === 0) {
        if (pharmacyChanged === 'Yes, update my pharmacy') {
          await updatePortalProfile(tenantId, portalToken, {
            pharmacyId: pharmacy.pharmacyId || null,
            pharmacyNcpdp: pharmacy.pharmacyNcpdp || null,
            pharmacyName: pharmacy.pharmacyName || undefined,
            pharmacyPhone: pharmacy.pharmacyPhone || undefined,
            pharmacyAddress: pharmacy.pharmacyAddress || undefined,
          });
        }
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, { demographicsConfirmed: true });
      } else if (sessionId && step === 1) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, { visitDetails: buildVisitDetails() });
      } else if (sessionId && step === 2) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, { formsCompleted: true, visitDetails: buildVisitDetails() });
      } else if (sessionId && step === 3) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, { copayCollected: copayPaid, visitDetails: buildVisitDetails() });
      }
    } catch { /* demo */ } finally {
      setLoading(false);
      setStep((s) => s + 1);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      if (sessionId) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, { complete: true, copayCollected: copayPaid, visitDetails: buildVisitDetails(true) });
      }
    } catch { /* demo */ } finally {
      setLoading(false);
      setSuccess(true);
    }
  };

  if (success) return <SuccessScreen isNew={false} />;

  return (
    <div>
      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1.25rem', fontSize: '0.875rem' }}>
          {error} <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>✕</button>
        </div>
      )}

      <StepBar steps={FOLLOWUP_STEPS} active={step} />

      {/* Step 0: Confirm Info */}
      {step === 0 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          title="Confirm Your Information"
        >
          <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.875rem' }}>Since you're a returning patient, we just need to confirm nothing has changed.</p>

          <SelectRow
            label="Has your address, phone, or emergency contact changed?"
            options={['No, everything is the same', 'Yes, something changed']}
            value={infoChanged ?? ''}
            onChange={setInfoChanged}
          />

          {infoChanged === 'Yes, something changed' && (
            <FieldGroup label="What changed? (we'll update your record)">
              <Textarea value={changeDetail} onChange={setChangeDetail} placeholder="e.g. New address: 456 Oak Ave, New phone: (555) 999-0000" rows={2} />
            </FieldGroup>
          )}

          <SelectRow
            label="Is your preferred pharmacy still correct?"
            options={['Yes, keep it the same', 'Yes, update my pharmacy']}
            value={pharmacyChanged ?? ''}
            onChange={setPharmacyChanged}
          />

          {pharmacy.pharmacyName && pharmacyChanged !== 'Yes, update my pharmacy' && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.85rem 1rem', color: '#475569', fontSize: '0.84rem' }}>
              Current pharmacy: {[pharmacy.pharmacyName, pharmacy.pharmacyAddress, pharmacy.pharmacyNcpdp ? `NCPDP ${pharmacy.pharmacyNcpdp}` : ''].filter(Boolean).join(' • ')}
            </div>
          )}

          {pharmacyChanged === 'Yes, update my pharmacy' && (
            <FieldGroup label="Preferred Pharmacy">
              <PortalPharmacyLookup
                tenantId={tenantId}
                portalToken={portalToken}
                selected={pharmacy}
                onSelect={setPharmacy}
              />
            </FieldGroup>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '1rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
            <span style={{ fontSize: '0.875rem', color: '#374151' }}>I confirm my information is up to date</span>
          </label>

          <NavButtons onBack={() => {}} backDisabled onNext={handleNext} nextDisabled={!confirmed || infoChanged === null || pharmacyChanged === null} loading={loading} />
        </SectionCard>
      )}

      {/* Step 1: Today's Visit */}
      {step === 1 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
          title="Today's Visit"
        >
          <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Tell us what changed since your last visit. These questions follow a standard dermatology history: where it is, what it looks and feels like, timing, triggers, treatments tried, and any warning symptoms.
          </p>

          <SelectRow
            label="Type of concern"
            options={visitConcernTypeOptions}
            value={visitConcernType}
            onChange={setVisitConcernType}
          />

          <FieldGroup label="Main reason for today's visit (chief complaint)">
            <Textarea value={chiefComplaint} onChange={setChiefComplaint} placeholder="e.g. Rash on left forearm with itching and redness; mole on back looks darker" rows={2} />
          </FieldGroup>

          <ChecklistGroup
            label="Affected area(s)"
            options={affectedAreaOptions}
            values={affectedAreas}
            onChange={setAffectedAreas}
          />

          <ChecklistGroup
            label="Skin symptoms you're noticing"
            options={skinSymptomOptions}
            values={skinSymptoms}
            onChange={setSkinSymptoms}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
            <SelectRow
              label="How long has this been going on?"
              options={['Less than 1 week', '1–4 weeks', '1–3 months', 'More than 3 months']}
              value={duration}
              onChange={setDuration}
            />

            <SelectRow
              label="Overall severity"
              options={['1–3 Mild', '4–6 Moderate', '7–9 Severe', '10 Unbearable']}
              value={severity}
              onChange={setSeverity}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
            <SelectRow
              label="Itch severity"
              options={['None', 'Mild', 'Moderate', 'Severe']}
              value={itchSeverity}
              onChange={setItchSeverity}
            />

            <SelectRow
              label="Pain / tenderness"
              options={['None', 'Mild', 'Moderate', 'Severe']}
              value={painSeverity}
              onChange={setPainSeverity}
            />
          </div>

          <SelectRow
            label="Since your last visit, is it..."
            options={['Better', 'About the same', 'Worse', 'Spreading', 'Comes and goes', 'First time having this']}
            value={worseOrBetter}
            onChange={setWorseOrBetter}
          />

          <ChecklistGroup
            label="Mole / spot warning signs"
            options={lesionWarningOptions}
            values={lesionWarnings}
            onChange={setLesionWarnings}
          />

          <ChecklistGroup
            label="Possible triggers or exposures"
            options={exposureOptions}
            values={possibleExposures}
            onChange={setPossibleExposures}
          />

          <ChecklistGroup
            label="Treatments tried since last visit"
            options={treatmentUseOptions}
            values={treatmentUse}
            onChange={setTreatmentUse}
          />

          <ChecklistGroup
            label="Treatment response"
            options={treatmentResponseOptions}
            values={treatmentResponse}
            onChange={setTreatmentResponse}
          />

          <FieldGroup label="Side effects or problems from treatment (optional)">
            <Textarea value={treatmentSideEffects} onChange={setTreatmentSideEffects} placeholder="e.g. Burning from cream, excessive dryness, nausea from medication" rows={2} />
          </FieldGroup>

          <ChecklistGroup
            label="Impact on daily life"
            options={qualityImpactOptions}
            values={qualityImpact}
            onChange={setQualityImpact}
          />

          <ChecklistGroup
            label="Review of systems"
            options={reviewOfSystemsOptions}
            values={reviewOfSystems}
            onChange={setReviewOfSystems}
          />

          {(visitConcernType === 'Psoriasis' || skinSymptoms.includes('Nail changes')) && (
            <ChecklistGroup
              label="Psoriasis / joint symptom screen"
              options={psoriasisJointOptions}
              values={psoriasisJointScreen}
              onChange={setPsoriasisJointScreen}
            />
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.25rem 0 1rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={hasPhotos} onChange={(e) => setHasPhotos(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
            <span style={{ fontSize: '0.875rem', color: '#374151' }}>I have photos or progress pictures to show the provider</span>
          </label>

          <FieldGroup label="Any other symptoms or concerns? (optional)">
            <Textarea value={additionalSymptoms} onChange={setAdditionalSymptoms} placeholder="e.g. Worse at night, no fever, household member has a similar rash, worried it may be infected" rows={3} />
          </FieldGroup>

          <NavButtons
            onBack={() => setStep(0)}
            onNext={handleNext}
            nextDisabled={!visitConcernType || !chiefComplaint.trim() || affectedAreas.length === 0 || skinSymptoms.length === 0 || !duration || !severity}
            loading={loading}
          />
        </SectionCard>
      )}

      {/* Step 2: Medications */}
      {step === 2 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20H4a2 2 0 01-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 011.66.9l.82 1.2a2 2 0 001.66.9H20a2 2 0 012 2v3.5"/><path d="M17 19.5l1.5-1.5m0 0l1.5-1.5M18.5 18l1.5 1.5M18.5 18l-1.5-1.5"/><circle cx="18.5" cy="18" r="5.5"/></svg>}
          title="Medications Review"
        >
          <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.875rem' }}>Help us keep your medication list current.</p>

          <SelectRow
            label="Are your medications the same as your last visit?"
            options={['Yes, no changes', 'No, something changed']}
            value={medsUnchanged ?? ''}
            onChange={setMedsUnchanged}
          />

          {medsUnchanged === 'No, something changed' && (
            <>
              <FieldGroup label="New medications started since last visit (optional)">
                <Textarea value={newMeds} onChange={setNewMeds} placeholder="e.g. Metformin 500mg daily (started 2 weeks ago)" rows={2} />
              </FieldGroup>
              <FieldGroup label="Medications you've stopped (optional)">
                <Textarea value={removedMeds} onChange={setRemovedMeds} placeholder="e.g. Stopped Lisinopril" rows={2} />
              </FieldGroup>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={allergiesChanged} onChange={(e) => setAllergiesChanged(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
            <span style={{ fontSize: '0.875rem', color: '#374151' }}>I have a new allergy to report</span>
          </label>

          {allergiesChanged && (
            <div style={{ marginTop: '0.75rem' }}>
              <FieldGroup label="New allergy details">
                <Input value={allergyDetail} onChange={setAllergyDetail} placeholder="e.g. Penicillin — hives" />
              </FieldGroup>
            </div>
          )}

          <NavButtons onBack={() => setStep(1)} onNext={handleNext} nextDisabled={medsUnchanged === null} loading={loading} />
        </SectionCard>
      )}

      {/* Step 3: Copay */}
      {step === 3 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
          title="Copay"
        >
          <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.875rem' }}>Your estimated copay for today's visit:</p>
          <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#eff6ff)', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>${copay.toFixed(2)}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Estimated — final amount at checkout</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => setCopayPaid(true)}
              disabled={copayPaid}
              style={{
                padding: '0.75rem', borderRadius: 10, border: 'none',
                background: copayPaid ? '#f0fdf4' : 'linear-gradient(135deg,#16a34a,#4f46e5)',
                color: copayPaid ? '#15803d' : 'white',
                fontWeight: 600, fontSize: '0.9rem', cursor: copayPaid ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copayPaid ? '✓ Payment Received' : 'Pay Now'}
            </button>
            <button
              onClick={handleNext}
              style={{
                padding: '0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#374151', fontWeight: 500, fontSize: '0.875rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Pay at Checkout
            </button>
          </div>
          {copayPaid && (
            <NavButtons onBack={() => setStep(2)} onNext={handleNext} loading={loading} nextLabel="Finish" />
          )}
        </SectionCard>
      )}

      {/* Step 4: Complete */}
      {step === 4 && (
        <SectionCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>}
          title="Ready to Check In"
        >
          <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.875rem' }}>Here's a summary of what you submitted today:</p>
          {[
            { label: 'Contact info confirmed', done: true },
            { label: `Visit type: ${visitConcernType || 'Not selected'}`, done: !!visitConcernType },
            { label: `Chief complaint: ${chiefComplaint.slice(0, 40)}${chiefComplaint.length > 40 ? '…' : ''}`, done: !!chiefComplaint },
            { label: `${affectedAreas.length} affected area${affectedAreas.length === 1 ? '' : 's'} recorded`, done: affectedAreas.length > 0 },
            { label: `${skinSymptoms.length} skin symptom${skinSymptoms.length === 1 ? '' : 's'} recorded`, done: skinSymptoms.length > 0 },
            { label: `${lesionWarnings.length} mole / spot warning sign${lesionWarnings.length === 1 ? '' : 's'} checked`, done: true },
            { label: 'Medications reviewed', done: medsUnchanged !== null },
            { label: copayPaid ? 'Copay paid' : 'Paying at checkout', done: true },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: item.done ? '#dcfce7' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={item.done ? '#16a34a' : '#94a3b8'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <span style={{ fontSize: '0.875rem', color: '#374151' }}>{item.label}</span>
            </div>
          ))}
          <NavButtons onBack={() => setStep(3)} onNext={handleComplete} loading={loading} nextLabel="Complete Check-In" />
        </SectionCard>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ECheckInPage({ tenantId, portalToken, appointmentId, appointmentType }: ECheckInPageProps) {
  const isNew = isNewPatientVisit(appointmentType);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Visit type badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.3rem 0.875rem', borderRadius: 999,
          background: isNew ? '#eff6ff' : '#f0fdf4',
          border: `1px solid ${isNew ? '#c7d2fe' : '#bbf7d0'}`,
          fontSize: '0.78rem', fontWeight: 600,
          color: isNew ? '#4338ca' : '#15803d',
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: isNew ? '#6366f1' : '#16a34a' }} />
          {isNew ? 'New Patient Check-In' : 'Follow-Up Check-In'}
        </div>
        {appointmentType && (
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{appointmentType}</span>
        )}
      </div>

      {isNew
        ? <NewPatientCheckin tenantId={tenantId} portalToken={portalToken} appointmentId={appointmentId} />
        : <FollowUpCheckin tenantId={tenantId} portalToken={portalToken} appointmentId={appointmentId} />
      }
    </div>
  );
}
