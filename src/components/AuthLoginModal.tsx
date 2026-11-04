import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  ShieldCheck,
  UserCheck,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Activity,
  X,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

export interface OperatorProfile {
  username: string;
  role: string;
  lastLoginAt: number | null;
  activeSessionsCount: number;
}

interface AuthLoginScreenProps {
  hasCustomPassword: boolean;
  defaultUsername: string;
  onLoginSuccess: (token: string, operator: OperatorProfile) => void;
}

export const AuthLoginScreen: React.FC<AuthLoginScreenProps> = ({
  hasCustomPassword,
  defaultUsername,
  onLoginSuccess,
}) => {
  const [authTab, setAuthTab] = useState<'PASSWORD' | 'PIN'>('PASSWORD');
  const [username, setUsername] = useState<string>(defaultUsername || 'admin');
  const [password, setPassword] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          authTab === 'PIN'
            ? { authMethod: 'PIN', pin }
            : { authMethod: 'PASSWORD', username, password }
        ),
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        onLoginSuccess(data.token, data.operator);
      } else {
        setError(data.error || 'Ошибка авторизации');
      }
    } catch (err: any) {
      setError(`Ошибка соединения с ядром: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authMethod: 'PASSWORD',
          username: defaultUsername || 'admin',
          password: 'zima2026',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        onLoginSuccess(data.token, data.operator);
      } else {
        setError(data.error || 'Не удалось выполнить быстрый вход');
      }
    } catch (err: any) {
      setError(`Ошибка сети: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070A12] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle Ambient Glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[320px] bg-cyan-500/10 blur-[120px] rounded-full" />

      <div className="w-full max-w-md bg-slate-900/95 border border-white/[0.09] rounded-2xl p-6 sm:p-7 shadow-2xl relative z-10 space-y-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-inner">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                ZimaTrade <span className="text-cyan-400">AI</span> · Авторизация
              </h1>
              <p className="text-xs text-slate-400">
                Защищенный доступ к торговому терминалу и ИИ-ботам
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            SHA-256 Guard
          </span>
        </div>

        {/* Auth Method Switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              setAuthTab('PASSWORD');
              setError(null);
            }}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              authTab === 'PASSWORD'
                ? 'bg-gradient-to-r from-cyan-500/30 to-blue-600/30 text-white font-bold border border-cyan-400/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Логин и Пароль</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthTab('PIN');
              setError(null);
            }}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              authTab === 'PIN'
                ? 'bg-gradient-to-r from-cyan-500/30 to-blue-600/30 text-white font-bold border border-cyan-400/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span>Быстрый PIN-код</span>
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {authTab === 'PASSWORD' ? (
            <>
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5">
                  Логин оператора
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5">
                  Пароль доступа
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">
                Пин-код терминала (4–8 цифр)
              </label>
              <input
                type="password"
                inputMode="numeric"
                required
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-400"
              />
            </div>
          )}

          {error && (
            <div className="bg-rose-950/70 border border-rose-500/50 rounded-xl p-3 flex items-center gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{loading ? 'Проверка ключей...' : 'Войти в терминал'}</span>
          </button>
        </form>

        {/* Initial Setup Helper Banner (Only shown while default password hasn't been changed) */}
        {!hasCustomPassword && (
          <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">Первичный запуск:</span> сейчас установлен стартовый доступ{' '}
                <code className="text-cyan-300 font-mono">admin</code> / пароль{' '}
                <code className="text-cyan-300 font-mono">zima2026</code> (или PIN{' '}
                <code className="text-cyan-300 font-mono">2026</code>). Вы можете изменить их в 1 клик через иконку профиля в шапке.
              </div>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleQuickDemoLogin}
              className="w-full py-1.5 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-mono text-xs font-semibold transition cursor-pointer"
            >
              Быстрый вход в 1 клик (admin / zima2026)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface AuthSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  operator: OperatorProfile | null;
  requireAuth: boolean;
  hasCustomPassword: boolean;
  sessionToken: string | null;
  onUpdated: (newOperator: OperatorProfile, newRequireAuth: boolean, newHasCustom: boolean) => void;
  onLogout: () => void;
}

export const AuthSettingsModal: React.FC<AuthSettingsModalProps> = ({
  isOpen,
  onClose,
  operator,
  requireAuth,
  hasCustomPassword,
  sessionToken,
  onUpdated,
  onLogout,
}) => {
  const [newUsername, setNewUsername] = useState<string>(operator?.username || 'admin');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [requireLoginToggle, setRequireLoginToggle] = useState<boolean>(requireAuth);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) {
        headers['x-zima-session'] = sessionToken;
      }

      const res = await fetch('/api/auth/update-credentials', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newUsername: newUsername.trim() || undefined,
          newPassword: newPassword.trim() || undefined,
          newPin: newPin.trim() || undefined,
          requireAuth: requireLoginToggle,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: 'Настройки безопасности и ключи доступа сохранены в data/auth_config.json',
        });
        setCurrentPassword('');
        setNewPassword('');
        setNewPin('');
        onUpdated(data.operator, data.requireAuth, data.hasCustomPassword);
      } else {
        setFeedback({
          type: 'error',
          text: data.error || 'Не удалось обновить настройки безопасности',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Ошибка сети: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/90 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Безопасность и Авторизация Терминала
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Оператор: <strong className="text-cyan-300">{operator?.username || 'admin'}</strong> · Сессий: {operator?.activeSessionsCount ?? 1}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSaveSecurity} className="space-y-4 text-xs font-mono">
          <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div>
              <div className="text-white font-semibold">Запрашивать вход при открытии</div>
              <div className="text-[11px] text-slate-400 font-sans">
                Защищает терминал паролем и PIN-кодом при доступе с новых устройств
              </div>
            </div>
            <input
              type="checkbox"
              checked={requireLoginToggle}
              onChange={(e) => setRequireLoginToggle(e.target.checked)}
              className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1">Логин оператора</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Новый быстрый PIN (4–8 цифр)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder={hasCustomPassword ? 'Без изменений' : 'По умолч.: 2026'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Новый пароль (оставьте пустым, если не меняете)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={hasCustomPassword ? '••••••••' : 'По умолч.: zima2026'}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          {feedback && (
            <div
              className={`rounded-xl border p-3 flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900/80 text-rose-200 border border-rose-500/40 font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Заблокировать / Выйти</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Закрыть
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition cursor-pointer"
              >
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
