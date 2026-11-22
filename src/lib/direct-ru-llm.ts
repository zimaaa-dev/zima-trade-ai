import https from 'node:https';
import crypto from 'node:crypto';

export const GIGACHAT_MODELS = ['GigaChat-2', 'GigaChat'] as const;
export const GIGACHAT_SCOPES = [
  'GIGACHAT_API_PERS',
  'GIGACHAT_API_B2B',
  'GIGACHAT_API_CORP',
] as const;

export const ZHIPU_FREE_MODELS = [
  'glm-4.5-flash',
  'glm-4-flash',
  'glm-4-flash-250414',
] as const;

export const ZHIPU_BASES = [
  'https://open.bigmodel.cn/api/paas/v4',
  'https://api.z.ai/api/paas/v4',
] as const;

/**
 * Normalizes a GigaChat Authorization Key.
 * Accepts:
 * - Raw Base64 string from Studio (e.g. "MDE5...")
 * - "Basic <base64>"
 * - "clientId:clientSecret" (automatically Base64-encoded)
 */
export function normalizeGigaChatAuthKey(raw?: string | null): string {
  if (!raw) return '';
  let clean = String(raw).trim();
  if (!clean) return '';
  if (/^basic\s+/i.test(clean)) {
    clean = clean.replace(/^basic\s+/i, '').trim();
  }
  const lower = clean.toLowerCase();
  if (
    clean.length < 12 ||
    lower.includes('placeholder') ||
    lower.includes('your_') ||
    lower.includes('ваш_') ||
    lower === 'null' ||
    lower === 'undefined'
  ) {
    return '';
  }
  if (clean.includes(':')) {
    return Buffer.from(clean, 'utf8').toString('base64');
  }
  return clean;
}

export function buildGigaChatOAuthHeaders(authKeyBase64: string, rqUid: string): Record<string, string> {
  return {
    Authorization: `Basic ${authKeyBase64}`,
    RqUID: rqUid,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
}

export function resolveZhipuBases(explicitBase?: string | null): string[] {
  const custom = explicitBase ? String(explicitBase).trim().replace(/\/+$/, '') : '';
  return Array.from(new Set([custom, ...ZHIPU_BASES].filter(Boolean)));
}

export class GigaChatTokenCache {
  private token = '';
  private expiresAt = 0;
  private scopeUsed = '';
  private keyFingerprint = '';

  getValidToken(authKeyBase64: string, now = Date.now()): { token: string; scope: string } | null {
    if (
      !this.token ||
      this.keyFingerprint !== authKeyBase64.slice(-12) ||
      now >= this.expiresAt - 60_000
    ) {
      return null;
    }
    return { token: this.token, scope: this.scopeUsed };
  }

  setToken(authKeyBase64: string, token: string, expiresAtMs: number, scope: string): void {
    this.keyFingerprint = authKeyBase64.slice(-12);
    this.token = token;
    this.expiresAt = expiresAtMs;
    this.scopeUsed = scope;
  }

  clear(): void {
    this.token = '';
    this.expiresAt = 0;
    this.scopeUsed = '';
    this.keyFingerprint = '';
  }
}

export const gigaChatTokenCache = new GigaChatTokenCache();

// Scoped strictly to Sberbank GigaChat endpoints (*.devices.sberbank.ru) which use Russian Ministry of Digital Development Root CA
const sberHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

function sberHttpsRequest(
  urlStr: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: string,
  timeoutMs = 12000
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const reqHeaders: Record<string, string> = { ...headers };
    if (body !== undefined) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(body, 'utf8'));
    }

    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers: reqHeaders,
        agent: sberHttpsAgent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('GigaChat request timeout'));
    });
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body, 'utf8');
    }
    req.end();
  });
}

