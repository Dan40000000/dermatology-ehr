import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => {
  const i18n = {
    language: 'en',
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  };

  return {
    useTranslation: () => ({
      t: (key: string, defaultValue?: string) => defaultValue ?? key,
      i18n,
    }),
    Trans: ({ children }: { children: ReactNode }) => children,
    I18nextProvider: ({ children }: { children: ReactNode }) => children,
    initReactI18next: {
      type: '3rdParty',
      init: () => undefined,
    },
  };
});

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;
