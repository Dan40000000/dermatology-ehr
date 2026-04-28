export interface DowntimePrimaryDevice {
  deviceId: string;
  label: string | null;
  registeredAt: string | null;
  registeredBy: string | null;
  lastSeenAt: string | null;
  lastPacketSavedAt: string | null;
  lastPacketDate: string | null;
}

interface DowntimePrimaryDeviceRow {
  downtimePrimaryDeviceId?: string | null;
  downtimePrimaryDeviceLabel?: string | null;
  downtimePrimaryDeviceRegisteredAt?: string | null;
  downtimePrimaryDeviceRegisteredBy?: string | null;
  downtimePrimaryDeviceLastSeenAt?: string | null;
  downtimePrimaryDeviceLastPacketSavedAt?: string | null;
  downtimePrimaryDeviceLastPacketDate?: string | null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapDowntimePrimaryDevice(
  row: DowntimePrimaryDeviceRow | null | undefined,
): DowntimePrimaryDevice | null {
  const deviceId = normalizeString(row?.downtimePrimaryDeviceId);
  if (!deviceId) {
    return null;
  }

  return {
    deviceId,
    label: normalizeString(row?.downtimePrimaryDeviceLabel),
    registeredAt: normalizeString(row?.downtimePrimaryDeviceRegisteredAt),
    registeredBy: normalizeString(row?.downtimePrimaryDeviceRegisteredBy),
    lastSeenAt: normalizeString(row?.downtimePrimaryDeviceLastSeenAt),
    lastPacketSavedAt: normalizeString(row?.downtimePrimaryDeviceLastPacketSavedAt),
    lastPacketDate: normalizeString(row?.downtimePrimaryDeviceLastPacketDate),
  };
}