export async function acquireGigaChatAccessToken(
  rawAuthKey: string,
  preferredScope?: string,
  timeoutMs = 9000
): Promise<{ ok: boolean; accessToken?: string; scope?: string; error?: string }> {
  const authKeyBase64 = normalizeGigaChatAuthKey(rawAuthKey);
  if (!authKeyBase64) {
    return { ok: false, error: 'Некорректный формат GIGACHAT_AUTH_KEY' };
  }

  const cached = gigaChatTokenCache.getValidToken(authKeyBase64);
  if (cached) {
    return { ok: true, accessToken: cached.token, scope: cached.scope };
  }

  const scopesToTry = Array.from(
    new Set([
      ...(preferredScope ? [preferredScope.trim()] : []),
      ...GIGACHAT_SCOPES,
    ])
  );

  let lastErr = '';
  for (const scope of scopesToTry) {
    try {
      const rqUid = crypto.randomUUID();
      const resp = await sberHttpsRequest(
        'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
        'POST',
        buildGigaChatOAuthHeaders(authKeyBase64, rqUid),
        `scope=${encodeURIComponent(scope)}`,
        timeoutMs
      );
      if (resp.status >= 200 && resp.status < 300) {
        const parsed = JSON.parse(resp.text || '{}') as any;
        const accessToken = String(parsed?.access_token || '').trim();
        const expiresAt = Number(parsed?.expires_at || Date.now() + 25 * 60_000);
        if (accessToken) {
          gigaChatTokenCache.setToken(authKeyBase64, accessToken, expiresAt, scope);
          return { ok: true, accessToken, scope };
        }
      }
      lastErr = `HTTP ${resp.status}: ${resp.text.slice(0, 140)}`;
      if (resp.status === 401) {
        // Invalid credentials — no need to try other scopes
        break;
      }
    } catch (err: any) {
      lastErr = err?.message || 'GigaChat OAuth error';
    }
  }

  return { ok: false, error: lastErr || 'GigaChat OAuth failed' };
}

export async function callGigaChatCompletion(
  rawAuthKey: string,
  prompt: string,
  options?: {
    systemInstruction?: string;
    model?: string;
    scope?: string;
    timeoutMs?: number;
    maxTokens?: number;
  }
): Promise<{ ok: boolean; text?: string; modelUsed?: string; scope?: string; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs || 14000;
  const auth = await acquireGigaChatAccessToken(rawAuthKey, options?.scope, Math.min(9000, timeoutMs));
  if (!auth.ok || !auth.accessToken) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: auth.error };
  }

  const messages = options?.systemInstruction
    ? [
        { role: 'system', content: options.systemInstruction },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];

  const models = Array.from(
    new Set([
      ...(options?.model ? [options.model.trim()] : []),
      ...GIGACHAT_MODELS,
    ])
  );

  let lastErr = '';
  for (const model of models) {
    try {
      const resp = await sberHttpsRequest(
        'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        'POST',
        {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
        }),
        timeoutMs
      );
      if (resp.status >= 200 && resp.status < 300) {
        const data = JSON.parse(resp.text || '{}') as any;
        const text = String(data?.choices?.[0]?.message?.content || '').trim();
        if (text) {
          return {
            ok: true,
            text,
            modelUsed: String(data?.model || model),
            scope: auth.scope,
            latencyMs: Date.now() - startedAt,
          };
        }
      }
      if (resp.status === 401) {
        gigaChatTokenCache.clear();
      }
      lastErr = `HTTP ${resp.status}: ${resp.text.slice(0, 140)}`;
    } catch (err: any) {
      lastErr = err?.message || 'GigaChat completion error';
    }
  }

  return { ok: false, latencyMs: Date.now() - startedAt, error: lastErr || 'GigaChat failed' };
}

export async function callZhipuCompletion(
  apiKey: string,
  prompt: string,
  options?: {
    systemInstruction?: string;
    model?: string;
    explicitBase?: string;
    timeoutMs?: number;
    maxTokens?: number;
  }
): Promise<{ ok: boolean; text?: string; modelUsed?: string; baseUsed?: string; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs || 15000;
  const cleanKey = apiKey.trim();
  if (!cleanKey || cleanKey.length < 10) {
    return { ok: false, latencyMs: 0, error: 'ZHIPU_API_KEY не задан' };
  }

  const messages = options?.systemInstruction
    ? [
        { role: 'system', content: options.systemInstruction },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];

  const bases = resolveZhipuBases(options?.explicitBase);
  const models = Array.from(
    new Set([
      ...(options?.model ? [options.model.trim()] : []),
      ...ZHIPU_FREE_MODELS,
    ])
  );

  let lastErr = '';
  for (const base of bases) {
    for (const model of models) {
      try {
        const resp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (resp.ok) {
          const data = (await resp.json().catch(() => null)) as any;
          const text = String(data?.choices?.[0]?.message?.content || '').trim();
          if (text) {
            return {
              ok: true,
              text,
              modelUsed: String(data?.model || model),
              baseUsed: base,
              latencyMs: Date.now() - startedAt,
            };
          }
        }
        const errBody = await resp.text().catch(() => '');
        lastErr = `HTTP ${resp.status}${errBody ? `: ${errBody.slice(0, 120)}` : ''}`;
        if (resp.status === 401) {
          // Try next base (key might belong to z.ai vs open.bigmodel.cn)
          break;
        }
      } catch (err: any) {
        lastErr = err?.message || 'Zhipu request error';
      }
    }
  }

  return { ok: false, latencyMs: Date.now() - startedAt, error: lastErr || 'Zhipu failed' };
}
