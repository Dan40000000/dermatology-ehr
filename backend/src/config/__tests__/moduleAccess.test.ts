import { canAccessModule, moduleAccess } from '../moduleAccess';

describe('module access', () => {
  it('allows roles configured for a module', () => {
    expect(canAccessModule('admin', 'home')).toBe(true);
    expect(canAccessModule('provider', 'notes')).toBe(true);
    expect(canAccessModule('ma', 'ambient_scribe')).toBe(true);
    expect(canAccessModule('billing', 'coding_review')).toBe(true);
    expect(canAccessModule('front_desk', 'tasks')).toBe(true);
  });

  it('denies roles that are not configured', () => {
    expect(canAccessModule('front_desk', 'admin')).toBe(false);
    expect(canAccessModule('front_desk', 'financials')).toBe(false);
    expect(canAccessModule('front_desk', 'claims')).toBe(true);
    expect(canAccessModule('compliance_officer', 'financials')).toBe(true);
    expect(canAccessModule('billing', 'analytics')).toBe(false);
    expect(canAccessModule('front_desk', 'coding_review')).toBe(false);
    expect(canAccessModule(undefined, 'home')).toBe(false);
  });

  it('keeps module access definitions aligned with roles', () => {
    const roles = new Set([
      'admin',
      'provider',
      'ma',
      'front_desk',
      'billing',
      'nurse',
      'manager',
      'scheduler',
      'compliance_officer',
      'staff',
      'hr',
    ]);
    Object.values(moduleAccess).forEach(roleList => {
      roleList.forEach(role => {
        expect(roles.has(role)).toBe(true);
      });
    });
  });
});
