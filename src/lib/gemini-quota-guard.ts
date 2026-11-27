export interface GeminiErrorInfo {
  isQuotaOrRateLimit: boolean;
  isInvalidKeyOrForbidden: boolean;
  retryDelayMs: number;
  summary: string;
}

export const GEMINI_FALLBACK_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

const MIN_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60_000;
const MAX_COOLDOWN_MS = 24 * 60 * 60_000;

export function parseGeminiRetryDelayMs(message: string): number {
  if (!message) return DEFAULT_QUOTA_COOLDOWN_MS;

  const jsonRetryMatch = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (jsonRetryMatch) {
    const sec = Number(jsonRetryMatch[1]);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.round(sec * 1000)));
    }
  }

  const textRetryMatch = message.match(/retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i);
  if (textRetryMatch && (textRetryMatch[1] || textRetryMatch[2] || textRetryMatch[3])) {
    const hours = Number(textRetryMatch[1] || 0);
    const mins = Number(textRetryMatch[2] || 0);
    const secs = Number(textRetryMatch[3] || 0);
    const totalMs = (hours * 3600 + mins * 60 + secs) * 1000;
    if (Number.isFinite(totalMs) && totalMs > 0) {
      return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.round(totalMs)));
    }
  }

  return DEFAULT_QUOTA_COOLDOWN_MS;
}

export function parseGeminiErrorInfo(err: any): GeminiErrorInfo {
  const status = Number(err?.status || err?.code || 0);
  const rawMessage = String(err?.message || err || '').trim();
  const lower = rawMessage.toLowerCase();

  const isQuotaOrRateLimit =
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('"code":429') ||
    lower.includes('quota exceeded') ||
    lower.includes('rate-limit') ||
    lower.includes('rate limit');

  const isInvalidKeyOrForbidden =
    status === 400 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied');

  const retryDelayMs = isQuotaOrRateLimit
    ? parseGeminiRetryDelayMs(rawMessage)
    : isInvalidKeyOrForbidden
      ? 30 * 60_000
      : 60_000;

  let summary = rawMessage.slice(0, 140) || 'Unknown Gemini error';
  if (isQuotaOrRateLimit) {
    const mins = Math.round(retryDelayMs / 60_000);
    summary = `Gemini quota/rate-limit (cooldown ${mins}m)`;
  } else if (isInvalidKeyOrForbidden) {
    summary = 'Gemini API key invalid or permission denied';
  }

  return {
    isQuotaOrRateLimit,
    isInvalidKeyOrForbidden,
    retryDelayMs,
    summary,
  };
}

export class GeminiQuotaGuard {
  private readonly modelCooldownUntil = new Map<string, number>();
  private lastBackgroundCallAt = 0;
  private readonly backgroundThrottleMs: number;

  constructor(backgroundThrottleMs = 90 * 60_000) {
    this.backgroundThrottleMs = backgroundThrottleMs;
  }

  canCallModel(model: string, options?: { isBackground?: boolean; nowTs?: number }): boolean {
    const nowTs = options?.nowTs ?? Date.now();
    const cooldownUntil = this.modelCooldownUntil.get(model) || 0;
    if (nowTs < cooldownUntil) {
      return false;
    }
    if (options?.isBackground && this.lastBackgroundCallAt > 0) {
      if (nowTs - this.lastBackgroundCallAt < this.backgroundThrottleMs) {
        return false;
      }
    }
    return true;
  }

  getAvailableModels(options?: { isBackground?: boolean; nowTs?: number }): string[] {
    const nowTs = options?.nowTs ?? Date.now();
    return GEMINI_FALLBACK_MODELS.filter((model) => this.canCallModel(model, { ...options, nowTs }));
  }

  recordAttempt(options?: { isBackground?: boolean; nowTs?: number }): void {
    const nowTs = options?.nowTs ?? Date.now();
    if (options?.isBackground) {
      this.lastBackgroundCallAt = nowTs;
    }
  }

  recordError(model: string, err: any, nowTs = Date.now()): GeminiErrorInfo {
    const info = parseGeminiErrorInfo(err);
    if (info.isQuotaOrRateLimit || info.isInvalidKeyOrForbidden) {
      this.modelCooldownUntil.set(model, nowTs + info.retryDelayMs);
    }
    return info;
  }

  reset(): void {
    this.modelCooldownUntil.clear();
    this.lastBackgroundCallAt = 0;
  }

  getStatus(nowTs = Date.now()): {
    modelsInCooldown: Array<{ model: string; remainingMinutes: number }>;
    lastBackgroundCallAt: number | null;
  } {
    const modelsInCooldown: Array<{ model: string; remainingMinutes: number }> = [];
    for (const [model, until] of this.modelCooldownUntil.entries()) {
      if (until > nowTs) {
        modelsInCooldown.push({
          model,
          remainingMinutes: Math.max(1, Math.ceil((until - nowTs) / 60_000)),
        });
      }
    }
    return {
      modelsInCooldown,
      lastBackgroundCallAt: this.lastBackgroundCallAt || null,
    };
  }
}
