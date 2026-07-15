import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DollarSign,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  StickyNote,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "../../api";
import { useAuth } from "../../contexts/AuthContext";

interface AgingBucket {
  current: number;
  days31_60: number;
  days61_90: number;
  over90: number;
  total: number;
  patientCount: number;
}

interface Patient {
  patientId: string;
  patientName: string;
  totalBalance: number;
  currentBalance: number;
  balance31_60: number;
  balance61_90: number;
  balanceOver90: number;
  oldestChargeDate: string | null;
  collectionAttemptCount?: number;
  lastCollectionAttemptDate?: string | null;
  lastContactMethod?: string | null;
  lastContactOutcome?: string | null;
  lastCollectionNotes?: string | null;
  lastPatientResponse?: string | null;
  nextFollowUpDate?: string | null;
  followUpStatus?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  doNotContact?: boolean;
  disputeStatus?: string | null;
  financialAssistanceStatus?: string | null;
}

interface CollectionAttempt {
  id: string;
  attemptDate: string;
  amountDue: number;
  amountCollected: number;
  collectionPoint: string;
  result: string;
  contactMethod?: string | null;
  contactDirection?: "outbound" | "inbound";
  contactPerson?: string | null;
  outcome?: string | null;
  notes?: string | null;
  patientResponse?: string | null;
  staffNextStep?: string | null;
  nextFollowUpDate?: string | null;
  followUpStatus?: string | null;
  attemptedByName?: string | null;
  assignedToName?: string | null;
  patientPromisedAmount?: number | null;
  patientPromisedDate?: string | null;
  disputeStatus?: string | null;
  financialAssistanceStatus?: string | null;
  paymentPlanDiscussed?: boolean;
  financialAssistanceDiscussed?: boolean;
  contactPreferenceConfirmed?: boolean;
  doNotContact?: boolean;
}

interface CollectionActivity {
  attempts: CollectionAttempt[];
}

interface AgingBucketsProps {
  buckets: AgingBucket;
  patients: Patient[];
  onPatientClick?: (patientId: string) => void;
  onContactSaved?: () => void | Promise<void>;
}

type BucketKey = "current" | "31-60" | "61-90" | "90+";

interface AttemptFormState {
  contactMethod: string;
  contactDirection: "outbound" | "inbound";
  contactPerson: string;
  outcome: string;
  patientResponse: string;
  notes: string;
  staffNextStep: string;
  nextFollowUpDate: string;
  followUpStatus: string;
  patientPromisedAmount: string;
  patientPromisedDate: string;
  disputeStatus: string;
  financialAssistanceStatus: string;
  paymentPlanDiscussed: boolean;
  financialAssistanceDiscussed: boolean;
  contactPreferenceConfirmed: boolean;
  doNotContact: boolean;
}

const defaultAttemptForm: AttemptFormState = {
  contactMethod: "phone",
  contactDirection: "outbound",
  contactPerson: "",
  outcome: "spoke_patient",
  patientResponse: "",
  notes: "",
  staffNextStep: "",
  nextFollowUpDate: "",
  followUpStatus: "open",
  patientPromisedAmount: "",
  patientPromisedDate: "",
  disputeStatus: "none",
  financialAssistanceStatus: "not_discussed",
  paymentPlanDiscussed: false,
  financialAssistanceDiscussed: false,
  contactPreferenceConfirmed: false,
  doNotContact: false,
};

const contactMethods = [
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "mail", label: "Mail" },
  { value: "portal", label: "Portal" },
  { value: "in_person", label: "In person" },
  { value: "statement", label: "Statement" },
  { value: "other", label: "Other" },
];

const outcomes = [
  { value: "spoke_patient", label: "Spoke with patient" },
  { value: "spoke_guarantor", label: "Spoke with guarantor" },
  { value: "promise_to_pay", label: "Promise to pay" },
  { value: "payment_plan_requested", label: "Payment plan requested" },
  { value: "partial_payment_expected", label: "Partial payment expected" },
  { value: "financial_assistance_requested", label: "Financial assistance requested" },
  { value: "dispute_opened", label: "Balance disputed" },
  { value: "insurance_issue", label: "Insurance issue" },
  { value: "no_answer", label: "No answer" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "bad_address", label: "Bad address" },
  { value: "refused_to_pay", label: "Refused to pay" },
  { value: "do_not_contact", label: "Do not contact" },
  { value: "resolved", label: "Resolved" },
];

