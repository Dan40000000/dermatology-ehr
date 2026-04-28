const DEFAULT_PRACTICE_TIME_ZONE = "America/Denver";

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getPracticeTimeZone(): string {
  const configured =
    process.env.PATIENT_SCHEDULING_TIME_ZONE ||
    process.env.APPOINTMENT_WINDOW_TIME_ZONE ||
    DEFAULT_PRACTICE_TIME_ZONE;

  return isValidTimeZone(configured) ? configured : DEFAULT_PRACTICE_TIME_ZONE;
}

function getDatePartsInTimeZone(value: Date | string, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to resolve practice date parts");
  }

  return { year, month, day };
}

export function getDateKeyInTimeZone(value: Date | string, timeZone = getPracticeTimeZone()): string {
  const parts = getDatePartsInTimeZone(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDateKey(dateKey: string) {
  const [yearPart, monthPart, dayPart] = dateKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid practice date key: ${dateKey}`);
  }

  return { year, month, day };
}

export function getWeekdayForDateKey(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  const nextYear = value.getUTCFullYear();
  const nextMonth = String(value.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(value.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? Number.NaN);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? Number.NaN);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? Number.NaN);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? Number.NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? Number.NaN);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? Number.NaN);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
}

export function getUtcInstantForPracticeDateTime(
  dateKey: string,
  hour: number,
  minute: number,
  timeZone = getPracticeTimeZone(),
): Date {
  const { year, month, day } = parseDateKey(dateKey);
  let utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  let offset = getTimeZoneOffsetMs(utcDate, timeZone);
  utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset);

  const adjustedOffset = getTimeZoneOffsetMs(utcDate, timeZone);
  if (adjustedOffset !== offset) {
    utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - adjustedOffset);
  }

  return utcDate;
}

export function getUtcRangeForPracticeDate(dateKey: string, timeZone = getPracticeTimeZone()) {
  const start = getUtcInstantForPracticeDateTime(dateKey, 0, 0, timeZone);
  const end = getUtcInstantForPracticeDateTime(addDaysToDateKey(dateKey, 1), 0, 0, timeZone);
  return { start, end };
}
