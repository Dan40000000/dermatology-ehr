const STORAGE_KEY = 'downtime:primary-device';

export interface DowntimeBrowserDevice {
  deviceId: string;
  label: string;
  platform: string;
  browser: string;
  userAgent: string;
  createdAt: string;
}

function inferBrowser(userAgent: string): string {
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return 'Safari';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  return 'Browser';
}

function inferPlatform(userAgent: string, platform: string): string {
  const source = `${platform} ${userAgent}`;
  if (/iPad/i.test(source)) return 'iPad';
  if (/iPhone/i.test(source)) return 'iPhone';
  if (/Android/i.test(source)) return 'Android';
  if (/Mac/i.test(source)) return 'Mac';
  if (/Win/i.test(source)) return 'Windows';
  if (/Linux/i.test(source)) return 'Linux';
  return 'Computer';
}

function buildDefaultLabel(browser: string, platform: string): string {
  return `${browser} on ${platform}`;
}

function createFallbackId(): string {
  return `dt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDeviceRecord(): DowntimeBrowserDevice {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const rawPlatform = typeof navigator !== 'undefined' ? navigator.platform || '' : '';
  const browser = inferBrowser(userAgent);
  const platform = inferPlatform(userAgent, rawPlatform);
  return {
    deviceId:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : createFallbackId(),
    label: buildDefaultLabel(browser, platform),
    platform,
    browser,
    userAgent,
    createdAt: new Date().toISOString(),
  };
}

export function getOrCreateDowntimeBrowserDevice(): DowntimeBrowserDevice {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return createDeviceRecord();
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DowntimeBrowserDevice>;
      if (parsed.deviceId && parsed.label) {
        return {
          deviceId: parsed.deviceId,
          label: parsed.label,
          platform: parsed.platform || inferPlatform(parsed.userAgent || '', ''),
          browser: parsed.browser || inferBrowser(parsed.userAgent || ''),
          userAgent: parsed.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''),
          createdAt: parsed.createdAt || new Date().toISOString(),
        };
      }
    } catch {
      // ignore malformed cached device record
    }
  }

  const created = createDeviceRecord();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
  return created;
}

export function formatDowntimeDeviceShortId(deviceId: string): string {
  return deviceId.length <= 8 ? deviceId : deviceId.slice(0, 8).toUpperCase();
}
