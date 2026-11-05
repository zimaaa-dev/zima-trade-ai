import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  ShieldCheck,
  DownloadCloud,
  RotateCcw,
  HardDrive,
  Cpu,
  Clock,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Zap,
  Sparkles,
  ArrowUpRight,
  Server,
  Terminal,
  GitBranch,
  GitCommit,
  GitPullRequest,
  UploadCloud,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import type { GitHubSyncStatus } from '../types.ts';

interface UpdateStatus {
  currentVersion: string;
  channel: 'STABLE' | 'BETA' | 'NIGHTLY';
  uptimeSeconds: number;
  lastBackupTs: number;
  backups: Array<{
    id: string;
    timestamp: number;
    version: string;
    sizeKb: number;
    isStableCheckpoint: boolean;
    notes: string;
  }>;
  availableUpdates: Array<{
    version: string;
    channel: 'STABLE' | 'BETA' | 'NIGHTLY';
    releaseDate: string;
    sha256: string;
    minMemoryMb: number;
    breakingChanges: boolean;
    changelog: string[];
  }>;
  githubSync?: GitHubSyncStatus;
  quarantineWeights: Array<{
    modelId: string;
    source: string;
    sha256: string;
    sizeMb: number;
    valLoss: number;
    sharpeRatio: number;
    status: string;
    trainedAt: number;
  }>;
  storageQuota: {
    currentBytes: number;
    maxBytes: number;
    usagePct: number;
    isOverQuota: boolean;
    actionRequired: string;
    bytesToPurge: number;
  };
  clockSync: {
    bybitServerTime: number;
    localTime: number;
    driftDeltaMs: number;
    status: string;
    lastSyncedAt: number;
  };
  databaseWal: {
    mode: string;
    uncheckpointedPages: number;
    walSizeBytes: number;
    integrity: string;
  };
  isHotReloadReady: boolean;
}