function formatMoney(value?: number | string | null): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "None";
  return new Date(value).toLocaleDateString();
}

function labelize(value?: string | null): string {
  if (!value) return "None";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function daysOld(value?: string | null): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
}

function isDue(value?: string | null): boolean {
  if (!value) return false;
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due <= today;
}

function iconForMethod(method?: string | null) {
  switch (method) {
    case "text":
    case "portal":
      return MessageSquare;
    case "email":
    case "mail":
      return Mail;
    default:
      return Phone;
  }
}

function sanitizePayload(form: AttemptFormState, patient: Patient) {
  const promisedAmount = form.patientPromisedAmount.trim()
    ? Number(form.patientPromisedAmount)
    : undefined;

  return {
    amountDue: patient.totalBalance,
    contactMethod: form.contactMethod,
    contactDirection: form.contactDirection,
    contactPerson: form.contactPerson.trim() || undefined,
    outcome: form.outcome,
    patientResponse: form.patientResponse.trim() || undefined,
    notes: form.notes.trim() || undefined,
    staffNextStep: form.staffNextStep.trim() || undefined,
    nextFollowUpDate: form.nextFollowUpDate || undefined,
    followUpStatus:
      form.outcome === "do_not_contact" || form.doNotContact
        ? "do_not_contact"
        : form.outcome === "resolved"
          ? "resolved"
          : form.followUpStatus,
    patientPromisedAmount: promisedAmount,
    patientPromisedDate: form.patientPromisedDate || undefined,
    disputeStatus: form.disputeStatus === "none" ? undefined : form.disputeStatus,
    financialAssistanceStatus:
      form.financialAssistanceStatus === "not_discussed"
        ? undefined
        : form.financialAssistanceStatus,
    paymentPlanDiscussed: form.paymentPlanDiscussed,
    financialAssistanceDiscussed: form.financialAssistanceDiscussed,
    contactPreferenceConfirmed: form.contactPreferenceConfirmed,
    doNotContact: form.doNotContact || form.outcome === "do_not_contact",
  };
}

