const DEFAULT_PRACTICE_TIME_ZONE = 'America/Denver';
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolvePracticeTimeZone(timeZone?: string | null): string {
  const candidate = timeZone || DEFAULT_PRACTICE_TIME_ZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_PRACTICE_TIME_ZONE;
  }
}

function getFormatter(
  timeZone: string | undefined | null,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: resolvePracticeTimeZone(timeZone),
  });
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateKeyInPracticeTimeZone(value: Date = new Date(), timeZone?: string | null): string {
  const parts = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : formatLocalDateKey(value);
}

export function getConfiguredClinicBusinessDate(): string | null {
  const envDate = import.meta.env.VITE_CLINIC_BUSINESS_DATE;
  const candidates = [
    typeof window !== 'undefined' ? window.localStorage.getItem('clinic:businessDate') : null,
    typeof window !== 'undefined' ? window.sessionStorage.getItem('clinic:businessDate') : null,
    typeof envDate === 'string' ? envDate : null,
  ];

  return candidates.find((candidate) => candidate && ISO_DATE_PATTERN.test(candidate)) || null;
}

export function getClinicBusinessDate(value: Date = new Date(), timeZone?: string | null): string {
  return getConfiguredClinicBusinessDate() || getDateKeyInPracticeTimeZone(value, timeZone);
}

export function setClinicBusinessDate(dateKey: string): boolean {
  if (!ISO_DATE_PATTERN.test(dateKey)) return false;

  try {
    window.localStorage.setItem('clinic:businessDate', dateKey);
    return true;
  } catch {
    return false;
  }
}

export function getDayOffsetFromClinicToday(dateKey: string): number {
  const baseDateKey = getDateKeyInPracticeTimeZone(new Date());
  const target = new Date(`${dateKey}T12:00:00`);
  const base = new Date(`${baseDateKey}T12:00:00`);
  const diffMs = target.getTime() - base.getTime();
  if (!Number.isFinite(diffMs)) return 0;
  return Math.round(diffMs / 86_400_000);
}

export function formatDateInPracticeTimeZone(
  value: string | Date,
  timeZone?: string | null,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }
): string {
  const date = value instanceof Date ? value : new Date(value);
  return getFormatter(timeZone, options).format(date);
}

export function formatTimeInPracticeTimeZone(
  value: string | Date,
  timeZone?: string | null,
  options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
): string {
  const date = value instanceof Date ? value : new Date(value);
  return getFormatter(timeZone, options).format(date);
}

export function formatDateTimeInPracticeTimeZone(
  value: string | Date,
  timeZone?: string | null
): string {
  const date = value instanceof Date ? value : new Date(value);
  return getFormatter(timeZone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function getHourInPracticeTimeZone(value: string | Date, timeZone?: string | null): number {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getFormatter(timeZone, {
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? Number.NaN);
  return Number.isNaN(hour) ? 0 : hour;
}
