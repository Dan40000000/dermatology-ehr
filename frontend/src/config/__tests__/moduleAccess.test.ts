import { describe, it, expect } from 'vitest';
import { canAccessModule, getModuleForPath } from '../moduleAccess';

describe('moduleAccess', () => {
  it('allows admin to access admin module', () => {
    expect(canAccessModule('admin', 'admin')).toBe(true);
  });

  it('denies front desk access to quality', () => {
    expect(canAccessModule('front_desk', 'quality')).toBe(false);
  });

  it('maps path to module key', () => {
    expect(getModuleForPath('/patients/123')).toBe('patients');
  });
});
