import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCheck,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldAlert,
  Zap,
  TrendingUp,
  Cpu,
  Clock,
} from 'lucide-react';
import type { AppNotification, NotificationCategory, NotificationSeverity } from '../types.ts';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

interface ToastItem extends AppNotification {
  toastId: string;
  createdAt: number;
  durationMs: number;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  onUnreadCountChange,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TRADES' | 'AI' | 'SECURITY'>('ALL');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('zima_notif_sound') !== 'false';
    } catch {
      return true;
    }
  });
  const [telegramSubscribersCount, setTelegramSubscribersCount] = useState<number>(0);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>('@zimatradeai_bot');
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Audio tone generator using Web Audio API (zero external assets required)
  const playChime = (severity: NotificationSeverity) => {
    if (!isSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (severity === 'CRITICAL') {
        // High alert double-beep
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(440, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (severity === 'SUCCESS') {
        // Cheerful ascending chord
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        // Subtle soft blip
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // Audio autoplay policies or muted tab
    }
  };

  const seenIdsRef = useRef<Set<string>>(new Set());

  // Poll notifications from backend
  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', {
        headers: { Accept: 'application/json' },
      }).catch(() => null);

      if (!res || !res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data || !Array.isArray(data.notifications)) return;

      const items: AppNotification[] = data.notifications;
      setNotifications(items);
      const count = typeof data.unreadCount === 'number' ? data.unreadCount : items.filter((n) => !n.readInApp).length;
      setUnreadCount(count);
      if (onUnreadCountChange) onUnreadCountChange(count);
      if (typeof data.telegramSubscribersCount === 'number') {
        setTelegramSubscribersCount(data.telegramSubscribersCount);
      }
      if (data.telegramBotUsername) {
        setTelegramBotUsername(data.telegramBotUsername);
      }

      // Check for incoming unread notifications to trigger floating toast
      const freshToasts: ToastItem[] = [];
      for (const item of items) {
        if (!seenIdsRef.current.has(item.id)) {
          seenIdsRef.current.add(item.id);
          // If created within the last 60 seconds and not yet acknowledged
          if (!item.readInApp && Date.now() - item.timestamp < 60000) {
            freshToasts.push({
              ...item,
              toastId: `toast-${item.id}`,
              createdAt: Date.now(),
              durationMs: item.severity === 'CRITICAL' ? 12000 : 7000,
            });
          }
        }
      }

      if (freshToasts.length > 0) {
        const topToast = freshToasts[0];
        playChime(topToast.severity);
        setToasts((prev) => [...freshToasts.slice(0, 3), ...prev].slice(0, 4));
      }
    } catch {
      // Ignore polling blips
    }
  };

  useEffect(() => {
    fetchNotifications();
    const intervalMs = isOpen ? 3500 : 9000;
    const timer = setInterval(fetchNotifications, intervalMs);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Countdown timer for toasts auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.createdAt < t.durationMs));
    }, 500);
    return () => clearInterval(interval);
  }, [toasts.length]);

  // Acknowledge single notification
  const handleAcknowledge = async (id: string) => {
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, readInApp: true, readInAppAt: Date.now(), telegramStatus: n.telegramStatus === 'PENDING_DELAY' ? 'DISMISSED' : n.telegramStatus }
            : n
        )
      );
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
      if (onUnreadCountChange) onUnreadCountChange(Math.max(0, unreadCount - 1));

      await fetch('/api/notifications/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // ignore
    }
  };

  // Acknowledge all notifications
  const handleAcknowledgeAll = async () => {
    try {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          readInApp: true,
          readInAppAt: Date.now(),
          telegramStatus: n.telegramStatus === 'PENDING_DELAY' ? 'DISMISSED' : n.telegramStatus,
        }))
      );
      setToasts([]);
      setUnreadCount(0);
      if (onUnreadCountChange) onUnreadCountChange(0);

      await fetch('/api/notifications/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // ignore
    }
  };

  // Clear all notifications
  const handleClearAll = async () => {
    try {
      setNotifications([]);
      setToasts([]);
      setUnreadCount(0);
      if (onUnreadCountChange) onUnreadCountChange(0);

      await fetch('/api/notifications/clear', {
        method: 'POST',
      });
    } catch {
      // ignore
    }
  };

  // Test Telegram dispatch
  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/notifications/test-telegram', {
        method: 'POST',
      });
      const data = await res.json();
      if (data && data.success) {
        setTestResult(`✅ Тест отправлен в Telegram (${data.subscribersCount} подписчиков)`);
        fetchNotifications();
      } else {
        setTestResult('⚠️ Ошибка отправки теста');
      }
    } catch {
      setTestResult('❌ Ошибка сети');
    } finally {
      setIsTestingTelegram(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const toggleSound = () => {
    setIsSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('zima_notif_sound', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const getCategoryMeta = (cat: NotificationCategory) => {
    switch (cat) {
      case 'TRADE':
      case 'TRADE_OPEN':
        return { label: 'Сделка L2', icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' };
      case 'SCALE_OUT':
        return { label: 'TP1 (60% + БУ)', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
      case 'TAKE_PROFIT':
        return { label: 'Take-Profit', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
      case 'STOP_LOSS':
        return { label: 'Stop-Loss', icon: AlertOctagon, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' };
      case 'CLOSE':
      case 'TRADE_CLOSE':
        return { label: 'Закрытие', icon: CheckCircle2, color: 'text-slate-300', bg: 'bg-slate-800 border-white/[0.08]' };
      case 'AI_TRAIN':
        return { label: 'Калибровка', icon: Cpu, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' };
      case 'KILL_SWITCH':
        return { label: 'Стоп-Кран', icon: ShieldAlert, color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/40' };
      case 'SYSTEM_UPDATE':
        return { label: 'Система', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
      case 'RISK_FIREWALL':
      case 'RISK_ALERT':
        return { label: 'Риск-Файрвол', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' };
      default:
        return { label: 'Уведомление', icon: Info, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' };
    }
  };

  const getSeverityStyle = (sev: NotificationSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return 'border-rose-500/50 bg-gradient-to-r from-rose-950/40 to-slate-900/90 text-rose-200';
      case 'WARNING':
        return 'border-amber-500/40 bg-gradient-to-r from-amber-950/30 to-slate-900/90 text-amber-200';
      case 'SUCCESS':
        return 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/30 to-slate-900/90 text-emerald-200';
      default:
        return 'border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 to-slate-900/90 text-cyan-200';
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'TRADES') {
      return (
        n.category === 'TRADE' ||
        n.category === 'TRADE_OPEN' ||
        n.category === 'SCALE_OUT' ||
        n.category === 'TAKE_PROFIT' ||
        n.category === 'STOP_LOSS' ||
        n.category === 'CLOSE' ||
        n.category === 'TRADE_CLOSE'
      );
    }
    if (activeFilter === 'AI') {
      return n.category === 'AI_TRAIN';
    }
    if (activeFilter === 'SECURITY') {
      return (
        n.category === 'KILL_SWITCH' ||
        n.category === 'RISK_FIREWALL' ||
        n.category === 'RISK_ALERT' ||
        n.category === 'SYSTEM_UPDATE'
      );
    }
    return true;
  });

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. FLOATING LIVE TOAST STACK (Bottom Right of screen)                    */}
      {/* ========================================================================= */}
      <aside aria-label="Всплывающие уведомления" className="fixed bottom-4 right-4 z-[999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map((toast) => {
          const meta = getCategoryMeta(toast.category);
          const Icon = meta.icon;
          const elapsed = Date.now() - toast.createdAt;
          const progressPct = Math.max(0, Math.min(100, 100 - (elapsed / toast.durationMs) * 100));

          // Telegram countdown calculation
          const tgRemainingSec = toast.telegramDeliverAt ? Math.max(0, Math.ceil((toast.telegramDeliverAt - Date.now()) / 1000)) : 0;

          return (
            <div
              key={toast.toastId}
              className={`pointer-events-auto rounded-xl p-3.5 shadow-2xl border backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${getSeverityStyle(
                toast.severity
              )}`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg border ${meta.bg}`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40 border border-white/[0.08] text-slate-300">
                        {meta.label}
                      </span>
                      {toast.symbol && (
                        <span className="text-[11px] font-mono font-bold text-white bg-slate-800/80 px-1.5 py-0.2 rounded border border-white/[0.1]">
                          #{toast.symbol}
                        </span>
                      )}
                      {toast.pnl !== undefined && (
                        <span
                          className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded ${
                            toast.pnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                          }`}
                        >
                          {toast.pnl >= 0 ? '+' : ''}${toast.pnl.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-white mt-1 leading-snug">{toast.title}</h4>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.toastId !== toast.toastId))}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition shrink-0"
                  title="Закрыть"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed break-words">{toast.message}</p>

              {/* Smart Telegram Escalation Footer */}
              <div className="mt-2.5 pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2 text-[10px]">
                <div className="flex items-center gap-1.5 text-slate-400">
                  {toast.telegramStatus === 'DIRECT_SENT' ? (
                    <span className="flex items-center gap-1 text-rose-300 font-medium">
                      <Send className="w-3 h-3 text-rose-400" />
                      Отправлено в TG (@zimatradeai_bot)
                    </span>
                  ) : toast.telegramStatus === 'PENDING_DELAY' && tgRemainingSec > 0 ? (
                    <span className="flex items-center gap-1 text-cyan-300 font-medium">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      Дубль в TG через {tgRemainingSec}с (если не прочитать)
                    </span>
                  ) : toast.telegramStatus === 'DISMISSED' ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCheck className="w-3 h-3 text-emerald-400" />
                      Прочитано (дубль в TG отменен)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <Send className="w-3 h-3 text-slate-400" />
                      Синхронизировано
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleAcknowledge(toast.id)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-semibold transition flex items-center gap-1 shrink-0"
                  title="Подтвердить прочтение в UI и отменить отправку в Telegram"
                >
                  <CheckCheck className="w-3 h-3 text-cyan-400" />
                  <span>Ознакомлен</span>
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-black/40 h-1 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-cyan-400 h-full transition-all duration-300 ease-linear rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </aside>

      {/* ========================================================================= */}
      {/* 2. NOTIFICATION DRAWER / SLIDE-OVER PANEL                                 */}
      {/* ========================================================================= */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
          {/* Backdrop Click */}
          <div className="absolute inset-0" onClick={onClose} />

          <div className="relative w-full max-w-md h-full bg-[#070A12] border-l border-white/[0.08] shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Центр уведомлений</h3>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-mono font-bold bg-cyan-500 text-slate-950 px-1.5 py-0.5 rounded-full">
                        {unreadCount} новых
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">Всплывающие алерты & умная доставка в Telegram</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Mute/Unmute sound toggle */}
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`p-1.5 rounded-lg border transition ${
                    isSoundEnabled
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      : 'bg-slate-900 border-white/[0.08] text-slate-500'
                  }`}
                  title={isSoundEnabled ? 'Звуковые алерты включены' : 'Звук отключен'}
                >
                  {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/[0.08] transition"
                  title="Закрыть панель"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Smart Telegram Status Info Bar */}
            <div className="px-4 py-2.5 bg-gradient-to-r from-blue-950/30 to-cyan-950/20 border-b border-white/[0.06] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300 text-[11px]">
                <Send className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>
                  Бот: <strong className="text-white">{telegramBotUsername}</strong> ({telegramSubscribersCount} подп.)
                </span>
              </div>
              <button
                type="button"
                disabled={isTestingTelegram}
                onClick={handleTestTelegram}
                className="text-[10px] font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 px-2 py-0.5 rounded border border-cyan-400/30 transition flex items-center gap-1"
                title="Отправить мгновенный тестовый сигнал в Telegram"
              >
                {isTestingTelegram ? 'Отправка...' : 'Тест в TG'}
              </button>
            </div>

            {testResult && (
              <div className="px-4 py-1.5 bg-slate-900 text-[11px] font-mono text-cyan-300 border-b border-white/[0.08] transition">
                {testResult}
              </div>
            )}

            {/* Filter Tabs */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-white/[0.06]">
              <button
                type="button"
                onClick={() => setActiveFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeFilter === 'ALL'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Все ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('TRADES')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeFilter === 'TRADES'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Сделки & PnL
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('AI')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeFilter === 'AI'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Калибровка
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('SECURITY')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeFilter === 'SECURITY'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Безопасность
              </button>
            </div>

            {/* Bulk Actions Bar */}
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px]">
                {unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все прочитаны'}
              </span>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeAll}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 transition"
                    title="Пометить все как прочитанные и отменить ожидающие отправки в Telegram"
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>Прочитать все</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] text-slate-500 hover:text-rose-400 font-medium flex items-center gap-1 transition"
                    title="Очистить историю уведомлений"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Очистить</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notification Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredNotifications.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/[0.08] flex items-center justify-center text-slate-600 mb-3">
                    <Bell className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-400">Уведомлений нет</p>
                </div>
              ) : (
                filteredNotifications.map((n) => {
                  const meta = getCategoryMeta(n.category);
                  const Icon = meta.icon;
                  const tgRemainingSec = n.telegramDeliverAt ? Math.max(0, Math.ceil((n.telegramDeliverAt - Date.now()) / 1000)) : 0;

                  return (
                    <div
                      key={n.id}
                      className={`p-3 rounded-xl border transition-all ${
                        n.readInApp
                          ? 'bg-slate-950/60 border-white/[0.06] text-slate-400'
                          : 'bg-slate-900/90 border-cyan-500/30 text-white shadow-lg'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`p-1 rounded-md border ${meta.bg}`}>
                            <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                            {meta.label}
                          </span>
                          {n.symbol && (
                            <span className="text-[10px] font-mono font-bold text-white bg-slate-800 px-1 py-0.2 rounded border border-white/[0.08]">
                              #{n.symbol}
                            </span>
                          )}
                          {n.pnl !== undefined && (
                            <span
                              className={`text-[10px] font-mono font-bold px-1 rounded ${
                                n.pnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                              }`}
                            >
                              {n.pnl >= 0 ? '+' : ''}${n.pnl.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          {!n.readInApp && (
                            <button
                              type="button"
                              onClick={() => handleAcknowledge(n.id)}
                              className="p-1 rounded hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 transition"
                              title="Ознакомлен (отменить дубль в TG)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className={`text-xs font-semibold mt-1.5 ${n.readInApp ? 'text-slate-300' : 'text-white'}`}>
                        {n.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed break-words">{n.message}</p>

                      {/* Telegram delivery status badge */}
                      <div className="mt-2.5 pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-[10px]">
                        {n.telegramStatus === 'DIRECT_SENT' ? (
                          <span className="text-rose-400 font-mono flex items-center gap-1">
                            <Send className="w-2.5 h-2.5" /> 🚨 Мгновенно в Telegram
                          </span>
                        ) : n.telegramStatus === 'PENDING_DELAY' && tgRemainingSec > 0 ? (
                          <span className="text-cyan-400 font-mono flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> Дубль в TG через {tgRemainingSec}с
                          </span>
                        ) : n.telegramStatus === 'DELIVERED' ? (
                          <span className="text-slate-400 font-mono flex items-center gap-1">
                            <Send className="w-2.5 h-2.5" /> 📲 Отправлено в Telegram
                          </span>
                        ) : (
                          <span className="text-emerald-400/80 font-mono flex items-center gap-1">
                            <CheckCheck className="w-2.5 h-2.5" /> 👁️ Прочитано в UI (TG отменен)
                          </span>
                        )}

                        {n.botName && (
                          <span className="text-slate-500 font-mono text-[9px]">
                            Бот: {n.botName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer with Telegram Link */}
            <div className="p-3 border-t border-white/[0.08] bg-slate-950 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Синхронизация с Telegram</span>
              <a
                href={`https://t.me/${telegramBotUsername.replace('@', '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-medium text-[11px] flex items-center gap-1"
              >
                <span>{telegramBotUsername}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
