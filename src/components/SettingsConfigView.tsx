import React, { useState, useEffect } from 'react';
import {
  Key,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  Info,
  RefreshCw,
  Send,
  Bell,
  MessageSquare,
} from 'lucide-react';
import type { TelegramBotStatus, TelegramNotificationToggles } from '../types.ts';

interface ConfigStatus {
  dataSources: {
    marketData: {
      provider: string;
      type: string;
      requiresKey: boolean;
      status: string;
      description: string;
    };
    backupMarketData: {
      provider: string;
      type: string;
      requiresKey: boolean;
      status: string;
    };
  };
  credentials: Record<
    string,
    {
      name: string;
      purpose: string;
      configured: boolean;
      source: string;
    }
  >;
}

const TOGGLE_LABELS: Array<{
  key: keyof TelegramNotificationToggles;
  title: string;
  desc: string;
}> = [
  {
    key: 'notifyOnOpen',
    title: 'Открытие сделок (Ручные и торговые боты)',
    desc: 'Мгновенное сообщение при входе в LONG/SHORT с ценой входа, SL и сеткой TP',
  },
  {
    key: 'notifyOnScaleOut',
    title: 'Фиксация TP1 (60%) и перевод в Безубыток',
    desc: 'Уведомление, когда сделка достигает TP1 и стоп-лосс переносится на цену входа',
  },
  {
    key: 'notifyOnClose',
    title: 'Закрытие позиций и итоговый PnL',
    desc: 'Отчет о закрытии сделки с чистой прибылью/убытком в USDT и R-множителем',
  },
  {
    key: 'notifyOnKillSwitch',
    title: 'Алерты Риск-Контроля и Kill-Switch',
    desc: 'Предупреждения при приближении к лимиту просадки -5% или скачке спреда стакана',
  },
  {
    key: 'notifyOnSignals',
    title: 'Сигналы из ТГ-каналов и новостных лент',
    desc: 'Сводки парсера при обнаружении новых сетапов в подключенных каналах',
  },
  {
    key: 'notifyOnAiTrain',
    title: 'Калибровка стратегий на свежих данных',
    desc: 'Отчеты об успешном пересчете весов факторов на исторических свечах',
  },
];