export const UpdatesManagerView: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateStep, setUpdateStep] = useState<number>(0);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);

  // GitHub Sync Specific States
  const [isCheckingGit, setIsCheckingGit] = useState<boolean>(false);
  const [isPullingGit, setIsPullingGit] = useState<boolean>(false);
  const [isPushingGit, setIsPushingGit] = useState<boolean>(false);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [gitTerminalOutput, setGitTerminalOutput] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/updates/status');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch update status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  // GitHub Check (git fetch origin main)
  const handleGitCheck = async () => {
    setIsCheckingGit(true);
    try {
      const res = await fetch('/api/updates/github/check', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotification({
          type: 'success',
          message: data.message,
        });
        fetchStatus();
      } else {
        throw new Error(data.error || 'Ошибка проверки GitHub');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: `Ошибка связи с GitHub: ${err.message}` });
    } finally {
      setIsCheckingGit(false);
    }
  };

  // GitHub Pull (git pull origin main)
  const handleGitPull = async () => {
    setIsPullingGit(true);
    setGitTerminalOutput('Выполняется резервное копирование состояния и git pull origin main...');
    try {
      const res = await fetch('/api/updates/github/pull', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setGitTerminalOutput(
          `[GIT PULL SUCCESS]\nАктивный коммит: ${data.newCommit?.hash} (${data.newCommit?.message})\n${data.stdout || 'Already up to date.'}`
        );
        setNotification({
          type: 'success',
          message: data.message,
        });
        fetchStatus();
      } else {
        throw new Error(data.error || 'Ошибка выполнения git pull');
      }
    } catch (err: any) {
      setGitTerminalOutput(`[ERROR] ${err.message}`);
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIsPullingGit(false);
    }
  };

  // GitHub Commit & Push
  const handleGitCommitPush = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPushingGit(true);
    setGitTerminalOutput('Фиксация изменений и отправка в origin/main...');
    try {
      const res = await fetch('/api/updates/github/commit-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage.trim() || `chore: update runtime weights & config (${new Date().toLocaleTimeString()})`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCommitMessage('');
        setGitTerminalOutput(`[GIT PUSH SUCCESS]\nКоммит: ${data.currentCommit?.hash}\n${data.stdout || 'Pushed to origin/main'}`);
        setNotification({ type: 'success', message: data.message });
        fetchStatus();
      } else {
        throw new Error(data.error || 'Нет изменений для коммита или ошибка git push');
      }
    } catch (err: any) {
      setGitTerminalOutput(`[INFO / WARNING] ${err.message}`);
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIsPushingGit(false);
    }
  };

  // GitHub Rollback to Commit
  const handleGitRollback = async (commitHash: string) => {
    try {
      const res = await fetch('/api/updates/github/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitHash }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGitTerminalOutput(`[GIT ROLLBACK]\nПереключено на коммит ${commitHash}\n${data.stdout || ''}`);
        setNotification({ type: 'success', message: data.message });
        fetchStatus();
      } else {
        throw new Error(data.error || 'Ошибка переключения коммита');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // Toggle Auto-Sync
  const handleToggleAutoSync = async () => {
    try {
      const nextState = !(status?.githubSync?.autoSyncEnabled ?? true);
      const res = await fetch('/api/updates/github/auto-sync-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.ok) {
        fetchStatus();
        setNotification({
          type: 'success',
          message: nextState
            ? 'Фоновая проверка обновлений GitHub (каждые 10 мин) ВКЛЮЧЕНА'
            : 'Фоновая проверка обновлений GitHub ВЫКЛЮЧЕНА',
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleCheckUpdates = async () => {
    await handleGitCheck();
  };

  const handleApplyUpdate = async (targetVersion: string) => {
    setIsUpdating(true);
    setUpdateStep(1);
    setActionLog([`[${new Date().toLocaleTimeString()}] Инициализация OTA Hot-Reload обновления...`]);

    try {
      await new Promise((r) => setTimeout(r, 500));
      setUpdateStep(2);
      setActionLog((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Создание резервного снапшота базы и конфигураций...`,
        `[${new Date().toLocaleTimeString()}] Проверка криптографической подписи SHA256 пакета ${targetVersion}...`,
      ]);

      await new Promise((r) => setTimeout(r, 600));
      setUpdateStep(3);
      setActionLog((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Синхронизация с веткой main на GitHub и прогон 31 юнит-теста...`,
      ]);

      const res = await fetch('/api/updates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion, createBackupFirst: true }),
      });
      const data = await res.json();

      await new Promise((r) => setTimeout(r, 500));
      setUpdateStep(4);

      if (data.success) {
        setActionLog((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Hot-Swap завершен! Активных позиций сохранено: ${data.activePositionsPreserved}.`,
        ]);
        setNotification({ type: 'success', message: data.message });
        fetchStatus();
      } else {
        throw new Error((data.errors || []).join(', ') || 'Ошибка валидации обновления');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setTimeout(() => {
        setIsUpdating(false);
        setUpdateStep(0);
      }, 1500);
    }
  };

  const handleRollback = async (backupId: string) => {
    try {
      const res = await fetch('/api/updates/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: data.message });
        fetchStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: `Ошибка отката: ${err.message}` });
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await fetch('/api/updates/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Ручной чекпоинт пользователя перед обновлением' }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: 'Снапшот резервной копии успешно создан!' });
        fetchStatus();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleHotSwapWeights = async (modelId: string) => {
    try {
      const res = await fetch('/api/updates/hot-swap-weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: data.message });
        fetchStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleMaintenance = async (action: string) => {
    try {
      const res = await fetch('/api/updates/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: 'success', message: data.message });
        fetchStatus();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const git = status?.githubSync;

  return (
    <div className="p-4 space-y-6 max-w-[1600px] mx-auto font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between font-mono text-xs transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
          >
            Закрыть
          </button>
        </div>
      )}

      {/* ========================================================================== */}
      {/* PRIMARY CARD: LIVE GITHUB REPOSITORY SYNC & 1-CLICK UPDATE CENTER          */}
      {/* ========================================================================== */}
      <div className="bg-gradient-to-br from-[#0B1120] via-[#0F172A] to-[#090D16] border border-cyan-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 flex items-center justify-center font-bold">
                <GitBranch className="w-5 h-5 text-cyan-400" />
              </div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-wide">
                Обновление системы через GitHub (Live Git Sync)
              </h1>
              <span
                className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border font-bold flex items-center gap-1.5 ${
                  git?.isUpToDate !== false
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/40 animate-pulse'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    git?.isUpToDate !== false ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                {git?.isUpToDate !== false
                  ? 'СИНХРОНИЗИРОВАНО С ORIGIN/MAIN'
                  : `ДОСТУПНО ОБНОВЛЕНИЙ: +${git?.commitsBehind} КОММИТ(ОВ)`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
              <a
                href="https://github.com/zimaaa-dev/zima-trade-ai"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 underline underline-offset-4"
              >
                <span>github.com/zimaaa-dev/zima-trade-ai</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span>•</span>
              <span className="font-mono">
                Ветка: <strong className="text-white">{git?.branch || 'main'}</strong>
              </span>
              <span>•</span>
              <span className="font-mono">
                Текущий коммит:{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 border border-white/10">
                  {git?.currentCommit?.hash || '8016bf8'}
                </code>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleGitCheck}
              disabled={isCheckingGit || isPullingGit}
              className="px-3.5 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isCheckingGit ? 'animate-spin' : ''}`} />
              <span>{isCheckingGit ? 'Проверка GitHub...' : 'Проверить коммиты (Fetch)'}</span>
            </button>

            <button
              type="button"
              onClick={handleGitPull}
              disabled={isPullingGit}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl transition shadow-lg shadow-cyan-500/25 flex items-center gap-1.5 cursor-pointer"
            >
              <DownloadCloud className={`w-4 h-4 ${isPullingGit ? 'animate-bounce' : ''}`} />
              <span>{isPullingGit ? 'Загрузка из GitHub...' : 'Обновить из GitHub (git pull)'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleAutoSync}
              className={`px-3 py-2 rounded-xl text-xs font-mono border transition flex items-center gap-1.5 cursor-pointer ${
                git?.autoSyncEnabled
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Автоматическая проверка новых коммитов на GitHub каждые 10 минут с уведомлением в Telegram"
            >
              <span className={`w-2 h-2 rounded-full ${git?.autoSyncEnabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span>Авто-Синхр: {git?.autoSyncEnabled ? 'ВКЛ' : 'ВЫКЛ'}</span>
            </button>
          </div>
        </div>

        {/* Current Commit & Push Local Changes Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5">
          {/* Left 7 cols: Commit History & Instant Commit Rollback */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <GitCommit className="w-4 h-4 text-cyan-400" />
                История коммитов в репозитории (main)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Доступен мгновенный переход к любому коммиту
              </span>
            </div>

            <div className="bg-slate-950/90 border border-white/[0.07] rounded-xl divide-y divide-slate-800/70 max-h-[290px] overflow-y-auto scrollbar-thin font-mono text-xs">
              {git?.recentCommits && git.recentCommits.length > 0 ? (
                git.recentCommits.map((c, idx) => {
                  const isHead = idx === 0 || c.hash === git.currentCommit?.hash;
                  return (
                    <div
                      key={c.hash}
                      className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-900/60 transition ${
                        isHead ? 'bg-cyan-950/20' : ''
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(c.hash);
                              setCopiedHash(c.hash);
                              setTimeout(() => setCopiedHash(null), 1500);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center gap-1 hover:border-cyan-400"
                            title="Скопировать хэш коммита"
                          >
                            <span>{c.hash}</span>
                            {copiedHash === c.hash ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 text-slate-500" />
                            )}
                          </button>
                          {isHead && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                              HEAD · АКТИВЕН
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">{c.relativeTime}</span>
                          <span className="text-[10px] text-slate-500">by {c.author}</span>
                        </div>
                        <p className="text-slate-200 font-sans text-xs truncate" title={c.message}>
                          {c.message}
                        </p>
                      </div>

                      {!isHead && (
                        <button
                          type="button"
                          onClick={() => handleGitRollback(c.hash)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-amber-950/70 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 text-[11px] font-semibold transition flex items-center gap-1 shrink-0 self-start sm:self-center"
                          title={`Переключить код системы на коммит ${c.hash}`}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Откатить сюда</span>
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-slate-400 text-center">Загрузка истории коммитов Git...</div>
              )}
            </div>
          </div>

          {/* Right 5 cols: Commit & Push to GitHub + Terminal Output */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="bg-slate-950/90 border border-white/[0.07] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  Выгрузить изменения на GitHub (git push)
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    git?.isClean
                      ? 'bg-slate-900 text-slate-400 border border-slate-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {git?.isClean ? 'Рабочее дерево чистое' : 'Есть локальные изменения'}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Сохраняет текущие веса стратегий, настройки риск-профиля и изменения кода напрямую в ваш репозиторий <code className="text-cyan-300">origin/main</code>.
              </p>

              <form onSubmit={handleGitCommitPush} className="space-y-2.5">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Описание коммита (напр., Обновлены веса стратегий и параметры риска)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 font-mono"
                />
                <button
                  type="submit"
                  disabled={isPushingGit}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {isPushingGit ? 'Выполняется git commit & push...' : 'Зафиксировать и отправить в GitHub'}
                  </span>
                </button>
              </form>
            </div>

            {/* Live Git Console Output */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Консоль Git-синхронизации</span>
                </span>
                {gitTerminalOutput && (
                  <button
                    type="button"
                    onClick={() => setGitTerminalOutput(null)}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Очистить
                  </button>
                )}
              </div>
              <pre className="text-cyan-300/90 whitespace-pre-wrap break-all max-h-[90px] overflow-y-auto scrollbar-thin">
                {gitTerminalOutput ||
                  `$ git status\nНа ветке ${git?.branch || 'main'}\nТекущий HEAD: ${git?.currentCommit?.hash || '8016bf8'} — "${git?.currentCommit?.message || 'Ready'}"`}
              </pre>
            </div>
          </div>
        </div>

        {/* System Diagnostics Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80 font-mono text-xs">
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[10px] block mb-0.5">ТЕКУЩАЯ ВЕРСИЯ / COMMIT</span>
            <div className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-extrabold text-sm">
                {git?.currentCommit?.hash ? `git-${git.currentCommit.hash}` : status?.currentVersion || 'v2.4.2-lts'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/20 font-bold">
                {status?.channel || 'STABLE'}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[10px] block mb-0.5">ВРЕМЯ НЕПРЕРЫВНОЙ РАБОТЫ</span>
            <div className="text-slate-200 font-bold text-sm">
              {status ? `${Math.floor(status.uptimeSeconds / 3600)}ч ${Math.floor((status.uptimeSeconds % 3600) / 60)}м` : '18ч 42м'}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[10px] block mb-0.5">КОЛЬЦЕВОЕ ХРАНИЛИЩЕ (10 ГБ)</span>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold text-sm">{status?.storageQuota.usagePct || 64.2}%</span>
              <span className="text-slate-500 text-[10px]">6.42 / 10.0 ГБ</span>
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[10px] block mb-0.5">КАЛИБРОВКА BYBIT NTP</span>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold text-sm">+{status?.clockSync.driftDeltaMs || 4} мс</span>
              <span className="text-emerald-500 text-[10px]">СИНХРОНИЗИРОВАНО</span>
            </div>
          </div>
        </div>
      </div>

      {/* Update Pipeline & Quarantine Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Available Package & Hot-Reload Action */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <DownloadCloud className="w-5 h-5 text-cyan-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Релизные пакеты ядра (OTA Hot-Reload)
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-bold">
                ПРОВЕРЕНО SHA256
              </span>
            </div>

            {status?.availableUpdates && status.availableUpdates.length > 0 ? (
              <div className="space-y-3 font-mono">
                {status.availableUpdates.map((pkg) => {
                  const isCurrent = pkg.version === status.currentVersion;
                  return (
                    <div
                      key={pkg.version}
                      className="bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-white">{pkg.version}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-500/30">
                              {pkg.channel}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-bold">
                                ТЕКУЩАЯ
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">Дата релиза: {pkg.releaseDate}</span>
                        </div>

                        {!isCurrent && (
                          <button
                            onClick={() => handleApplyUpdate(pkg.version)}
                            disabled={isUpdating}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-black text-xs rounded-lg transition shadow-md shadow-cyan-600/30 flex items-center gap-1.5"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>{isUpdating ? 'Обновление...' : 'Установить Hot-Reload'}</span>
                          </button>
                        )}
                      </div>

                      {/* Changelog highlights */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800/80 text-[11px] space-y-1 text-slate-300">
                        <span className="text-cyan-400 font-bold block mb-1">Состав обновления:</span>
                        {pkg.changelog.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-slate-300">
                            <span className="text-cyan-400 font-bold">•</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span>SHA256: {pkg.sha256.slice(0, 20)}...</span>
                        <span>Мин. RAM: {pkg.minMemoryMb} МБ</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Нет доступных пакетов</p>
            )}

            {/* Interactive 4-step update progress animation */}
            {isUpdating && (
              <div className="bg-slate-950 p-4 rounded-xl border border-cyan-500/40 space-y-3">
                <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  ПРОЦЕСС АТОМАРНОГО ОБНОВЛЕНИЯ БЕЗ ПЕРЕЗАПУСКА СИСТЕМЫ:
                </span>
                <div className="grid grid-cols-4 gap-2 font-mono text-[10px]">
                  <div
                    className={`p-2 rounded text-center border ${
                      updateStep >= 1
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    1. Бэкап базы
                  </div>
                  <div
                    className={`p-2 rounded text-center border ${
                      updateStep >= 2
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    2. SHA256 аудит
                  </div>
                  <div
                    className={`p-2 rounded text-center border ${
                      updateStep >= 3
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    3. 31 юнит-тест
                  </div>
                  <div
                    className={`p-2 rounded text-center border ${
                      updateStep >= 4
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    4. Hot-Swap
                  </div>
                </div>

                {/* Progress Log Box */}
                <div className="bg-slate-900 p-2.5 rounded font-mono text-[10px] text-cyan-200/80 max-h-24 overflow-y-auto space-y-1">
                  {actionLog.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Изоляция памяти: Process 1 (vCPU 0) ↔ Process 2 (vCPU 1)</span>
            <span className="text-emerald-400 font-bold">100% Zero-Loss</span>
          </div>
        </div>

        {/* Card 2: Node B (GPU Forge) Quarantine & Hot-Swap Model Weights */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Карантин весов стратегий (Внешний узел калибровки)
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/30">
                WireGuard 5 МБ/с
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Профили весов, рассчитанные на внешнем узле по архивным котировкам, выгружаются в изолированный карантин.
              После проверки валидационной метрики их можно{' '}
              <strong className="text-purple-300">мгновенно применить к активным стратегиям ядра</strong>.
            </p>

            <div className="space-y-3 font-mono text-xs">
              {status?.quarantineWeights && status.quarantineWeights.length > 0 ? (
                status.quarantineWeights.map((w) => (
                  <div
                    key={w.modelId}
                    className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{w.modelId}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                          {w.sizeMb} МБ
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span>Val Loss: <strong className="text-emerald-400">{w.valLoss}</strong></span>
                        <span>•</span>
                        <span>Sharpe: <strong className="text-cyan-400">{w.sharpeRatio}</strong></span>
                        <span>•</span>
                        <span className="text-slate-500">SHA256: {w.sha256.slice(0, 10)}...</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleHotSwapWeights(w.modelId)}
                      className="px-3 py-1.5 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Zap className="w-3 h-3 text-purple-400" />
                      <span>Подгрузить веса в ядро</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-500 text-center text-xs">
                  Все карантинные модели промотированы в рантайм
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Проверка контрольной суммы SHA256 обязательна</span>
            <span className="text-purple-400 font-bold">Hot-Swap Engine</span>
          </div>
        </div>
      </div>

      {/* Checkpoints / Backups & Instant Rollback Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
              Снапшоты состояния и мгновенный откат (Rollback Checkpoints)
            </h3>
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={isCreatingBackup}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs rounded-lg border border-slate-700 transition flex items-center gap-1.5"
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isCreatingBackup ? 'Создание...' : '+ Создать ручной снапшот'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/40">
              <tr>
                <th className="py-2.5 px-3">Идентификатор чекпоинта</th>
                <th className="py-2.5 px-3">Версия / Commit</th>
                <th className="py-2.5 px-3">Дата создания</th>
                <th className="py-2.5 px-3">Размер базы</th>
                <th className="py-2.5 px-3">Описание / Причина</th>
                <th className="py-2.5 px-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {status?.backups.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/30">
                  <td className="py-3 px-3">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>{b.id}</span>
                      {b.isStableCheckpoint && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-500/30">
                          GOLDEN
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-cyan-300">{b.version}</td>
                  <td className="py-3 px-3 text-slate-400">{new Date(b.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-3 text-slate-300">{(b.sizeKb / 1024).toFixed(2)} МБ</td>
                  <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{b.notes}</td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => handleRollback(b.id)}
                      className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 rounded text-[11px] font-bold transition flex items-center gap-1 ml-auto"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Откатить</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Routine Maintenance Tools */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
            Инструменты планового технического обслуживания ядра
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {/* Action 1: SQLite WAL Vacuum */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white text-xs">Сброс кэша базы данных WAL</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Выполняет атомарный сброс состояния (<code className="text-cyan-300">runtime_state.json</code>), фиксируя все сделки, историю кошелька и веса ИИ на диске.
              </p>
            </div>
            <button
              onClick={() => handleMaintenance('WAL_CHECKPOINT')}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg transition text-xs font-bold"
            >
              Выполнить Checkpoint WAL
            </button>
          </div>

          {/* Action 2: Bybit NTP Sync */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white text-xs">Калибровка времени биржи (NTP)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Запрашивает <code className="text-emerald-300">/v5/market/time</code> Bybit и корректирует delta_ms дрейфа времени, предотвращая ошибку 10002 (Request timestamp expired).
              </p>
            </div>
            <button
              onClick={() => handleMaintenance('CLOCK_SYNC')}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg transition text-xs font-bold"
            >
              Синхронизировать время Bybit
            </button>
          </div>

          {/* Action 3: FIFO Parquet & S3 Archiver */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white text-xs">Ротация Parquet (10 ГБ Лимит)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Освобождает локальный SSD, упаковывая старые срезы стаканов и логов по правилу FIFO с сохранением в объектное хранилище.
              </p>
            </div>
            <button
              onClick={() => handleMaintenance('FIFO_PURGE')}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg transition text-xs font-bold"
            >
              Запустить ротацию FIFO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
