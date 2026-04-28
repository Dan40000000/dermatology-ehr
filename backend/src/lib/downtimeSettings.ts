export type DowntimeDeviceProfile = "auto" | "ipad" | "desktop";

export interface DowntimeSettings {
  enabled: boolean;
  packetTime: string;
  deviceProfile: DowntimeDeviceProfile;
  includeDob: boolean;
  includePhone: boolean;
  includeInsurance: boolean;
}

export const DEFAULT_DOWNTIME_SETTINGS: DowntimeSettings = {
  enabled: false,
  packetTime: "12:00",
  deviceProfile: "auto",
  includeDob: true,
  includePhone: true,
  includeInsurance: true,
};

interface DowntimeSettingsRow {
  downtimePacketsEnabled?: boolean | null;
  downtimePacketTime?: string | null;
  downtimeDeviceProfile?: string | null;
  downtimeIncludeDob?: boolean | null;
  downtimeIncludePhone?: boolean | null;
  downtimeIncludeInsurance?: boolean | null;
}

function normalizePacketTime(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_DOWNTIME_SETTINGS.packetTime;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : DEFAULT_DOWNTIME_SETTINGS.packetTime;
}

function normalizeDeviceProfile(value: unknown): DowntimeDeviceProfile {
  if (value === "ipad" || value === "desktop" || value === "auto") {
    return value;
  }
  return DEFAULT_DOWNTIME_SETTINGS.deviceProfile;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function mapDowntimeSettings(row: DowntimeSettingsRow | null | undefined): DowntimeSettings {
  return {
    enabled: normalizeBoolean(row?.downtimePacketsEnabled, DEFAULT_DOWNTIME_SETTINGS.enabled),
    packetTime: normalizePacketTime(row?.downtimePacketTime),
    deviceProfile: normalizeDeviceProfile(row?.downtimeDeviceProfile),
    includeDob: normalizeBoolean(row?.downtimeIncludeDob, DEFAULT_DOWNTIME_SETTINGS.includeDob),
    includePhone: normalizeBoolean(row?.downtimeIncludePhone, DEFAULT_DOWNTIME_SETTINGS.includePhone),
    includeInsurance: normalizeBoolean(row?.downtimeIncludeInsurance, DEFAULT_DOWNTIME_SETTINGS.includeInsurance),
  };
}

export function parseDowntimeSettingsInput(input: unknown): DowntimeSettings {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_DOWNTIME_SETTINGS };
  }

  const source = input as Record<string, unknown>;
  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_DOWNTIME_SETTINGS.enabled),
    packetTime: normalizePacketTime(source.packetTime),
    deviceProfile: normalizeDeviceProfile(source.deviceProfile),
    includeDob: normalizeBoolean(source.includeDob, DEFAULT_DOWNTIME_SETTINGS.includeDob),
    includePhone: normalizeBoolean(source.includePhone, DEFAULT_DOWNTIME_SETTINGS.includePhone),
    includeInsurance: normalizeBoolean(source.includeInsurance, DEFAULT_DOWNTIME_SETTINGS.includeInsurance),
  };
}
