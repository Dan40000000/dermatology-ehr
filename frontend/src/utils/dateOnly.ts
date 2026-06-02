const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function buildLocalDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function parseDateOnly(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(ISO_DATE_PREFIX);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildLocalDate(Number(year), Number(month), Number(day));
  }

  const usMatch = trimmed.match(US_DATE);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return buildLocalDate(Number(year), Number(month), Number(day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function formatDateOnly(
  value?: string | Date | null,
  locale: string | string[] = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const date = parseDateOnly(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function calculateAgeFromDateOnly(value?: string | Date | null, referenceDate = new Date()): number | null {
  const birthDate = parseDateOnly(value);
  if (!birthDate) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

export function getDateOnlySortValue(value?: string | Date | null): number {
  return parseDateOnly(value)?.getTime() ?? 0;
}
