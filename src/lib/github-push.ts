export const EXCLUDED_SYNC_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.aistudio',
  '.playwright-cli',
  'data',
]);

export function shouldSyncFileToRepo(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return false;

  const segments = normalized.split('/');
  for (const seg of segments) {
    if (EXCLUDED_SYNC_SEGMENTS.has(seg)) return false;
  }

  if (normalized.startsWith('public/assets/aistudio/')) return false;
  if (normalized.startsWith('.github/workflows/')) return false;

  const baseName = segments[segments.length - 1];
  if (baseName === '.env' || (baseName.startsWith('.env.') && baseName !== '.env.example')) {
    return false;
  }
  if (
    baseName.endsWith('.log') ||
    baseName.endsWith('.pyc') ||
    baseName.endsWith('.pyo') ||
    baseName.endsWith('.tsbuildinfo') ||
    baseName.endsWith('.parquet') ||
    baseName.endsWith('.sqlite') ||
    baseName.endsWith('.db') ||
    baseName.endsWith('.db-wal') ||
    baseName.endsWith('.db-shm') ||
    baseName === '.DS_Store'
  ) {
    return false;
  }
  if (normalized.startsWith('models/') && baseName.endsWith('.onnx')) {
    return false;
  }

  return true;
}

export function resolveGitHubTokenFromEnv(
  env: Record<string, string | undefined>
): { token: string | null; envVarName: string | null } {
  const priorityNames = [
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'GITHUB_PAT',
    'GITHUB_ACCESS_TOKEN',
    'GITHUB_API_TOKEN',
    'GITHUB',
    'GitHub',
    'GitHub_Token',
  ];

  for (const name of priorityNames) {
    const val = (env[name] || '').trim();
    if (val.length >= 20 && !val.toLowerCase().includes('placeholder')) {
      return { token: val, envVarName: name };
    }
  }

  const ignoredSubstrings = ['url', 'repo', 'user', 'branch', 'email', 'author', 'owner', 'host'];
  for (const [key, rawVal] of Object.entries(env)) {
    const lower = key.toLowerCase();
    if (!lower.includes('github') && !lower.includes('gh_token')) continue;
    if (ignoredSubstrings.some((bad) => lower.includes(bad))) continue;
    const val = (rawVal || '').trim();
    if (val.length >= 20 && !val.toLowerCase().includes('placeholder')) {
      return { token: val, envVarName: key };
    }
  }

  return { token: null, envVarName: null };
}

export function buildGitBasicAuthHeader(token: string): string {
  const encoded = Buffer.from(`x-access-token:${token.trim()}`, 'utf-8').toString('base64');
  return `Authorization: Basic ${encoded}`;
}

export function redactGitHubSecrets(text: string, token?: string | null): string {
  let out = String(text || '');
  if (token && token.trim().length > 0) {
    out = out.split(token.trim()).join('[REDACTED]');
    const encoded = Buffer.from(`x-access-token:${token.trim()}`, 'utf-8').toString('base64');
    out = out.split(encoded).join('[REDACTED]');
  }
  out = out.replace(/gh[pousr]_[A-Za-z0-9_]{10,}/g, '[REDACTED]');
  out = out.replace(/github_pat_[A-Za-z0-9_]{10,}/g, '[REDACTED]');
  return out;
}
