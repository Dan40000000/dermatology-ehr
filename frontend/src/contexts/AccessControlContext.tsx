import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAccessSettings } from '../api';
import {
  canAccessCommandCenterSection as canAccessCommandCenterSectionWithSettings,
  canAccessModuleWithSettings,
  resolveCommandCenterAccess,
  resolveModuleAccess,
  type AccessSettingsPayload,
  type CommandCenterSectionKey,
  type ModuleKey,
  type Role,
} from '../config/moduleAccess';
import { getEffectiveRoles } from '../utils/roles';
import { useAuth } from './AuthContext';

interface AccessControlContextValue {
  settings: AccessSettingsPayload;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  canAccessModule: (moduleKey: ModuleKey, roles?: Role | Role[]) => boolean;
  canAccessCommandCenterSection: (sectionKey: CommandCenterSectionKey, roles?: Role | Role[]) => boolean;
}

const defaultSettings: AccessSettingsPayload = {
  moduleAccess: resolveModuleAccess(),
  commandCenterAccess: resolveCommandCenterAccess(),
  updatedAt: null,
  updatedBy: null,
};

const AccessControlContext = createContext<AccessControlContextValue | null>(null);

export function AccessControlProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const [settings, setSettings] = useState<AccessSettingsPayload>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRoles = useMemo(() => getEffectiveRoles(user || session?.user), [session?.user, user]);

  const loadSettings = useCallback(async () => {
    if (!session) {
      setSettings(defaultSettings);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const payload = await fetchAccessSettings(session.tenantId, session.accessToken);
      setSettings({
        moduleAccess: resolveModuleAccess(payload.moduleAccess),
        commandCenterAccess: resolveCommandCenterAccess(payload.commandCenterAccess),
        updatedAt: payload.updatedAt ?? null,
        updatedBy: payload.updatedBy ?? null,
      });
      setError(null);
    } catch (err) {
      setSettings(defaultSettings);
      setError(err instanceof Error ? err.message : 'Failed to load access settings');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const canAccessModule = useCallback(
    (moduleKey: ModuleKey, roles?: Role | Role[]) => {
      return canAccessModuleWithSettings(roles || effectiveRoles, moduleKey, settings.moduleAccess);
    },
    [effectiveRoles, settings.moduleAccess],
  );

  const canAccessCommandCenterSection = useCallback(
    (sectionKey: CommandCenterSectionKey, roles?: Role | Role[]) => {
      return canAccessCommandCenterSectionWithSettings(
        roles || effectiveRoles,
        sectionKey,
        settings.commandCenterAccess,
      );
    },
    [effectiveRoles, settings.commandCenterAccess],
  );

  const value = useMemo<AccessControlContextValue>(() => ({
    settings,
    isLoading,
    error,
    reload: loadSettings,
    canAccessModule,
    canAccessCommandCenterSection,
  }), [canAccessCommandCenterSection, canAccessModule, error, isLoading, loadSettings, settings]);

  return (
    <AccessControlContext.Provider value={value}>
      {children}
    </AccessControlContext.Provider>
  );
}

export function useAccessControl(): AccessControlContextValue {
  const value = useContext(AccessControlContext);
  if (!value) {
    return {
      settings: defaultSettings,
      isLoading: false,
      error: null,
      reload: async () => {},
      canAccessModule: (moduleKey, roles) => canAccessModuleWithSettings(roles, moduleKey, defaultSettings.moduleAccess),
      canAccessCommandCenterSection: (sectionKey, roles) =>
        canAccessCommandCenterSectionWithSettings(roles, sectionKey, defaultSettings.commandCenterAccess),
    };
  }
  return value;
}
