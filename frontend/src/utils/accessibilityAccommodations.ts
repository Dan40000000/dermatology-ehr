import type { PatientAccessibilityProfile } from '../types';

export const ACCESSIBILITY_COMMUNICATION_OPTIONS = [
  { value: 'large_print', label: 'Large print materials' },
  { value: 'electronic_forms', label: 'Accessible electronic forms' },
  { value: 'screen_reader', label: 'Screen reader friendly documents' },
  { value: 'qualified_interpreter', label: 'Qualified interpreter' },
  { value: 'captions', label: 'Captions for audio/video' },
  { value: 'relay_service', label: 'Relay service' },
  { value: 'plain_language', label: 'Plain language review' },
  { value: 'other', label: 'Other communication support' },
] as const;

export const ACCESSIBILITY_EQUIPMENT_OPTIONS = [
  { value: 'height_adjustable_exam_table', label: 'Height-adjustable exam table' },
  { value: 'patient_lift', label: 'Patient lift or transfer support' },
  { value: 'wheelchair_scale', label: 'Wheelchair-accessible scale' },
  { value: 'accessible_mohs_room', label: 'Accessible procedure room' },
  { value: 'wide_turning_space', label: 'Wide turning space' },
  { value: 'accessible_restroom_route', label: 'Accessible restroom route' },
  { value: 'other', label: 'Other equipment or room setup' },
] as const;

const COMMUNICATION_LABELS = new Map(
  ACCESSIBILITY_COMMUNICATION_OPTIONS.map((option) => [option.value, option.label]),
);

const EQUIPMENT_LABELS = new Map(
  ACCESSIBILITY_EQUIPMENT_OPTIONS.map((option) => [option.value, option.label]),
);

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.round(numeric);
}

export function normalizeAccessibilityProfile(raw: unknown): PatientAccessibilityProfile {
  if (!raw) return {};

  let source: Record<string, any>;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = { notes: raw };
    }
  } else if (typeof raw === 'object') {
    source = raw as Record<string, any>;
  } else {
    return {};
  }

  const supportPerson =
    source.supportPerson && typeof source.supportPerson === 'object'
      ? source.supportPerson
      : {};

  return {
    communicationSupport: normalizeStringArray(source.communicationSupport),
    interpreterNeeded: normalizeBoolean(source.interpreterNeeded),
    interpreterLanguage: String(source.interpreterLanguage || '').trim() || undefined,
    mobilityAssistance: normalizeBoolean(source.mobilityAssistance),
    accessibleRoomRequired: normalizeBoolean(source.accessibleRoomRequired),
    accessibleEquipment: normalizeStringArray(source.accessibleEquipment),
    serviceAnimal: normalizeBoolean(source.serviceAnimal),
    extendedVisit: normalizeBoolean(source.extendedVisit),
    extraVisitMinutes: normalizePositiveInteger(source.extraVisitMinutes),
    sensoryConsiderations: String(source.sensoryConsiderations || '').trim() || undefined,
    notes: String(source.notes || '').trim() || undefined,
    lastReviewedAt: String(source.lastReviewedAt || '').trim() || undefined,
    lastReviewedBy: String(source.lastReviewedBy || '').trim() || undefined,
    supportPerson: {
      name: String(supportPerson.name || '').trim() || undefined,
      relationship: String(supportPerson.relationship || '').trim() || undefined,
      phone: String(supportPerson.phone || '').trim() || undefined,
      communicationNeeds: String(supportPerson.communicationNeeds || '').trim() || undefined,
    },
  };
}

export function hasAccessibilityNeeds(raw: unknown): boolean {
  const profile = normalizeAccessibilityProfile(raw);
  return getAccessibilityNeedLabels(profile).length > 0;
}

export function getAccessibilityNeedLabels(raw: unknown): string[] {
  const profile = normalizeAccessibilityProfile(raw);
  const labels: string[] = [];

  if (profile.interpreterNeeded) {
    labels.push(profile.interpreterLanguage ? `${profile.interpreterLanguage} interpreter` : 'Interpreter needed');
  }

  for (const support of profile.communicationSupport || []) {
    labels.push(COMMUNICATION_LABELS.get(support as any) || support);
  }

  if (profile.mobilityAssistance) labels.push('Mobility assistance');
  if (profile.accessibleRoomRequired) labels.push('Accessible room');

  for (const equipment of profile.accessibleEquipment || []) {
    labels.push(EQUIPMENT_LABELS.get(equipment as any) || equipment);
  }

  if (profile.serviceAnimal) labels.push('Service animal');
  if (profile.extendedVisit) {
    labels.push(profile.extraVisitMinutes ? `Extra ${profile.extraVisitMinutes} min` : 'Extended visit');
  }
  if (profile.sensoryConsiderations) labels.push('Sensory consideration');
  if (profile.supportPerson?.communicationNeeds) labels.push('Companion communication need');
  if (profile.notes) labels.push('Accommodation note');

  return Array.from(new Set(labels));
}

export function getAccessibilitySummary(raw: unknown, limit = 4): string {
  const labels = getAccessibilityNeedLabels(raw);
  if (labels.length === 0) return 'No access needs documented';
  const visible = labels.slice(0, limit);
  const remainder = labels.length - visible.length;
  return remainder > 0 ? `${visible.join(', ')} +${remainder} more` : visible.join(', ');
}

export function getRecommendedAppointmentDuration(baseMinutes: number, raw: unknown): number {
  const profile = normalizeAccessibilityProfile(raw);
  const extra = profile.extendedVisit ? profile.extraVisitMinutes || 15 : 0;
  return Math.max(baseMinutes, baseMinutes + extra);
}

export function buildVisitPrepChecklist(raw: unknown): string[] {
  const profile = normalizeAccessibilityProfile(raw);
  const items: string[] = [];

  if (profile.interpreterNeeded) {
    items.push(profile.interpreterLanguage ? `Confirm ${profile.interpreterLanguage} interpreter` : 'Confirm interpreter');
  }
  if (profile.accessibleRoomRequired) items.push('Assign accessible exam room');
  if (profile.accessibleEquipment?.length) {
    items.push(`Prepare: ${profile.accessibleEquipment.map((item) => EQUIPMENT_LABELS.get(item as any) || item).join(', ')}`);
  }
  if (profile.mobilityAssistance) items.push('Plan safe transfer or mobility assistance');
  if (profile.serviceAnimal) items.push('Notify team that service animal may accompany patient');
  if (profile.extendedVisit) {
    items.push(profile.extraVisitMinutes ? `Hold ${profile.extraVisitMinutes} extra minutes` : 'Hold extra visit time');
  }
  if (profile.communicationSupport?.length) {
    items.push(`Prepare communication support: ${profile.communicationSupport.map((item) => COMMUNICATION_LABELS.get(item as any) || item).join(', ')}`);
  }
  if (profile.supportPerson?.communicationNeeds) {
    items.push(`Companion communication: ${profile.supportPerson.communicationNeeds}`);
  }
  if (profile.sensoryConsiderations) items.push(`Sensory consideration: ${profile.sensoryConsiderations}`);
  if (profile.notes) items.push(`Note: ${profile.notes}`);

  return items;
}
