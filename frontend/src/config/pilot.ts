const demoToolsEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_TOOLS === 'true';

/** Demo-only credentials and data mutation shortcuts are opt-in. */
export const SHOW_DEMO_TOOLS = demoToolsEnabled;

export const PILOT_RELEASE_LABEL = import.meta.env.VITE_RELEASE_LABEL || 'Pilot';
export const PILOT_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0';
export const PILOT_FOOTER_TEXT = `${PILOT_RELEASE_LABEL} v${PILOT_VERSION} · Authorized testers only · Not for clinical use`;
