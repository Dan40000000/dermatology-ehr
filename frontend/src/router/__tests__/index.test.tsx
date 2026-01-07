import { describe, it, expect } from 'vitest';

import { router } from '../index';

describe('router', () => {
  it('defines core routes', () => {
    const routes = (router as any).routes as Array<{ path?: string; children?: any[] }>;
    expect(Array.isArray(routes)).toBe(true);

    const loginRoute = routes.find((route) => route.path === '/login');
    expect(loginRoute).toBeTruthy();

    const rootRoute = routes.find((route) => route.path === '/');
    expect(rootRoute?.children).toBeTruthy();
    const childPaths = (rootRoute?.children || []).map((child: any) => child.path);
    expect(childPaths).toEqual(expect.arrayContaining(['home', 'schedule', 'patients', 'notes', 'admin']));
  });
});
