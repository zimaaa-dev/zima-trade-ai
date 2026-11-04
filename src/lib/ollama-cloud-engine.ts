/**
 * ZimaTrade AI — Ollama Cloud Multi-Key Rotation & Model Orchestrator
 *
 * Supported Cloud Models:
 * - nemotron-3-nano:30b (Default Primary for Trading Signals & Quantitative Analysis)
 * - gpt-oss:20b
 * - gemma4:31b
 * - nemotron-3-super
 * - gpt-oss:120b
 * - nemotron-3-ultra
 * - beam
 */

export const OLLAMA_CLOUD_MODELS = [
  'nemotron-3-nano:30b',
  'gpt-oss:20b',
  'gemma4:31b',
  'nemotron-3-super',
  'gpt-oss:120b',
  'nemotron-3-ultra',
  'beam',
] as const;

export type OllamaCloudModel = (typeof OLLAMA_CLOUD_MODELS)[number] | (string & {});

export interface KeyPoolItem {
  id: string;
  rawKey: string;
  masked: string;
  requestCount: number;
  successCount: number;
  failCount: number;
  cooldownUntil: number;
  lastUsedAt: number;
  lastError?: string;
  status: 'ACTIVE' | 'COOLDOWN' | 'ERROR';
}

export interface OllamaCloudState {
  host: string;
  selectedModel: OllamaCloudModel;
  keys: KeyPoolItem[];
  currentKeyIndex: number;
  totalRotations: number;
}

export class OllamaCloudEngine {
  private host: string;
  private selectedModel: OllamaCloudModel;
  private keys: KeyPoolItem[] = [];
  private currentKeyIndex = 0;
  private totalRotations = 0;

  constructor(options?: {
    host?: string;
    keys?: string | string[];
    defaultModel?: OllamaCloudModel;
  }) {
    this.host = (options?.host || 'https://ollama.com').replace(/\/+$/, '');
    this.selectedModel = options?.defaultModel || 'nemotron-3-nano:30b';
    if (options?.keys) {
      this.setKeys(options.keys);
    }
  }

  public setHost(host: string) {
    this.host = (host || 'https://ollama.com').replace(/\/+$/, '');
  }

  public getHost(): string {
    return this.host;
  }

  public setSelectedModel(model: OllamaCloudModel) {
    if (model && model.trim()) {
      this.selectedModel = model.trim();
    }
  }

  public getSelectedModel(): OllamaCloudModel {
    return this.selectedModel;
  }

