export const DEFAULT_PRACTICE_TIME_ZONE = 'America/Denver';
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

export function getPracticeDateKey(
  value: string | Date,
  timeZone?: string | null
): string | null {
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
    return isValidDateKey(value) ? value : null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return getDateKeyInPracticeTimeZone(date, timeZone);
}

export function getDayOfWeekForDateKey(dateKey: string): number | null {
  if (!isValidDateKey(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function getPracticeDateTime(
  dateKey: string,
  timeValue: string,
  timeZone?: string | null
): Date | null {
  if (!isValidDateKey(dateKey) || !/^\d{2}:\d{2}$/.test(timeValue)) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(targetWallTime);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getDateTimePartsInPracticeTimeZone(candidate, timeZone);
    const observedWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );
    const correctionMs = targetWallTime - observedWallTime;
    if (correctionMs === 0) return candidate;
    candidate = new Date(candidate.getTime() + correctionMs);
  }

  const finalParts = getDateTimePartsInPracticeTimeZone(candidate, timeZone);
  return finalParts.year === year &&
    finalParts.month === month &&
    finalParts.day === day &&
    finalParts.hour === hour &&
    finalParts.minute === minute
    ? candidate
    : null;
}

export function getCivilDayDifference(earlierDateKey: string, laterDateKey: string): number | null {
  if (!isValidDateKey(earlierDateKey) || !isValidDateKey(laterDateKey)) return null;
  const [earlierYear, earlierMonth, earlierDay] = earlierDateKey.split('-').map(Number);
  const [laterYear, laterMonth, laterDay] = laterDateKey.split('-').map(Number);
  const earlierUtc = Date.UTC(earlierYear, earlierMonth - 1, earlierDay, 12);
  const laterUtc = Date.UTC(laterYear, laterMonth - 1, laterDay, 12);
  return Math.round((laterUtc - earlierUtc) / 86_400_000);
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  if (!isValidDateKey(dateKey) || !Number.isFinite(days)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Math.trunc(days), 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isValidDateKey(dateKey: string): boolean {
  if (!ISO_DATE_PATTERN.test(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function getConfiguredClinicBusinessDate(): string | null {
  const envDate = import.meta.env.VITE_CLINIC_BUSINESS_DATE;
  const candidates = [
    typeof window !== 'undefined' ? window.localStorage.getItem('clinic:businessDate') : null,
    typeof window !== 'undefined' ? window.sessionStorage.getItem('clinic:businessDate') : null,
    typeof envDate === 'string' ? envDate : null,
  ];

  return candidates.find(
    (candidate) => candidate && getPracticeDateKey(candidate) === candidate
  ) || null;
}

export function getClinicBusinessDate(value: Date = new Date(), timeZone?: string | null): string {
  return getConfiguredClinicBusinessDate() || getDateKeyInPracticeTimeZone(value, timeZone);
}

export function setClinicBusinessDate(dateKey: string): boolean {
  if (getPracticeDateKey(dateKey) !== dateKey) return false;

  try {
    window.localStorage.setItem('clinic:businessDate', dateKey);
    return true;
  } catch {
    return false;
  }
}

export function getDayOffsetFromClinicToday(dateKey: string, timeZone?: string | null): number {
  const baseDateKey = getDateKeyInPracticeTimeZone(new Date(), timeZone);
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
  return getTimePartsInPracticeTimeZone(value, timeZone).hour;
}

export function getTimePartsInPracticeTimeZone(
  value: string | Date,
  timeZone?: string | null
): { hour: number; minute: number } {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getFormatter(timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? Number.NaN);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? Number.NaN);
  return {
    hour: Number.isNaN(hour) ? 0 : hour,
    minute: Number.isNaN(minute) ? 0 : minute,
  };
}

function getDateTimePartsInPracticeTimeZone(
  value: string | Date,
  timeZone?: string | null
): { year: number; month: number; day: number; hour: number; minute: number } {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const numberPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);

  return {
    year: numberPart('year'),
    month: numberPart('month'),
    day: numberPart('day'),
    hour: numberPart('hour'),
    minute: numberPart('minute'),
  };
}
