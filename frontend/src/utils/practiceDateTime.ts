const DEFAULT_PRACTICE_TIME_ZONE = 'America/Denver';

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
