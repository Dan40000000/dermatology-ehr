import { describe, it, expect } from 'vitest';
import { canAccessModule, getModuleForPath } from '../moduleAccess';

describe('moduleAccess', () => {
  it('allows admin to access admin module', () => {
    expect(canAccessModule('admin', 'admin')).toBe(true);
  });

  it('treats owner aliases as admin-equivalent access', () => {
    expect(canAccessModule('owner', 'admin')).toBe(true);
    expect(canAccessModule('practice_owner', 'financials')).toBe(true);
  });

  it('hides analytics from providers', () => {
    expect(canAccessModule('provider', 'analytics')).toBe(false);
  });

  it('hides analytics from billing while keeping financial dashboards', () => {
    expect(canAccessModule('billing', 'analytics')).toBe(false);
    expect(canAccessModule('billing', 'financials')).toBe(true);
  });

  it('keeps front desk out of financial dashboards while preserving claims access', () => {
    expect(canAccessModule('front_desk', 'financials')).toBe(false);
    expect(canAccessModule('front_desk', 'claims')).toBe(true);
    expect(canAccessModule('front_desk', 'clearinghouse')).toBe(true);
  });

  it('denies front desk access to quality', () => {
    expect(canAccessModule('front_desk', 'quality')).toBe(false);
  });

  it('allows access when any effective role matches', () => {
    expect(canAccessModule(['provider', 'admin'], 'admin')).toBe(true);
  });

  it('maps path to module key', () => {
    expect(getModuleForPath('/patients/123')).toBe('patients');
    expect(getModuleForPath('/front-desk')).toBe('office_flow');
    expect(getModuleForPath('/biopsies')).toBe('labs');
  });

  it('maps legacy registry and recall routes into reminders access', () => {
    expect(getModuleForPath('/registry')).toBe('reminders');
    expect(getModuleForPath('/recalls')).toBe('reminders');
  });

  it('maps ambient scribe route and blocks front desk role', () => {
    expect(getModuleForPath('/ambient-scribe')).toBe('ambient_scribe');
    expect(canAccessModule('front_desk', 'ambient_scribe')).toBe(false);
    expect(canAccessModule('provider', 'ambient_scribe')).toBe(true);
  });

  it('maps AI assistant routes and limits standalone access to admin and providers', () => {
    expect(getModuleForPath('/ai-assistant')).toBe('ai_assistant');
    expect(getModuleForPath('/clinical-copilot')).toBe('ai_assistant');
    expect(canAccessModule('admin', 'ai_assistant')).toBe(true);
    expect(canAccessModule('provider', 'ai_assistant')).toBe(true);
    expect(canAccessModule('pa', 'ai_assistant')).toBe(true);
    expect(canAccessModule('front_desk', 'ai_assistant')).toBe(false);
    expect(canAccessModule('ma', 'ai_assistant')).toBe(false);
  });

  it('blocks front desk access from clinical modules', () => {
    expect(canAccessModule('front_desk', 'notes')).toBe(false);
    expect(canAccessModule('front_desk', 'orders')).toBe(false);
    expect(canAccessModule('front_desk', 'rx')).toBe(false);
    expect(canAccessModule('front_desk', 'labs')).toBe(false);
    expect(canAccessModule('front_desk', 'photos')).toBe(false);
    expect(canAccessModule('front_desk', 'body_diagram')).toBe(false);
  });

  it('normalizes role aliases for module access decisions', () => {
    expect(canAccessModule('medical_assistant', 'labs')).toBe(true);
    expect(canAccessModule('receptionist', 'schedule')).toBe(true);
    expect(canAccessModule('receptionist', 'notes')).toBe(false);
  });

  it('keeps non-clinical staff constrained to non-clinical modules', () => {
    expect(canAccessModule('staff', 'home')).toBe(true);
    expect(canAccessModule('staff', 'tasks')).toBe(true);
    expect(canAccessModule('staff', 'notes')).toBe(false);
  });
});
