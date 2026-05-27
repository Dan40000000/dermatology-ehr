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