  public static maskKey(key: string): string {
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '••••••••';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  public setKeys(input: string | string[]): void {
    const rawList: string[] = Array.isArray(input)
      ? input
      : typeof input === 'string'
      ? input.split(/[,\n;]+/).map((s) => s.trim())
      : [];

    const validKeys = Array.from(
      new Set(
        rawList
          .map((k) => k.trim())
          .filter((k) => k.length >= 6 && !k.startsWith('ваш_') && !k.startsWith('your_'))
      )
    );

    const existingMap = new Map<string, KeyPoolItem>();
    for (const item of this.keys) {
      existingMap.set(item.rawKey, item);
    }

    this.keys = validKeys.map((key, idx) => {
      const existing = existingMap.get(key);
      if (existing) return existing;
      return {
        id: `key-${idx + 1}-${Date.now().toString(36)}`,
        rawKey: key,
        masked: OllamaCloudEngine.maskKey(key),
        requestCount: 0,
        successCount: 0,
        failCount: 0,
        cooldownUntil: 0,
        lastUsedAt: 0,
        status: 'ACTIVE',
      };
    });

    if (this.currentKeyIndex >= this.keys.length) {
      this.currentKeyIndex = 0;
    }
  }

  public getPoolStatus(): {
    totalKeys: number;
    activeKeys: number;
    cooldownKeys: number;
    selectedModel: OllamaCloudModel;
    host: string;
    totalRotations: number;
    keys: Array<Omit<KeyPoolItem, 'rawKey'> & { active: boolean }>;
  } {
    const now = Date.now();
    const activeCount = this.keys.filter(
      (k) => k.status !== 'ERROR' && (k.cooldownUntil === 0 || k.cooldownUntil <= now)
    ).length;
    const cooldownCount = this.keys.filter(
      (k) => k.cooldownUntil > now && k.status !== 'ERROR'
    ).length;

    return {
      totalKeys: this.keys.length,
      activeKeys: activeCount,
      cooldownKeys: cooldownCount,
      selectedModel: this.selectedModel,
      host: this.host,
      totalRotations: this.totalRotations,
      keys: this.keys.map((k) => ({
        id: k.id,
        masked: k.masked,
        requestCount: k.requestCount,
        successCount: k.successCount,
        failCount: k.failCount,
        cooldownUntil: k.cooldownUntil,
        lastUsedAt: k.lastUsedAt,
        lastError: k.lastError,
        status: k.cooldownUntil > now ? 'COOLDOWN' : k.status,
        active: k.status === 'ACTIVE' && (k.cooldownUntil === 0 || k.cooldownUntil <= now),
      })),
    };
  }

  /**
   * Acquire next available healthy key in Round-Robin fashion
   */
  public acquireNextKey(): KeyPoolItem | null {
    if (this.keys.length === 0) return null;

    const now = Date.now();
    const len = this.keys.length;

    for (let i = 0; i < len; i++) {
      const idx = (this.currentKeyIndex + i) % len;
      const candidate = this.keys[idx];

      if (candidate.status === 'ERROR') continue;
      if (candidate.cooldownUntil > now) continue;

      // Found healthy key
      this.currentKeyIndex = (idx + 1) % len;
      this.totalRotations++;
      candidate.requestCount++;
      candidate.lastUsedAt = now;
      return candidate;
    }

    // If all keys are in cooldown, find the one that recovers soonest
    let soonestKey: KeyPoolItem | null = null;
    let minCooldown = Infinity;
    for (const k of this.keys) {
      if (k.status !== 'ERROR' && k.cooldownUntil < minCooldown) {
        minCooldown = k.cooldownUntil;
        soonestKey = k;
      }
    }

    if (soonestKey) {
      soonestKey.requestCount++;
      soonestKey.lastUsedAt = now;
      return soonestKey;
    }

    return null;
  }

  public reportKeySuccess(key: KeyPoolItem): void {
    key.successCount++;
    key.status = 'ACTIVE';
    key.cooldownUntil = 0;
    key.lastError = undefined;
  }

  public reportKeyFailure(key: KeyPoolItem, statusCode: number, errorMsg: string): void {
    key.failCount++;
    key.lastError = `HTTP ${statusCode}: ${errorMsg}`;

    if (statusCode === 429) {
      // Rate limited: cooldown for 45 seconds
      key.status = 'COOLDOWN';
      key.cooldownUntil = Date.now() + 45000;
    } else if (statusCode === 401 || statusCode === 403) {
      // Invalid or revoked token
      key.status = 'ERROR';
      key.cooldownUntil = Date.now() + 3600000;
    } else {
      // Transient error: 10s cooldown
      key.cooldownUntil = Date.now() + 10000;
    }
  }

  /**
   * Send single prompt generation to Ollama Cloud with automatic key rotation and model fallback
   */
  public async generate(
    prompt: string,
    options?: {
      system?: string;
      model?: OllamaCloudModel;
      timeoutMs?: number;
      temperature?: number;
    }
  ): Promise<{
    text: string;
    model: string;
    keyMasked?: string;
    latencyMs: number;
    ok: boolean;
    error?: string;
  }> {
    const t0 = Date.now();
    const targetModel = options?.model || this.selectedModel;
    const timeoutMs = options?.timeoutMs || 8500;
    const temperature = options?.temperature ?? 0.15;

    const maxKeyAttempts = Math.max(1, Math.min(this.keys.length, 3));
    let lastError = 'No valid keys configured in Ollama Cloud pool';

    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      const keyItem = this.acquireNextKey();
      if (!keyItem) break;

      try {
        const payload: Record<string, any> = {
          model: targetModel,
          prompt,
          stream: false,
          options: { temperature },
        };
        if (options?.system) {
          payload.system = options.system;
        }

        const res = await fetch(`${this.host}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keyItem.rawKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          const text = String(data?.response || '').trim();
          this.reportKeySuccess(keyItem);
          return {
            text,
            model: targetModel,
            keyMasked: keyItem.masked,
            latencyMs: Date.now() - t0,
            ok: true,
          };
        }

        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        lastError = `HTTP ${res.status}: ${errText}`;
        this.reportKeyFailure(keyItem, res.status, errText);

        // If rate limited or auth failed, loop will automatically try the next key in pool
      } catch (err: any) {
        lastError = err?.message || 'Network Timeout';
        this.reportKeyFailure(keyItem, 504, lastError);
      }
    }

    return {
      text: '',
      model: targetModel,
      latencyMs: Date.now() - t0,
      ok: false,
      error: lastError,
    };
  }

  /**
   * Multi-turn Chat completion with Ollama Cloud
   */
  public async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: OllamaCloudModel;
      timeoutMs?: number;
      temperature?: number;
    }
  ): Promise<{
    text: string;
    model: string;
    keyMasked?: string;
    latencyMs: number;
    ok: boolean;
    error?: string;
  }> {
    const t0 = Date.now();
    const targetModel = options?.model || this.selectedModel;
    const timeoutMs = options?.timeoutMs || 9500;
    const temperature = options?.temperature ?? 0.3;

    const maxKeyAttempts = Math.max(1, Math.min(this.keys.length, 3));
    let lastError = 'No valid keys configured in Ollama Cloud pool';

    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      const keyItem = this.acquireNextKey();
      if (!keyItem) break;

      try {
        const res = await fetch(`${this.host}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keyItem.rawKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages,
            stream: false,
            options: { temperature },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          const text = String(data?.message?.content || '').trim();
          this.reportKeySuccess(keyItem);
          return {
            text,
            model: targetModel,
            keyMasked: keyItem.masked,
            latencyMs: Date.now() - t0,
            ok: true,
          };
        }

        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        lastError = `HTTP ${res.status}: ${errText}`;
        this.reportKeyFailure(keyItem, res.status, errText);
      } catch (err: any) {
        lastError = err?.message || 'Network Timeout';
        this.reportKeyFailure(keyItem, 504, lastError);
      }
    }

    return {
      text: '',
      model: targetModel,
      latencyMs: Date.now() - t0,
      ok: false,
      error: lastError,
    };
  }
}
