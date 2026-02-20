import { canAccessModule, moduleAccess } from '../moduleAccess';

describe('module access', () => {
  it('allows roles configured for a module', () => {
    expect(canAccessModule('admin', 'home')).toBe(true);
    expect(canAccessModule('provider', 'notes')).toBe(true);
    expect(canAccessModule('ma', 'ambient_scribe')).toBe(true);
    expect(canAccessModule('front_desk', 'tasks')).toBe(true);
  });

  it('denies roles that are not configured', () => {
    expect(canAccessModule('front_desk', 'admin')).toBe(false);
    expect(canAccessModule(undefined, 'home')).toBe(false);
  });

  it('keeps module access definitions aligned with roles', () => {
    const roles = new Set(['admin', 'provider', 'ma', 'front_desk']);
    Object.values(moduleAccess).forEach(roleList => {
      roleList.forEach(role => {
        expect(roles.has(role)).toBe(true);
      });
    });
  });
});