export const SettingsConfigView: React.FC = () => {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [, setLoading] = useState<boolean>(true);
  const [testResult, setTestResult] = useState<{ target: string; msg: string; success: boolean } | null>(null);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Telegram Bot (@zimatradeai_bot) State
  const [tgStatus, setTgStatus] = useState<TelegramBotStatus | null>(null);
  const [tgChatId, setTgChatId] = useState<string>('');
  const [tgSyncing, setTgSyncing] = useState<boolean>(false);
  const [tgTesting, setTgTesting] = useState<boolean>(false);
  const [tgBanner, setTgBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const safeParse = async (r: Response | null) => {
        if (!r) return null;
        const ct = r.headers.get('content-type') || '';
        return r.ok && ct.includes('application/json') ? r.json().catch(() => null) : null;
      };

      const [res, tgRes] = await Promise.all([
        fetch('/api/config/status').catch(() => null),
        fetch('/api/telegram/status').catch(() => null),
      ]);

      const [cfgData, tgData] = await Promise.all([
        safeParse(res),
        safeParse(tgRes),
      ]);

      if (cfgData) {
        setConfig(cfgData);
      }
      if (tgData) {
        setTgStatus(tgData);
        if (tgData.chatId && !tgChatId) {
          setTgChatId(tgData.chatId);
        }
      }
    } catch {
      // Graceful degradation
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleTgSyncUpdates = async () => {
    setTgSyncing(true);
    setTgBanner(null);
    try {
      const res = await fetch('/api/telegram/sync-updates', { method: 'POST' });
      const data = await res.json();
      if (data.status) {
        setTgStatus(data.status);
        if (data.status.chatId) setTgChatId(data.status.chatId);
      }
      setTgBanner({
        type: data.status?.chatId ? 'success' : 'info',
        text: data.status?.chatId
          ? `Успешно! Подключен Chat ID: ${data.status.chatId} (@zimatradeai_bot).`
          : 'Откройте @zimatradeai_bot в Telegram, отправьте /start и нажмите «Найти мой /start» еще раз.',
      });
    } catch (err: any) {
      setTgBanner({ type: 'error', text: err.message || 'Ошибка синхронизации с Telegram API' });
    } finally {
      setTgSyncing(false);
    }
  };

  const handleSaveTgChatId = async (e: React.FormEvent) => {
    e.preventDefault();
    setTgBanner(null);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: tgChatId.trim(), enabled: true }),
      });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
      setTgBanner({
        type: 'success',
        text: tgChatId.trim()
          ? `Chat ID ${tgChatId.trim()} сохранен для уведомлений @zimatradeai_bot!`
          : 'Настройки @zimatradeai_bot обновлены.',
      });
    } catch (err: any) {
      setTgBanner({ type: 'error', text: err.message || 'Ошибка сохранения настроек Telegram' });
    }
  };

  const handleToggleTgCategory = async (key: keyof TelegramNotificationToggles) => {
    if (!tgStatus) return;
    const nextVal = !tgStatus.toggles[key];
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toggles: { [key]: nextVal },
        }),
      });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendTgTest = async () => {
    setTgTesting(true);
    setTgBanner(null);
    try {
      if (tgChatId.trim() && tgChatId.trim() !== tgStatus?.chatId) {
        await fetch('/api/telegram/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: tgChatId.trim(), enabled: true }),
        });
      }
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: tgChatId.trim() || undefined }),
      });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
      setTgBanner({
        type: data.success ? 'success' : 'error',
        text: data.message || (data.success ? 'Тестовое уведомление отправлено в @zimatradeai_bot!' : 'Не удалось отправить сообщение'),
      });
    } catch (err: any) {
      setTgBanner({ type: 'error', text: err.message || 'Ошибка тестовой отправки' });
    } finally {
      setTgTesting(false);
    }
  };

  const runTest = async (target: string) => {
    setTestingTarget(target);
    setTestResult(null);
    try {
      const res = await fetch(`/api/config/test-connection?target=${target}`);
      const data = await res.json();
      setTestResult({
        target,
        msg: data.statusText || (data.success ? 'Успешное соединение!' : data.error || 'Ошибка проверки'),
        success: data.success,
      });
      if (data.success) {
        fetchStatus();
      }
    } catch (err: any) {
      setTestResult({
        target,
        msg: `Ошибка сети: ${err.message}`,
        success: false,
      });
    } finally {
      setTestingTarget(null);
    }
  };

  return (
    <div className="p-3 sm:p-4 space-y-6 max-w-[1600px] mx-auto font-sans overflow-x-hidden">
      {/* Telegram Bot @zimatradeai_bot Notification Center */}
      <div className="bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 flex items-center justify-center shrink-0">
              <Send className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  Центр уведомлений Telegram: <a href="https://t.me/zimatradeai_bot" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">@zimatradeai_bot</a>
                </h2>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  ТОКЕН АКТИВЕН ({tgStatus?.maskedToken || '923931...JY5II'})
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                    tgStatus?.chatId
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                      : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {tgStatus?.chatId ? `CHAT ID: ${tgStatus.chatId}` : 'ОЖИДАЕТ /START В БОТЕ'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Уведомления о сделках, фиксации TP1 (60% + перевод в Безубыток), рисках и сигналах из Telegram-каналов.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="https://t.me/zimatradeai_bot"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Открыть @zimatradeai_bot</span>
            </a>
            <button
              type="button"
              onClick={handleTgSyncUpdates}
              disabled={tgSyncing}
              className="px-3.5 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/40 text-xs font-mono font-bold transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${tgSyncing ? 'animate-spin' : ''}`} />
              <span>{tgSyncing ? 'Поиск /start...' : 'Найти мой /start'}</span>
            </button>
            <button
              type="button"
              onClick={handleSendTgTest}
              disabled={tgTesting}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-mono font-bold shadow-lg shadow-cyan-950/50 transition flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{tgTesting ? 'Отправка...' : 'Отправить тест в ТГ'}</span>
            </button>
          </div>
        </div>

        {tgBanner && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
              tgBanner.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : tgBanner.type === 'error'
                ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                : 'bg-slate-950 border-cyan-500/40 text-cyan-300'
            }`}
          >
            <span className="break-words">{tgBanner.text}</span>
            <button
              type="button"
              onClick={() => setTgBanner(null)}
              className="text-slate-400 hover:text-white text-xs shrink-0"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* Connection Form + Subscribers + Toggles Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 5 cols: Connect Chat ID & Bot Commands */}
          <div className="lg:col-span-5 bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-cyan-400" />
                <span>Привязка Telegram Chat ID</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                Подписчиков: {tgStatus?.subscribers?.length || 0}
              </span>
            </div>

            <form onSubmit={handleSaveTgChatId} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder="Ваш Telegram Chat ID (напр. 482910421)"
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold transition shrink-0"
              >
                Сохранить ID
              </button>
            </form>

            {/* Interactive Bot Commands */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <span className="text-[11px] font-mono text-slate-400 block">
                Команды управления в <span className="text-cyan-300">@zimatradeai_bot</span>:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] font-mono">
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <strong className="text-cyan-400">/start</strong> — Подписка
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <strong className="text-cyan-400">/status</strong> — Сводка счета
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <strong className="text-cyan-400">/positions</strong> — Позиции
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <strong className="text-cyan-400">/bots</strong> — Стратегии
                </div>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-2">
                  <strong className="text-rose-400">/kill</strong> — Экстренный Стоп
                </div>
              </div>
            </div>
          </div>

          {/* Right 7 cols: 6 Notification Category Toggles */}
          <div className="lg:col-span-7 bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Категории уведомлений
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Telegram Bot API
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TOGGLE_LABELS.map((item) => {
                const isOn = tgStatus?.toggles?.[item.key] ?? true;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleToggleTgCategory(item.key)}
                    className={`text-left p-3 rounded-xl border transition flex items-start justify-between gap-2.5 ${
                      isOn
                        ? 'bg-slate-900/90 border-cyan-500/30 hover:border-cyan-500/60'
                        : 'bg-slate-950/60 border-slate-800/80 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white leading-snug">{item.title}</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                        isOn
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isOn ? 'ВКЛ' : 'ВЫКЛ'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Dispatched Telegram Messages Log */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Журнал отправленных уведомлений ({tgStatus?.recentMessages?.length || 0})
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              События сделок, риск-контроля и сигналов
            </span>
          </div>

          {!tgStatus?.recentMessages || tgStatus.recentMessages.length === 0 ? (
            <div className="text-center py-6 text-xs font-mono text-slate-500">
              Уведомлений пока нет.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {tgStatus.recentMessages.slice(0, 8).map((msg) => (
                <div
                  key={msg.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs font-mono space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-cyan-300 truncate">{msg.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          msg.status === 'DELIVERED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-950/70 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {msg.status === 'DELIVERED' ? 'ДОСТАВЛЕНО В ТГ' : 'В ОЧЕРЕДИ'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 whitespace-pre-line break-words leading-relaxed">
                    {msg.textPreview}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Key Status & Connectivity Inspector */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-cyan-400" />
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
              Статус подключений и биржевых шлюзов (Bybit V5 & OKX V5)
            </h3>
          </div>
          <button
            onClick={fetchStatus}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono transition flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Обновить статус</span>
          </button>
        </div>

        {/* Credentials Status Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/40">
              <tr>
                <th className="py-2.5 px-3">Шлюз / API</th>
                <th className="py-2.5 px-3">Назначение</th>
                <th className="py-2.5 px-3">Статус</th>
                <th className="py-2.5 px-3 text-right">Проверка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {/* Bybit Public Data Feed */}
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-3">
                  <div className="font-bold text-white">Bybit v5 Public Gateway</div>
                  <span className="text-[10px] text-cyan-400">api.bybit.com</span>
                </td>
                <td className="py-3 px-3 text-slate-300 text-[11px]">
                  Поток стаканов L2-50, тикеры, свечи и фандинг (Linear USDT)
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                    <CheckCircle2 className="w-3 h-3" /> ПОДКЛЮЧЕНО (LIVE)
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    onClick={() => runTest('bybit')}
                    disabled={testingTarget === 'bybit'}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[11px] transition"
                  >
                    {testingTarget === 'bybit' ? 'Пинг...' : 'Проверить Bybit'}
                  </button>
                </td>
              </tr>

              {/* OKX Public Data Feed */}
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-3">
                  <div className="font-bold text-white">OKX v5 Public Gateway</div>
                  <span className="text-[10px] text-cyan-400">www.okx.com</span>
                </td>
                <td className="py-3 px-3 text-slate-300 text-[11px]">
                  Поток стаканов L2, тикеры SWAP, свечи и мультибиржевой фейловер
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                    <CheckCircle2 className="w-3 h-3" /> ПОДКЛЮЧЕНО (LIVE)
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    onClick={() => runTest('okx')}
                    disabled={testingTarget === 'okx'}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[11px] transition"
                  >
                    {testingTarget === 'okx' ? 'Пинг...' : 'Проверить OKX'}
                  </button>
                </td>
              </tr>

              {/* Bybit Live Orders */}
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-3">
                  <div className="font-bold text-white">BYBIT_API_KEY & SECRET</div>
                  <span className="text-[10px] text-amber-400">Bybit v5 REST / Private WS</span>
                </td>
                <td className="py-3 px-3 text-slate-300 text-[11px]">
                  Боевое исполнение ордеров на Bybit в Live Mode
                </td>
                <td className="py-3 px-3">
                  {config?.credentials?.bybitTrading?.configured ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                      <CheckCircle2 className="w-3 h-3" /> НАСТРОЕН
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800/40 flex items-center gap-1 w-fit">
                      <HelpCircle className="w-3 h-3" /> ТОЛЬКО УЧЕБНЫЙ РЕЖИМ
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-[10px] text-slate-500">Private API</span>
                </td>
              </tr>

              {/* OKX Live Orders */}
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-3">
                  <div className="font-bold text-white">OKX_API_KEY, SECRET & PASSPHRASE</div>
                  <span className="text-[10px] text-amber-400">OKX v5 REST / Private WS</span>
                </td>
                <td className="py-3 px-3 text-slate-300 text-[11px]">
                  Боевое исполнение ордеров на OKX в Live Mode
                </td>
                <td className="py-3 px-3">
                  {config?.credentials?.okxTrading?.configured ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                      <CheckCircle2 className="w-3 h-3" /> НАСТРОЕН
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800/40 flex items-center gap-1 w-fit">
                      <HelpCircle className="w-3 h-3" /> ТОЛЬКО УЧЕБНЫЙ РЕЖИМ
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-[10px] text-slate-500">Private API</span>
                </td>
              </tr>

              {/* Telegram Userbot */}
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-3">
                  <div className="font-bold text-white">TG_API_ID & TG_API_HASH</div>
                  <span className="text-[10px] text-blue-400">Telegram Read-Only Stream</span>
                </td>
                <td className="py-3 px-3 text-slate-300 text-[11px]">
                  Чтение подключенных новостных и сигнальных каналов
                </td>
                <td className="py-3 px-3">
                  {config?.credentials?.telegramUserbot?.configured ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                      <CheckCircle2 className="w-3 h-3" /> АКТИВЕН
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
                      <Info className="w-3 h-3 text-cyan-400" /> ПУБЛИЧНЫЙ ПАРСЕР
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-[10px] text-slate-500">Read-Only</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Test Probe Output */}
        {testResult && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{testResult.msg}</span>
            </div>
            <span className="text-[10px] text-slate-400">{testResult.target.toUpperCase()} PROBE</span>
          </div>
        )}
      </div>

      {/* Quick Key Entry & Instant Runtime Activation */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
              API ключи бирж Bybit V5 & OKX V5 (Live Mode)
            </h3>
          </div>
        </div>

        {saveStatus && (
          <div
            className={`mb-4 p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
              saveStatus.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {saveStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{saveStatus.message}</span>
            </div>
            <button
              onClick={() => setSaveStatus(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded"
            >
              Закрыть
            </button>
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const getVal = (name: string): string => {
              const el = form.elements.namedItem(name) as HTMLInputElement | null;
              return el ? el.value.trim() : '';
            };

            const bybitKey = getVal('bybitKey');
            const bybitSecret = getVal('bybitSecret');
            const okxKey = getVal('okxKey');
            const okxSecret = getVal('okxSecret');
            const okxPassphrase = getVal('okxPassphrase');

            setIsSaving(true);
            setSaveStatus(null);

            try {
              const res = await fetch('/api/config/save-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bybitApiKey: bybitKey || undefined,
                  bybitApiSecret: bybitSecret || undefined,
                  okxApiKey: okxKey || undefined,
                  okxApiSecret: okxSecret || undefined,
                  okxPassphrase: okxPassphrase || undefined,
                }),
              });
              const data = await res.json();
              if (data.success) {
                setSaveStatus({
                  type: 'success',
                  message: data.message || 'Ключи сохранены и активированы.',
                });
                await fetchStatus();
              } else {
                setSaveStatus({
                  type: 'error',
                  message: data.error || 'Ошибка при сохранении конфигурации',
                });
              }
            } catch (err: any) {
              setSaveStatus({
                type: 'error',
                message: `Ошибка сети при сохранении: ${err.message}`,
              });
            } finally {
              setIsSaving(false);
            }
          }}
          className="space-y-4 font-mono text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                BYBIT_API_KEY (Live Mode)
              </label>
              <input
                name="bybitKey"
                type="password"
                placeholder={
                  config?.credentials?.bybitTrading?.configured
                    ? '•••••••• (Bybit Key сохранен)'
                    : 'Необязательно для учебного счета'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                BYBIT_API_SECRET (Live Mode)
              </label>
              <input
                name="bybitSecret"
                type="password"
                placeholder={
                  config?.credentials?.bybitTrading?.configured
                    ? '•••••••• (Bybit Secret сохранен)'
                    : 'Необязательно для учебного счета'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                OKX_API_KEY (Live Mode)
              </label>
              <input
                name="okxKey"
                type="password"
                placeholder={
                  config?.credentials?.okxTrading?.configured
                    ? '•••••••• (OKX Key сохранен)'
                    : 'Необязательно для учебного счета'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                OKX_API_SECRET (Live Mode)
              </label>
              <input
                name="okxSecret"
                type="password"
                placeholder={
                  config?.credentials?.okxTrading?.configured
                    ? '•••••••• (OKX Secret сохранен)'
                    : 'Необязательно для учебного счета'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                OKX_PASSPHRASE (Live Mode)
              </label>
              <input
                name="okxPassphrase"
                type="password"
                placeholder={
                  config?.credentials?.okxTrading?.configured
                    ? '•••••••• (Passphrase сохранен)'
                    : 'Пароль API ключа OKX'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-slate-950 font-black rounded-lg transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить ключи'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
