export type ScribeSpeakerRole = 'provider' | 'patient' | 'unknown';

export interface ScribeTranscriptSegmentLike {
  speaker?: string;
  speakerRole?: ScribeSpeakerRole;
  text?: string;
}

const stripSpeakerPrefix = (text: string): string =>
  text.replace(/^\s*(doctor|provider|physician|clinician|dr\.?|patient|pt|nurse|ma)\s*:\s*/i, '').trim();

export const inferScribeSpeakerRole = (text?: string): ScribeSpeakerRole => {
  const source = text || '';
  const stripped = stripSpeakerPrefix(source);
  const normalized = stripped.toLowerCase();

  if (!normalized) {
    return 'unknown';
  }

  if (/^\s*(doctor|provider|physician|clinician|dr\.?|nurse|ma)\s*:/i.test(source)) {
    return 'provider';
  }

  if (/^\s*(patient|pt)\s*:/i.test(source)) {
    return 'patient';
  }

  if (/\b(i have|i've had|i noticed|my |it started|it hurts|i feel|i get|is that cancer|okay|got it|thanks)\b/i.test(stripped)) {
    return 'patient';
  }

  if (/\b(what brought|have you|do you|let me|on exam|i can see|i recommend|we will|we'll|biopsy|cryotherapy|liquid nitrogen|follow up|call us|wound care)\b/i.test(stripped)) {
    return 'provider';
  }

  return 'unknown';
};

export const resolveScribeSpeakerRole = (segment: ScribeTranscriptSegmentLike): ScribeSpeakerRole => {
  if (segment.speakerRole === 'provider' || segment.speakerRole === 'patient') {
    return segment.speakerRole;
  }

  const inferred = inferScribeSpeakerRole(segment.text);
  if (inferred !== 'unknown') {
    return inferred;
  }

  const normalizedSpeaker = (segment.speaker || '').trim().toLowerCase();
  if (/^(doctor|provider|physician|clinician|dr\.?|nurse|ma)\b/.test(normalizedSpeaker)) {
    return 'provider';
  }
  if (/^(patient|pt)\b/.test(normalizedSpeaker)) {
    return 'patient';
  }

  return 'unknown';
};

export const getScribeSpeakerLabel = (segment: ScribeTranscriptSegmentLike, index?: number): string => {
  const role = resolveScribeSpeakerRole(segment);
  if (role === 'provider') {
    return 'Clinician';
  }
  if (role === 'patient') {
    return 'Patient';
  }
  return typeof index === 'number' ? `Speaker ${index + 1}` : 'Speaker';
};

export const getScribeSpeakerToneClass = (segment: ScribeTranscriptSegmentLike): string => {
  const role = resolveScribeSpeakerRole(segment);
  if (role === 'provider') {
    return 'bg-blue-50 border border-blue-200';
  }
  if (role === 'patient') {
    return 'bg-green-50 border border-green-200';
  }
  return 'bg-gray-50 border border-gray-200';
};
