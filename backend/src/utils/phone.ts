/**
 * Phone number utility functions for SMS messaging
 * Handles E.164 format conversion and validation
 */

/**
 * Format a phone number to E.164 format (+15551234567)
 * Supports various input formats:
 * - (555) 123-4567
 * - 555-123-4567
 * - 5551234567
 * - +15551234567
 *
 * @param phoneNumber - Phone number in any common format
 * @param defaultCountryCode - Default country code (default: +1 for US)
 * @returns E.164 formatted phone number or null if invalid
 */
export function formatPhoneE164(phoneNumber: string | null | undefined, defaultCountryCode: string = '+1'): string | null {
  if (!phoneNumber) {
    return null;
  }

  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // If empty after cleanup, invalid
  if (digitsOnly.length === 0) {
    return null;
  }

  // Handle different digit lengths
  if (digitsOnly.length === 10) {
    // US number without country code: 5551234567 -> +15551234567
    return `${defaultCountryCode}${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    // US number with country code: 15551234567 -> +15551234567
    return `+${digitsOnly}`;
  } else if (digitsOnly.length === 11) {
    // International number: assume country code is first digit(s)
    return `+${digitsOnly}`;
  } else if (digitsOnly.length > 11) {
    // Already includes country code
    return `+${digitsOnly}`;
  }

  // Invalid length
  return null;
}

/**
 * Validate if a phone number is in valid E.164 format
 * @param phoneNumber - Phone number to validate
 * @returns true if valid E.164 format
 */
export function isValidE164(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) {
    return false;
  }

  // E.164 format: +[country code][number]
  // Total length: 1-15 digits (including country code)
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Format a phone number for display (US format)
 * +15551234567 -> (555) 123-4567
 *
 * @param phoneNumber - E.164 formatted phone number
 * @returns Human-readable phone number
 */
export function formatPhoneDisplay(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) {
    return '';
  }

  // Extract digits
  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // US format (11 digits starting with 1)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    const areaCode = digitsOnly.slice(1, 4);
    const exchange = digitsOnly.slice(4, 7);
    const lineNumber = digitsOnly.slice(7, 11);
    return `(${areaCode}) ${exchange}-${lineNumber}`;
  }

  // 10-digit US number
  if (digitsOnly.length === 10) {
    const areaCode = digitsOnly.slice(0, 3);
    const exchange = digitsOnly.slice(3, 6);
    const lineNumber = digitsOnly.slice(6, 10);
    return `(${areaCode}) ${exchange}-${lineNumber}`;
  }

  // Return as-is if not recognized format
  return phoneNumber;
}

/**
 * Sanitize phone number by removing invalid characters
 * Preserves only digits, +, spaces, hyphens, and parentheses
 *
 * @param phoneNumber - Raw phone number input
 * @returns Sanitized phone number
 */
export function sanitizePhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) {
    return '';
  }

  // Keep only valid phone number characters
  return phoneNumber.replace(/[^0-9+\s\-()]/g, '').trim();
}

/**
 * Extract country code from E.164 phone number
 * +15551234567 -> +1
 *
 * @param phoneNumber - E.164 formatted phone number
 * @returns Country code with + prefix
 */
export function extractCountryCode(phoneNumber: string): string {
  if (!phoneNumber || !phoneNumber.startsWith('+')) {
    return '+1'; // Default to US
  }

  // Extract first 1-3 digits after +
  const match = phoneNumber.match(/^\+(\d{1,3})/);
  return match ? `+${match[1]}` : '+1';
}

/**
 * Check if two phone numbers are the same (ignoring formatting)
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if numbers are the same
 */
export function arePhoneNumbersEqual(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
  if (!phone1 || !phone2) {
    return false;
  }

  const formatted1 = formatPhoneE164(phone1);
  const formatted2 = formatPhoneE164(phone2);

  return formatted1 === formatted2;
}

/**
 * Validate and format phone number for SMS sending
 * Throws error if invalid
 *
 * @param phoneNumber - Phone number to validate and format
 * @returns E.164 formatted phone number
 * @throws Error if phone number is invalid
 */
export function validateAndFormatPhone(phoneNumber: string | null | undefined): string {
  const formatted = formatPhoneE164(phoneNumber);

  if (!formatted || !isValidE164(formatted)) {
    throw new Error(`Invalid phone number format: ${phoneNumber}`);
  }

  return formatted;
}

/**
 * Check if phone number is a US mobile number
 * Basic validation - checks if it's a 10-digit US number
 * Note: This is a simplified check; proper validation would require a carrier lookup
 *
 * @param phoneNumber - Phone number to check
 * @returns true if likely a US mobile number
 */
export function isLikelyUSMobile(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) {
    return false;
  }

  const formatted = formatPhoneE164(phoneNumber);
  if (!formatted) {
    return false;
  }

  // US mobile numbers start with +1 and have 10 digits after
  return formatted.startsWith('+1') && formatted.length === 12;
}

/**
 * Mask phone number for display (privacy)
 * +15551234567 -> +1 (555) ***-4567
 *
 * @param phoneNumber - Phone number to mask
 * @returns Masked phone number
 */
export function maskPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) {
    return '';
  }

  const display = formatPhoneDisplay(phoneNumber);

  // Replace middle digits with asterisks
  // (555) 123-4567 -> (555) ***-4567
  return display.replace(/(\(\d{3}\)\s)\d{3}(-\d{4})/, '$1***$2');
}
