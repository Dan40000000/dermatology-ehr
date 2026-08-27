function isTrueEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test";
}

function isClearlyFakeTestKey(value: string | undefined): boolean {
  if (!value || !isTestRuntime()) {
    return false;
  }

  return /^(test|mock|fake)[-_]/i.test(value.trim());
}

function areExternalAiCallsAllowedInThisRuntime(): boolean {
  if (!isTestRuntime()) {
    return true;
  }

  return isTrueEnv(process.env.ALLOW_EXTERNAL_AI_IN_TEST);
}

export function areExternalAiApiCallsEnabled(): boolean {
  if (!areExternalAiCallsAllowedInThisRuntime()) {
    return false;
  }

  return isTrueEnv(process.env.EXTERNAL_AI_API_CALLS_ENABLED);
}

export type ClinicalAiProvider =
  | 'openai'
  | 'anthropic'
  | 'aws_healthscribe'
  | 'abridge'
  | 'nabla'
  | 'wispr_flow';

const PROVIDER_ENV_PREFIX: Record<ClinicalAiProvider, string> = {
  openai: 'OPENAI',
  anthropic: 'ANTHROPIC',
  aws_healthscribe: 'AWS_HEALTHSCRIBE',
  abridge: 'ABRIDGE',
  nabla: 'NABLA',
  wispr_flow: 'WISPR_FLOW',
};

/** Return true only for an explicitly attested BAA/equivalent provider flag. */
export function isProviderBaaEnabled(provider: ClinicalAiProvider): boolean {
  const prefix = PROVIDER_ENV_PREFIX[provider];
  return isTrueEnv(process.env[`${prefix}_BAA_ENABLED`])
    || isTrueEnv(process.env[`${prefix}_BAA_ATTESTED`])
    || isTrueEnv(process.env[`${prefix}_DPA_SIGNED`]);
}

/**
 * Provider-specific clinical AI gate.  A global HIPAA_AI_ENABLED switch is
 * deliberately not sufficient: each vendor must have its own BAA/equivalent
 * evidence and API-call enablement.  Test-only fake keys remain available so
 * deterministic unit tests never contact a vendor.
 */
export function isClinicalAiProviderEnabled(
  provider: ClinicalAiProvider,
  apiKey?: string,
): boolean {
  if (isClearlyFakeTestKey(apiKey)) {
    return true;
  }
  if (!apiKey || !areExternalAiCallsAllowedInThisRuntime()) {
    return false;
  }

  const prefix = PROVIDER_ENV_PREFIX[provider];
  const callsEnabled = isTrueEnv(process.env[`${prefix}_API_CALLS_ENABLED`])
    || isTrueEnv(process.env[`${prefix}_AI_ENABLED`])
    || isTrueEnv(process.env.EXTERNAL_AI_API_CALLS_ENABLED);

  return callsEnabled && isProviderBaaEnabled(provider);
}

export function getProviderAiGateReason(provider: ClinicalAiProvider, apiKey?: string): string {
  if (!apiKey) return 'PROVIDER_CREDENTIALS_NOT_CONFIGURED';
  if (isTestRuntime() && !isClearlyFakeTestKey(apiKey) && !areExternalAiCallsAllowedInThisRuntime()) {
    return 'EXTERNAL_AI_DISABLED_IN_TEST';
  }
  if (!isProviderBaaEnabled(provider)) return 'PROVIDER_BAA_NOT_ATTESTED';
  if (!isClinicalAiProviderEnabled(provider, apiKey)) return 'PROVIDER_API_CALLS_DISABLED';
  return 'ENABLED';
}

export function isOpenAiApiCallsEnabled(apiKey = process.env.OPENAI_API_KEY): boolean {
  if (isClearlyFakeTestKey(apiKey)) {
    return true;
  }

  if (!areExternalAiCallsAllowedInThisRuntime()) {
    return false;
  }

  return (
    isTrueEnv(process.env.OPENAI_API_CALLS_ENABLED) ||
    areExternalAiApiCallsEnabled()
  );
}

export function isAnthropicApiCallsEnabled(apiKey = process.env.ANTHROPIC_API_KEY): boolean {
  if (isClearlyFakeTestKey(apiKey)) {
    return true;
  }

  if (!areExternalAiCallsAllowedInThisRuntime()) {
    return false;
  }

  return (
    isTrueEnv(process.env.ANTHROPIC_API_CALLS_ENABLED) ||
    areExternalAiApiCallsEnabled()
  );
}

export function getEnabledOpenAiApiKey(): string | undefined {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey && isOpenAiApiCallsEnabled(apiKey) ? apiKey : undefined;
}

export function getEnabledAnthropicApiKey(): string | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey && isAnthropicApiCallsEnabled(apiKey) ? apiKey : undefined;
}
