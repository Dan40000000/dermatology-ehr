export const ACTIVE_ENCOUNTER_STORAGE_KEY = 'ema:activeEncounter';
const ACTIVE_ENCOUNTER_UPDATED_EVENT = 'ema:active-encounter-updated';

export interface ActiveEncounterState {
  encounterId: string;
  patientId: string;
  patientName?: string;
  appointmentTypeName?: string;
  startedAt: string;
  startedEncounterFrom?: 'schedule' | 'office_flow';
  undoAppointmentStatus?: string;
  returnPath?: string;
}

function dispatchActiveEncounterUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVE_ENCOUNTER_UPDATED_EVENT));
}

function isValidActiveEncounter(value: unknown): value is ActiveEncounterState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ActiveEncounterState>;
  return Boolean(candidate.encounterId && candidate.patientId && candidate.startedAt);
}

export function getActiveEncounter(): ActiveEncounterState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_ENCOUNTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidActiveEncounter(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setActiveEncounter(state: ActiveEncounterState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_ENCOUNTER_STORAGE_KEY, JSON.stringify(state));
    dispatchActiveEncounterUpdated();
  } catch {
    // Ignore storage errors in private/locked contexts.
  }
}

export function clearActiveEncounter() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_ENCOUNTER_STORAGE_KEY);
    dispatchActiveEncounterUpdated();
  } catch {
    // Ignore storage errors in private/locked contexts.
  }
}

export function subscribeToActiveEncounterChanges(onChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== ACTIVE_ENCOUNTER_STORAGE_KEY) return;
    onChange();
  };
  const handleUpdated = () => onChange();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(
    ACTIVE_ENCOUNTER_UPDATED_EVENT,
    handleUpdated as EventListener,
  );

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(
      ACTIVE_ENCOUNTER_UPDATED_EVENT,
      handleUpdated as EventListener,
    );
  };
}