export function AgingBuckets({ buckets, patients, onPatientClick, onContactSaved }: AgingBucketsProps) {
  const { session } = useAuth();
  const [selectedBucket, setSelectedBucket] = useState<BucketKey | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activity, setActivity] = useState<CollectionActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [form, setForm] = useState<AttemptFormState>(defaultAttemptForm);

  const bucketData = [
    {
      key: "current" as const,
      label: "Current (0-30 days)",
      amount: buckets.current,
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-500",
      textColor: "text-emerald-700",
      barColor: "bg-emerald-500",
    },
    {
      key: "31-60" as const,
      label: "31-60 days",
      amount: buckets.days31_60,
      bgColor: "bg-amber-50",
      borderColor: "border-amber-500",
      textColor: "text-amber-700",
      barColor: "bg-amber-500",
    },
    {
      key: "61-90" as const,
      label: "61-90 days",
      amount: buckets.days61_90,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-500",
      textColor: "text-orange-700",
      barColor: "bg-orange-500",
    },
    {
      key: "90+" as const,
      label: "Over 90 days",
      amount: buckets.over90,
      bgColor: "bg-rose-50",
      borderColor: "border-rose-500",
      textColor: "text-rose-700",
      barColor: "bg-rose-500",
    },
  ];

  const maxAmount = Math.max(...bucketData.map((bucket) => bucket.amount), 1);

  const filteredPatients = useMemo(() => {
    if (!selectedBucket) return [];

    return patients.filter((patient) => {
      switch (selectedBucket) {
        case "current":
          return patient.currentBalance > 0;
        case "31-60":
          return patient.balance31_60 > 0;
        case "61-90":
          return patient.balance61_90 > 0;
        case "90+":
          return patient.balanceOver90 > 0;
        default:
          return false;
      }
    });
  }, [patients, selectedBucket]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.patientId === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const dueFollowUps = patients.filter(
    (patient) =>
      isDue(patient.nextFollowUpDate) &&
      ["open", "scheduled", undefined, null].includes(patient.followUpStatus)
  ).length;

  const disputeCount = patients.filter((patient) => patient.disputeStatus === "opened").length;
  const doNotContactCount = patients.filter((patient) => patient.doNotContact).length;

  const loadActivity = async (patientId: string) => {
    if (!session) return;

    setActivityLoading(true);
    setSaveError(null);
    try {
      const data = await api.get(
        session.tenantId,
        session.accessToken,
        `/api/collections/patient/${patientId}/activity`
      );
      setActivity(data);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load collection activity");
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadActivity(selectedPatientId);
    } else {
      setActivity(null);
    }
  }, [selectedPatientId, session?.tenantId, session?.accessToken]);

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatientId(patientId);
    onPatientClick?.(patientId);
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selectedPatient) return;

    setSavingAttempt(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      await api.post(
        session.tenantId,
        session.accessToken,
        `/api/collections/patient/${selectedPatient.patientId}/contact-attempts`,
        sanitizePayload(form, selectedPatient)
      );

      setSaveMessage("Contact attempt saved");
      setForm(defaultAttemptForm);
      await loadActivity(selectedPatient.patientId);
      await onContactSaved?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save contact attempt");
    } finally {
      setSavingAttempt(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-blue-700">Total AR</div>
              <div className="text-3xl font-bold text-blue-950">{formatMoney(buckets.total)}</div>
            </div>
            <DollarSign className="h-10 w-10 text-blue-600 opacity-60" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-600">Patients with Balance</div>
              <div className="text-3xl font-bold text-slate-950">{buckets.patientCount}</div>
            </div>
            <Users className="h-10 w-10 text-slate-500" />
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-amber-700">Follow-Ups Due</div>
              <div className="text-3xl font-bold text-amber-950">{dueFollowUps}</div>
            </div>
            <CalendarClock className="h-10 w-10 text-amber-600" />
          </div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-rose-700">Disputes / DNC</div>
              <div className="text-3xl font-bold text-rose-950">
                {disputeCount}/{doNotContactCount}
              </div>
            </div>
            <ShieldAlert className="h-10 w-10 text-rose-600" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-950">Aging Analysis</h3>
          <p className="text-sm text-gray-600">
            Click a bucket, then select a patient to work the balance and document the next step.
          </p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
          {bucketData.map((bucket) => {
            const percentage = buckets.total > 0 ? (bucket.amount / buckets.total) * 100 : 0;
            const barWidth = (bucket.amount / maxAmount) * 100;
            const isSelected = selectedBucket === bucket.key;

            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => {
                  setSelectedBucket(isSelected ? null : bucket.key);
                  setSelectedPatientId(null);
                }}
                className="text-left transition hover:-translate-y-0.5"
              >
                <div
                  className={`rounded-lg border-2 p-4 ${
                    isSelected
                      ? `${bucket.bgColor} ${bucket.borderColor}`
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-sm font-semibold ${bucket.textColor}`}>
                        {bucket.label}
                      </div>
                      <div className="mt-1 text-2xl font-bold text-gray-950">
                        {formatMoney(bucket.amount)}
                      </div>
                    </div>
                    <div className={`text-right text-sm font-semibold ${bucket.textColor}`}>
                      {percentage.toFixed(1)}%
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`${bucket.barColor} h-full transition-all duration-500`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedBucket && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-950">
                Patients in {bucketData.find((bucket) => bucket.key === selectedBucket)?.label}
              </h3>
              <p className="text-sm text-gray-600">
                {filteredPatients.length} patient{filteredPatients.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="divide-y divide-gray-200">
              {filteredPatients.map((patient) => {
                const selected = patient.patientId === selectedPatientId;
                const oldestDays = daysOld(patient.oldestChargeDate);
                const followUpDue = isDue(patient.nextFollowUpDate);

                return (
                  <button
                    key={patient.patientId}
                    type="button"
                    onClick={() => handlePatientSelect(patient.patientId)}
                    className={`w-full px-6 py-4 text-left transition ${
                      selected ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-gray-950">{patient.patientName}</div>
                          {followUpDue && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              Follow-up due
                            </span>
                          )}
                          {patient.doNotContact && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                              Do not contact
                            </span>
                          )}
                          {patient.disputeStatus === "opened" && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              Disputed
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-500">
                          Oldest charge: {formatDate(patient.oldestChargeDate)}
                          {oldestDays !== null ? ` (${oldestDays} days)` : ""}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                          <span className="rounded bg-gray-100 px-2 py-1">
                            Attempts: {patient.collectionAttemptCount || 0}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-1">
                            Last: {labelize(patient.lastContactOutcome)}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-1">
                            Next: {formatDate(patient.nextFollowUpDate)}
                          </span>
                        </div>
                        {(patient.lastPatientResponse || patient.lastCollectionNotes) && (
                          <div className="mt-2 line-clamp-2 text-sm text-gray-700">
                            {patient.lastPatientResponse || patient.lastCollectionNotes}
                          </div>
                        )}
                      </div>
                      <div className="text-left lg:text-right">
                        <div className="text-xl font-bold text-gray-950">
                          {formatMoney(patient.totalBalance)}
                        </div>
                        <div className="text-sm text-gray-500">total balance</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">Current</div>
                        <div className="font-semibold">{formatMoney(patient.currentBalance)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">31-60</div>
                        <div className="font-semibold text-amber-600">
                          {formatMoney(patient.balance31_60)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">61-90</div>
                        <div className="font-semibold text-orange-600">
                          {formatMoney(patient.balance61_90)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">90+</div>
                        <div className="font-semibold text-rose-600">
                          {formatMoney(patient.balanceOver90)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredPatients.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">
                  No patients in this bucket.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {!selectedPatient ? (
              <div className="p-6 text-center text-gray-500">
                <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                Select a patient account to view prior conversations and save a follow-up note.
              </div>
            ) : (
              <div className="space-y-5 p-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-950">{selectedPatient.patientName}</h3>
                      <p className="text-sm text-gray-600">
                        Balance {formatMoney(selectedPatient.totalBalance)} - next follow-up{" "}
                        {formatDate(selectedPatient.nextFollowUpDate)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedPatientId && loadActivity(selectedPatientId)}
                      className="rounded-md border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
                      title="Refresh activity"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <UserCheck className="h-4 w-4" />
                      Collections checklist
                    </div>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Verify the balance and contact preference before discussing payment.</li>
                      <li>Document what the patient said, the outcome, and the next owner/date.</li>
                      <li>Pause follow-up when a dispute or financial-assistance review is active.</li>
                      <li>Keep notes factual and limited to what is needed for account resolution.</li>
                    </ul>
                  </div>
                </div>

                {saveError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {saveError}
                  </div>
                )}
                {saveMessage && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {saveMessage}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Method
                      <select
                        value={form.contactMethod}
                        onChange={(event) => setForm({ ...form, contactMethod: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        {contactMethods.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Direction
                      <select
                        value={form.contactDirection}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            contactDirection: event.target.value as "outbound" | "inbound",
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="outbound">Outbound</option>
                        <option value="inbound">Inbound</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    Outcome
                    <select
                      value={form.outcome}
                      onChange={(event) => setForm({ ...form, outcome: event.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {outcomes.map((outcome) => (
                        <option key={outcome.value} value={outcome.value}>
                          {outcome.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    Contacted person
                    <input
                      value={form.contactPerson}
                      onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
                      placeholder="Patient, spouse, guarantor"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    What they said
                    <textarea
                      value={form.patientResponse}
                      onChange={(event) => setForm({ ...form, patientResponse: event.target.value })}
                      rows={3}
                      placeholder="Example: Patient said the EOB does not match the statement and asked for itemized charges."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    Internal note
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={3}
                      placeholder="Fact-based account note for the next collector."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    Next step
                    <input
                      value={form.staffNextStep}
                      onChange={(event) => setForm({ ...form, staffNextStep: event.target.value })}
                      placeholder="Send itemized statement, call again, review insurance, etc."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Next follow-up
                      <input
                        type="date"
                        value={form.nextFollowUpDate}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            nextFollowUpDate: event.target.value,
                            followUpStatus: event.target.value ? "scheduled" : form.followUpStatus,
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Follow-up status
                      <select
                        value={form.followUpStatus}
                        onChange={(event) => setForm({ ...form, followUpStatus: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="open">Open</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="resolved">Resolved</option>
                        <option value="paused">Paused</option>
                        <option value="do_not_contact">Do not contact</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Promise amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.patientPromisedAmount}
                        onChange={(event) =>
                          setForm({ ...form, patientPromisedAmount: event.target.value })
                        }
                        placeholder="0.00"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Promise date
                      <input
                        type="date"
                        value={form.patientPromisedDate}
                        onChange={(event) => setForm({ ...form, patientPromisedDate: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Dispute
                      <select
                        value={form.disputeStatus}
                        onChange={(event) => setForm({ ...form, disputeStatus: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="opened">Opened</option>
                        <option value="under_review">Under review</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      Financial assistance
                      <select
                        value={form.financialAssistanceStatus}
                        onChange={(event) =>
                          setForm({ ...form, financialAssistanceStatus: event.target.value })
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="not_discussed">Not discussed</option>
                        <option value="discussed">Discussed</option>
                        <option value="application_sent">Application sent</option>
                        <option value="application_received">Application received</option>
                        <option value="approved">Approved</option>
                        <option value="denied">Denied</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-2 text-sm text-gray-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.paymentPlanDiscussed}
                        onChange={(event) =>
                          setForm({ ...form, paymentPlanDiscussed: event.target.checked })
                        }
                      />
                      Payment plan discussed
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.financialAssistanceDiscussed}
                        onChange={(event) =>
                          setForm({ ...form, financialAssistanceDiscussed: event.target.checked })
                        }
                      />
                      Financial assistance discussed
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.contactPreferenceConfirmed}
                        onChange={(event) =>
                          setForm({ ...form, contactPreferenceConfirmed: event.target.checked })
                        }
                      />
                      Contact preference confirmed
                    </label>
                    <label className="flex items-center gap-2 text-rose-700">
                      <input
                        type="checkbox"
                        checked={form.doNotContact}
                        onChange={(event) =>
                          setForm({ ...form, doNotContact: event.target.checked })
                        }
                      />
                      Mark do not contact
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={savingAttempt}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {savingAttempt ? (
                      <>
                        <Clock3 className="h-4 w-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      <>
                        <StickyNote className="h-4 w-4" />
                        Save Contact Note
                      </>
                    )}
                  </button>
                </form>

                <div className="border-t border-gray-200 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-950">Prior conversations</h4>
                    {activityLoading && <span className="text-xs text-gray-500">Loading...</span>}
                  </div>

                  <div className="space-y-3">
                    {(activity?.attempts || []).map((attempt) => {
                      const MethodIcon = iconForMethod(attempt.contactMethod || attempt.collectionPoint);
                      return (
                        <div key={attempt.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-gray-100 p-1.5 text-gray-600">
                                <MethodIcon className="h-4 w-4" />
                              </span>
                              <div>
                                <div className="text-sm font-semibold text-gray-950">
                                  {labelize(attempt.outcome || attempt.result)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {formatDate(attempt.attemptDate)} by{" "}
                                  {attempt.attemptedByName || "Unknown"}
                                </div>
                              </div>
                            </div>
                            {attempt.nextFollowUpDate && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  isDue(attempt.nextFollowUpDate)
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                Next {formatDate(attempt.nextFollowUpDate)}
                              </span>
                            )}
                          </div>

                          {attempt.patientResponse && (
                            <div className="mt-3 rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                              <span className="font-semibold">Patient said: </span>
                              {attempt.patientResponse}
                            </div>
                          )}

                          {attempt.notes && (
                            <div className="mt-2 text-sm text-gray-700">
                              <span className="font-semibold">Note: </span>
                              {attempt.notes}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                            {attempt.patientPromisedAmount != null && (
                              <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
                                Promise {formatMoney(attempt.patientPromisedAmount)}
                              </span>
                            )}
                            {attempt.patientPromisedDate && (
                              <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
                                Pay by {formatDate(attempt.patientPromisedDate)}
                              </span>
                            )}
                            {attempt.disputeStatus && (
                              <span className="rounded bg-slate-100 px-2 py-1">
                                Dispute {labelize(attempt.disputeStatus)}
                              </span>
                            )}
                            {attempt.financialAssistanceStatus && (
                              <span className="rounded bg-purple-50 px-2 py-1 text-purple-700">
                                Assistance {labelize(attempt.financialAssistanceStatus)}
                              </span>
                            )}
                            {attempt.doNotContact && (
                              <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">
                                Do not contact
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {!activityLoading && (activity?.attempts || []).length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                        No prior collection conversations are documented for this account.
                      </div>
                    )}
                  </div>
                </div>

                {selectedPatient.doNotContact && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      This account is marked do not contact
                    </div>
                    Review the prior note and office policy before any further outreach.
                  </div>
                )}

                {selectedPatient.lastContactOutcome === "resolved" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      Last documented outcome is resolved
                    </div>
                    Confirm the balance is still open before additional follow-up.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
