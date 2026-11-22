export const OPENROUTER_FREE_MODELS = [
  'openrouter/free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'inclusionai/ling-3.2-flash:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
] as const;

export const OPENROUTER_FREE_DAILY_LIMIT_PER_KEY = 50;

export interface OpenRouterKeySlot {
  key: string;
  masked: string;
  requestCount: number;
  successCount: number;
  failCount: number;
  cooldownUntil: number;
  lastError?: string;
}

export interface OpenRouterPoolSummary {
  totalKeys: number;
  activeKeys: number;
  cooldownKeys: number;
  dailyFreeLimitEstimate: number;
  totalRotations: number;
  maskedKeys: string[];
  slots: Array<{
    masked: string;
    active: boolean;
    cooldownRemainingSec: number;
    requestCount: number;
    successCount: number;
    failCount: number;
    lastError?: string;
  }>;
}

export function maskOpenRouterKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 4) return '****';
  return `****${clean.slice(-4)}`;
}

export function parseOpenRouterKeys(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const rawList = Array.isArray(raw) ? raw : String(raw).split(/[\s,;\n\r]+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of rawList) {
    let token = String(entry || '').trim();
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }
    if (token.length < 12) continue;
    const lower = token.toLowerCase();
    if (
      lower.includes('placeholder') ||
      lower.includes('your_') ||
      lower.includes('ваш_') ||
      lower.includes('example') ||
      lower === 'null' ||
      lower === 'undefined'
    ) {
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result;
}

export function extractOpenRouterReplyText(payload: any): string {
  const msg = payload?.choices?.[0]?.message;
  if (!msg) return '';
  const direct = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (direct) return direct;
  // Some OpenRouter free reasoning models emit content only in reasoning if truncated
  const reasoning =
    typeof msg.reasoning === 'string'
      ? msg.reasoning.trim()
      : typeof msg.reasoning_content === 'string'
      ? msg.reasoning_content.trim()
      : '';
  return reasoning;
}

export class OpenRouterKeyPool {
  private slots: OpenRouterKeySlot[] = [];
  private cursor = 0;
  private totalRotations = 0;

  constructor(initialKeys?: string | string[] | null) {
    if (initialKeys) {
      this.setKeys(initialKeys);
    }
  }

  setKeys(raw?: string | string[] | null): number {
    const parsed = parseOpenRouterKeys(raw);
    const prevByKey = new Map(this.slots.map((s) => [s.key, s]));
    this.slots = parsed.map((key) => {
      const existing = prevByKey.get(key);
      if (existing) return existing;
      return {
        key,
        masked: maskOpenRouterKey(key),
        requestCount: 0,
        successCount: 0,
        failCount: 0,
        cooldownUntil: 0,
      };
    });
    if (this.cursor >= this.slots.length) {
      this.cursor = 0;
    }
    return this.slots.length;
  }

  getAllKeys(): string[] {
    return this.slots.map((s) => s.key);
  }

  hasKeys(): boolean {
    return this.slots.length > 0;
  }

  /**
   * Returns keys ordered for the current request starting at the round-robin cursor:
   * active (non-cooldown) keys first, followed by earliest-expiring cooldown keys as last resort.
   */
  getAttemptOrder(now = Date.now()): OpenRouterKeySlot[] {
    const n = this.slots.length;
    if (n === 0) return [];

    const rotated: OpenRouterKeySlot[] = [];
    for (let i = 0; i < n; i++) {
      rotated.push(this.slots[(this.cursor + i) % n]);
    }
    this.cursor = (this.cursor + 1) % n;
    if (n > 1) {
      this.totalRotations += 1;
    }

    const active = rotated.filter((s) => s.cooldownUntil <= now);
    const cooling = rotated
      .filter((s) => s.cooldownUntil > now)
      .sort((a, b) => a.cooldownUntil - b.cooldownUntil);

    return active.length > 0 ? active : cooling;
  }

  markSuccess(key: string): void {
    const slot = this.slots.find((s) => s.key === key);
    if (!slot) return;
    slot.requestCount += 1;
    slot.successCount += 1;
    slot.cooldownUntil = 0;
    slot.lastError = undefined;
  }

  markRateLimited(key: string, cooldownMs: number, errorMessage?: string, now = Date.now()): void {
    const slot = this.slots.find((s) => s.key === key);
    if (!slot) return;
    slot.requestCount += 1;
    slot.failCount += 1;
    slot.cooldownUntil = now + Math.max(1000, cooldownMs);
    slot.lastError = errorMessage || 'HTTP 429 Rate Limited';
  }

  markFailure(key: string, errorMessage?: string): void {
    const slot = this.slots.find((s) => s.key === key);
    if (!slot) return;
    slot.requestCount += 1;
    slot.failCount += 1;
    slot.lastError = errorMessage;
  }

  getSummary(now = Date.now()): OpenRouterPoolSummary {
    let activeKeys = 0;
    let cooldownKeys = 0;
    const slots = this.slots.map((s) => {
      const remainingMs = Math.max(0, s.cooldownUntil - now);
      const active = remainingMs === 0;
      if (active) activeKeys += 1;
      else cooldownKeys += 1;
      return {
        masked: s.masked,
        active,
        cooldownRemainingSec: Math.ceil(remainingMs / 1000),
        requestCount: s.requestCount,
        successCount: s.successCount,
        failCount: s.failCount,
        lastError: s.lastError,
      };
    });

    return {
      totalKeys: this.slots.length,
      activeKeys,
      cooldownKeys,
      dailyFreeLimitEstimate: this.slots.length * OPENROUTER_FREE_DAILY_LIMIT_PER_KEY,
      totalRotations: this.totalRotations,
      maskedKeys: this.slots.map((s) => s.masked),
      slots,
    };
  }
}
