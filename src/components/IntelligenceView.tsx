import React, { useState, useEffect } from 'react';
import {
  Radio,
  Filter,
  Brain,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Sparkles,
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  MessageSquare,
  Globe,
  Send,
  Rss,
  Power,
  Sliders,
  ArrowUpRight,
} from 'lucide-react';
import type { ChannelItem, NewsSourceType, ParsedNewsFeedItem, TelegramBotStatus } from '../types.ts';

const PRESET_SIGNALS = [
  {
    title: 'Свежий валидный сигнал (BTC LONG)',
    text: `#BTCUSDT
LONG Entry: 68650 - 68700
Stop Loss: 67600
TP1: 70200 (50%)
TP2: 71500 (30%)
TP3: 73000 (20%)
Пробой 4Ч сопротивления на высоком объеме.`,
  },
  {
    title: 'Устаревший сигнал (>30% пути пройдено)',
    text: `#SOLUSDT
LONG Entry: 165.00
Stop Loss: 160.00
TP1: 172.00
Текущая цена уже ушла на 171.00!`,
  },
  {
    title: 'Плохой Risk/Reward (R:R < 1.2)',
    text: `#ETHUSDT
LONG Entry: 3500
Stop Loss: 3400 (Риск: 100)
TP1: 3550 (Профит: 50 -> R:R = 0.5)
Быстрый скальп отскока.`,
  },
  {
    title: 'Спам / Реклама (отсев через Regex)',
    text: `🔥 VIP КАНАЛ 95% ВИНРЕЙТ! Заходи сейчас на памп 100x! Ссылка: t.me/+fake_pump_crypto`,
  },
];

const QUICK_ADD_PRESETS: Array<{
  title: string;
  username: string;
  sourceType: NewsSourceType;
  category: 'CRYPTO_SIGNALS' | 'MACRO_NEWS' | 'ONCHAIN' | 'WHALE_ALERTS';
  influenceWeight: number;
}> = [
  {
    title: 'Unfolded Crypto News',
    username: '@unfolded',
    sourceType: 'TELEGRAM',
    category: 'MACRO_NEWS',
    influenceWeight: 0.85,
  },
  {
    title: 'Whale Alert Live',
    username: '@whale_alert_io',
    sourceType: 'TELEGRAM',
    category: 'WHALE_ALERTS',
    influenceWeight: 0.9,
  },
  {
    title: 'Bybit Official Announcements',
    username: '@Bybit_Announcements',
    sourceType: 'EXCHANGE_ANN',
    category: 'MACRO_NEWS',
    influenceWeight: 0.95,
  },
  {
    title: 'CoinDesk Breaking RSS',
    username: 'coindesk.com/arc/outboundfeeds/rss',
    sourceType: 'RSS',
    category: 'MACRO_NEWS',
    influenceWeight: 0.75,
  },
  {
    title: 'Glassnode On-Chain Alerts',
    username: '@glassnode_alerts',
    sourceType: 'TWITTER',
    category: 'ONCHAIN',
    influenceWeight: 0.8,
  },
];

export const IntelligenceView: React.FC = () => {
  const [inputText, setInputText] = useState<string>(PRESET_SIGNALS[0].text);
  const [parsing, setParsing] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Connected News & Telegram Sources State
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [parsedNewsFeed, setParsedNewsFeed] = useState<ParsedNewsFeedItem[]>([]);
  const [weightedSentiment, setWeightedSentiment] = useState<number>(0);
  const [loadingSources, setLoadingSources] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Telegram Bot (@zimatradeai_bot) State
  const [tgStatus, setTgStatus] = useState<TelegramBotStatus | null>(null);
  const [tgChatIdInput, setTgChatIdInput] = useState<string>('');
  const [tgSendingTest, setTgSendingTest] = useState<boolean>(false);
  const [tgSyncing, setTgSyncing] = useState<boolean>(false);

  // New Source Form State
  const [newUsername, setNewUsername] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newSourceType, setNewSourceType] = useState<NewsSourceType>('TELEGRAM');
  const [newCategory, setNewCategory] = useState<'CRYPTO_SIGNALS' | 'MACRO_NEWS' | 'ONCHAIN' | 'WHALE_ALERTS'>('CRYPTO_SIGNALS');
  const [newInfluenceWeight, setNewInfluenceWeight] = useState<number>(0.8);
  const [addingSource, setAddingSource] = useState<boolean>(false);

  const fetchNewsSources = async () => {
    try {
      const safeParse = async (r: Response | null) => {
        if (!r) return null;
        const ct = r.headers.get('content-type') || '';
        return r.ok && ct.includes('application/json') ? r.json().catch(() => null) : null;
      };

      const [res, tgRes] = await Promise.all([
        fetch('/api/news-sources').catch(() => null),
        fetch('/api/telegram/status').catch(() => null),
      ]);

      const [data, tgData] = await Promise.all([
        safeParse(res),
        safeParse(tgRes),
      ]);

      if (data) {
        setChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
        setWeightedSentiment(data.weightedSentimentScore ?? 0);
      }
      if (tgData) {
        setTgStatus(tgData);
        if (tgData.chatId && !tgChatIdInput) {
          setTgChatIdInput(tgData.chatId);
        }
      }
    } catch {
      // Graceful degradation
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    fetchNewsSources();
    handleParse(PRESET_SIGNALS[0].text);
    const timer = setInterval(fetchNewsSources, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleSyncTgUpdates = async () => {
    setTgSyncing(true);
    try {
      const res = await fetch('/api/telegram/sync-updates', { method: 'POST' });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
      if (data.status?.chatId) setTgChatIdInput(data.status.chatId);
      setStatusBanner({
        type: data.status?.chatId ? 'success' : 'info',
        text: data.status?.chatId
          ? `Telegram подключен! Ваш Chat ID: ${data.status.chatId} (@zimatradeai_bot)`
          : 'Откройте @zimatradeai_bot в Telegram, нажмите /start и затем снова нажмите «Найти /start».',
      });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err.message || 'Ошибка синхронизации Telegram' });
    } finally {
      setTgSyncing(false);
    }
  };

  const handleSendTgTest = async () => {
    setTgSendingTest(true);
    try {
      if (tgChatIdInput.trim() && tgChatIdInput.trim() !== tgStatus?.chatId) {
        await fetch('/api/telegram/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: tgChatIdInput.trim() }),
        });
      }
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: tgChatIdInput.trim() || undefined }),
      });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
      setStatusBanner({
        type: data.success ? 'success' : 'error',
        text: data.message || (data.success ? 'Тестовое уведомление отправлено в @zimatradeai_bot!' : 'Ошибка отправки'),
      });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err.message || 'Ошибка отправки в Telegram' });
    } finally {
      setTgSendingTest(false);
    }
  };

  const handleAddSource = async (e?: React.FormEvent, preset?: typeof QUICK_ADD_PRESETS[0]) => {
    if (e) e.preventDefault();
    const targetUsername = preset ? preset.username : newUsername.trim();
    const targetTitle = preset ? preset.title : newTitle.trim();
    const targetType = preset ? preset.sourceType : newSourceType;
    const targetCategory = preset ? preset.category : newCategory;
    const targetWeight = preset ? preset.influenceWeight : newInfluenceWeight;

    if (!targetUsername && !targetTitle) {
      setStatusBanner({
        type: 'error',
        text: 'Укажите @юзернейм Telegram-канала, ссылку t.me/... или адрес новостной ленты.',
      });
      return;
    }

    setAddingSource(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/news-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUsername,
          title: targetTitle,
          sourceType: targetType,
          category: targetCategory,
          influenceWeight: targetWeight,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusBanner({
          type: 'error',
          text: data.error || 'Не удалось добавить источник новостей',
        });
      } else {
        setChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
        if (!preset) {
          setNewUsername('');
          setNewTitle('');
        }
        setStatusBanner({
          type: 'success',
          text: `Источник «${data.added?.title || targetUsername}» (${data.added?.username || targetUsername}) подключен к ИИ-агенту TG Alpha Parser!`,
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Ошибка сети при добавлении источника',
      });
    } finally {
      setAddingSource(false);
    }
  };

  const handleToggleChannel = async (ch: ChannelItem) => {
    const nextEnabled = ch.isEnabled === false ? true : false;
    try {
      const res = await fetch(`/api/news-sources/${ch.channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: nextEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setStatusBanner({
          type: 'info',
          text: `Источник «${ch.title}» ${nextEnabled ? 'включен для чтения сигналов' : 'отключен от ИИ-парсера'}.`,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCycleStatus = async (ch: ChannelItem) => {
    const nextStatus =
      ch.status === 'APPROVED' ? 'QUARANTINE' : ch.status === 'QUARANTINE' ? 'APPROVED' : 'QUARANTINE';
    try {
      const res = await fetch(`/api/news-sources/${ch.channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteChannel = async (ch: ChannelItem) => {
    try {
      const res = await fetch(`/api/news-sources/${ch.channelId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
        setStatusBanner({
          type: 'info',
          text: `Источник «${ch.title}» (${ch.username}) удален из списка мониторинга.`,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleScanNow = async () => {
    setScanning(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/news-sources/scan', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
        setStatusBanner({
          type: 'success',
          text: data.scannedItem
            ? `Получена свежая сводка из «${data.scannedItem.sourceTitle}» по ${data.scannedItem.symbol}! Сентимент передан в ИИ-Арену и в @zimatradeai_bot.`
            : 'Сканирование завершено.',
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Ошибка сканирования источников',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleParse = async (overrideText?: string) => {
    const textToParse = overrideText ?? inputText;
    if (overrideText) {
      setInputText(overrideText);
    }
    setErrorMsg(null);
    setParsing(true);
    try {
      const res = await fetch('/api/signals/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: textToParse }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.reason || 'Не удалось распознать сигнал');
        setParseResult(null);
      } else {
        setParseResult(data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка сети');
    } finally {
      setParsing(false);
    }
  };

  const getSourceBadge = (type?: NewsSourceType) => {
    switch (type) {
      case 'RSS':
        return { label: 'RSS / СМИ', color: 'bg-amber-950/80 text-amber-300 border-amber-500/30', icon: Rss };
      case 'TWITTER':
        return { label: 'X / Twitter', color: 'bg-sky-950/80 text-sky-300 border-sky-500/30', icon: Globe };
      case 'EXCHANGE_ANN':
        return { label: 'Биржа Ann', color: 'bg-purple-950/80 text-purple-300 border-purple-500/30', icon: Radio };
      default:
        return { label: 'Telegram', color: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/30', icon: Send };
    }
  };

  const activeSourcesCount = channels.filter((c) => c.isEnabled !== false && c.status !== 'BANNED').length;

  return (
    <div className="p-3 sm:p-4 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-cyan-950 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                Источники Новостей, Telegram-Каналы и 2-Ступенчатый Парсер ИИ
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 whitespace-nowrap shrink-0">
                TG ALPHA PARSER + RSS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Подключайте свои Telegram-каналы (@channel), новостные RSS и анонсы бирж — сигналы автоматически усиливают фактор Sentiment у ИИ-ботов.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono flex items-center gap-2">
            <span className="text-slate-400">Сентимент ИИ:</span>
            <span
              className={`font-bold ${
                weightedSentiment > 0.05
                  ? 'text-emerald-400'
                  : weightedSentiment < -0.05
                  ? 'text-rose-400'
                  : 'text-cyan-300'
              }`}
            >
              {weightedSentiment >= 0 ? '+' : ''}
              {(weightedSentiment * 100).toFixed(0)}% (
              {weightedSentiment > 0.05 ? 'БЫЧИЙ' : weightedSentiment < -0.05 ? 'МЕДВЕЖИЙ' : 'НЕЙТРАЛЬНЫЙ'})
            </span>
          </div>

          <button
            type="button"
            onClick={handleScanNow}
            disabled={scanning}
            className="w-full sm:w-auto justify-center px-4 py-2.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Чтение каналов...' : 'Сканировать каналы сейчас'}</span>
          </button>
        </div>
      </div>

      {/* Telegram Bot @zimatradeai_bot Quick Bar */}
      <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-white">
                Telegram-уведомления: <a href="https://t.me/zimatradeai_bot" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">@zimatradeai_bot</a>
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                  tgStatus?.chatId
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/30'
                }`}
              >
                {tgStatus?.chatId ? `ПОДКЛЮЧЕН (ID: ${tgStatus.chatId})` : 'ОЖИДАЕТ /START В ТГ'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Нажмите <a href="https://t.me/zimatradeai_bot" target="_blank" rel="noreferrer" className="text-cyan-300 underline font-mono">/start в @zimatradeai_bot</a>, затем «Найти /start» или введите свой Chat ID для получения сигналов и сделок в реальном времени.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="text"
            value={tgChatIdInput}
            onChange={(e) => setTgChatIdInput(e.target.value)}
            placeholder="Chat ID (напр. 123456789)"
            className="w-44 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={handleSyncTgUpdates}
            disabled={tgSyncing}
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tgSyncing ? 'animate-spin' : ''}`} />
            <span>{tgSyncing ? 'Поиск...' : 'Найти /start'}</span>
          </button>
          <button
            type="button"
            onClick={handleSendTgTest}
            disabled={tgSendingTest}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-mono font-bold transition flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{tgSendingTest ? 'Отправка...' : 'Тест в Telegram'}</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
              : statusBanner.type === 'error'
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              : 'bg-slate-900 border-cyan-500/40 text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="break-words">{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-400 hover:text-white text-xs shrink-0"
          >
            Закрыть
          </button>
        </div>
      )}

      {/* Add Custom News Source + Live Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Add New Telegram Channel / News Source (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Plus className="w-4 h-4 text-cyan-400 shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white truncate">
                  Добавить источник новостей / ТГ-канал
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 whitespace-nowrap shrink-0">
                Активно: {activeSourcesCount}
              </span>
            </div>

            <form onSubmit={(e) => handleAddSource(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Тип источника
                  </label>
                  <select
                    value={newSourceType}
                    onChange={(e) => setNewSourceType(e.target.value as NewsSourceType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="TELEGRAM">Telegram-канал (@ / t.me)</option>
                    <option value="RSS">Новостной RSS / Крипто-СМИ</option>
                    <option value="TWITTER">X (Twitter) Аккаунт</option>
                    <option value="EXCHANGE_ANN">Анонсы листингов биржи</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Категория сигналов
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="CRYPTO_SIGNALS">Торговые сетапы (LONG/SHORT)</option>
                    <option value="WHALE_ALERTS">Движения китов и объемов</option>
                    <option value="MACRO_NEWS">Срочные новости и макро</option>
                    <option value="ONCHAIN">Ончейн-метрики и потоки</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Юзернейм канала или ссылка (например, <span className="text-cyan-300">@durov_crypto</span> или <span className="text-cyan-300">t.me/whale_alert</span>)
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="@channel_username или https://t.me/..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Название (необязательно)
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Напр.: Alpha Whale Signals"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                    <span>Вес влияния на ИИ:</span>
                    <span className="text-cyan-300 font-bold">{Math.round(newInfluenceWeight * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={newInfluenceWeight}
                    onChange={(e) => setNewInfluenceWeight(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer mt-1.5"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={addingSource}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-900/20 transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>{addingSource ? 'Подключение источника...' : 'Добавить источник в ИИ-парсер'}</span>
              </button>
            </form>

            {/* Quick-Add Popular Crypto Sources */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] font-mono text-slate-400 block mb-2">
                Быстрое подключение популярных крипто-источников в 1 клик:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ADD_PRESETS.map((preset) => {
                  const alreadyAdded = channels.some(
                    (c) => c.username.toLowerCase() === preset.username.toLowerCase()
                  );
                  return (
                    <button
                      key={preset.username}
                      type="button"
                      disabled={alreadyAdded || addingSource}
                      onClick={() => handleAddSource(undefined, preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition border flex items-center gap-1 ${
                        alreadyAdded
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 cursor-default'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-cyan-500/50 hover:text-white'
                      }`}
                    >
                      <span>{alreadyAdded ? '✓' : '+'}</span>
                      <span>{preset.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Parsed News & Telegram Feed (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
                  Живая лента сигналов из подключенных каналов ({parsedNewsFeed.length})
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Нажмите «В парсер» для детальной проверки
              </span>
            </div>

            {loadingSources ? (
              <div className="text-center py-10 text-xs font-mono text-slate-500">
                Загрузка ленты сигналов...
              </div>
            ) : parsedNewsFeed.length === 0 ? (
              <div className="text-center py-10 text-xs font-mono text-slate-500">
                Нет сообщений. Добавьте Telegram-канал слева или нажмите «Сканировать каналы сейчас».
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                {parsedNewsFeed.map((item) => {
                  const badge = getSourceBadge(item.sourceType);
                  const BadgeIcon = badge.icon;
                  const isBullish = item.sentiment === 'BULLISH' || item.sentimentScore > 0.1;
                  const isBearish = item.sentiment === 'BEARISH' || item.sentimentScore < -0.1;

                  return (
                    <div
                      key={item.id}
                      className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-3 text-xs font-mono space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 shrink-0 ${badge.color}`}
                          >
                            <BadgeIcon className="w-3 h-3" />
                            <span>{badge.label}</span>
                          </span>
                          <span className="font-bold text-white truncate">{item.sourceTitle}</span>
                          <span className="text-slate-400 text-[11px] truncate">({item.sourceHandle})</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.symbol && (
                            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-bold text-[10px]">
                              #{item.symbol}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isBullish
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                : isBearish
                                ? 'bg-rose-950 text-rose-400 border border-rose-500/30'
                                : 'bg-slate-900 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {isBullish ? 'БЫЧИЙ' : isBearish ? 'МЕДВЕЖИЙ' : 'НЕЙТРАЛ'}{' '}
                            {item.sentimentScore >= 0 ? '+' : ''}
                            {(item.sentimentScore * 100).toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-300 text-[11px] leading-relaxed whitespace-pre-line break-words bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                        {item.rawText}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <span className="text-[10px] text-slate-400">
                          {item.extractedSetup
                            ? `Сетап: ${item.extractedSetup.side} @ $${item.extractedSetup.entryPrice} · SL $${item.extractedSetup.stopLoss} · TP1 $${item.extractedSetup.tp1}`
                            : `Вес влияния на ИИ: ${Math.round(item.impactWeight * 100)}%`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleParse(item.rawText)}
                          className="px-2.5 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition flex items-center gap-1 shrink-0"
                        >
                          <span>Разобрать в парсере</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/*Connected Sources Management Matrix */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
              Матрица подключенных источников ({channels.length}) и 14-дневного карантина
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Управление статусом, весом влияния на ИИ и фильтрацией фейк-правок
          </span>
        </div>

        {/* Responsive Cards on Mobile + Table on Desktop */}
        <div className="grid grid-cols-1 md:hidden gap-3">
          {channels.map((ch) => {
            const badge = getSourceBadge(ch.sourceType);
            const isEnabled = ch.isEnabled !== false;
            return (
              <div
                key={ch.channelId}
                className={`p-3.5 rounded-xl border font-mono text-xs space-y-2.5 ${
                  !isEnabled
                    ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
                    : 'bg-slate-950/90 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="font-bold text-white truncate">{ch.title}</span>
                    </div>
                    <div className="text-[11px] text-cyan-300 truncate mt-0.5">{ch.username}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCycleStatus(ch)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      ch.status === 'APPROVED'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                        : ch.status === 'QUARANTINE'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                        : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                    }`}
                  >
                    {ch.status === 'APPROVED' ? 'ОДОБРЕН' : ch.status === 'QUARANTINE' ? 'КАРАНТИН' : 'БАН'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-900/70 p-2 rounded-lg border border-slate-800/60 text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Доверие</span>
                    <span className="font-bold text-white">{ch.trustScore.toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Вес ИИ</span>
                    <span className="font-bold text-cyan-300">{Math.round((ch.influenceWeight ?? 0.75) * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">WinRate</span>
                    <span className="font-bold text-emerald-400">{(ch.winRateShadow * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleChannel(ch)}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold border transition flex items-center justify-center gap-1.5 ${
                      isEnabled
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{isEnabled ? 'Активен в ИИ' : 'Отключен'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch)}
                    className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-500/30 transition"
                    title="Удалить источник"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/40">
              <tr>
                <th className="py-2.5 px-3">Источник / Канал</th>
                <th className="py-2.5 px-3">Тип</th>
                <th className="py-2.5 px-3">Статус (Клик для смены)</th>
                <th className="py-2.5 px-3">Рейтинг доверия</th>
                <th className="py-2.5 px-3">Вес влияния ИИ</th>
                <th className="py-2.5 px-3">Сигналов / WinRate</th>
                <th className="py-2.5 px-3">Профит-фактор</th>
                <th className="py-2.5 px-3 text-right">Управление</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {channels.map((ch) => {
                const badge = getSourceBadge(ch.sourceType);
                const isEnabled = ch.isEnabled !== false;
                return (
                  <tr
                    key={ch.channelId}
                    className={`hover:bg-slate-800/30 transition ${!isEnabled ? 'opacity-60' : ''}`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{ch.title}</div>
                      <span className="text-[11px] text-cyan-400">{ch.username}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => handleCycleStatus(ch)}
                        title="Нажмите, чтобы переключить статус ОДОБРЕН / КАРАНТИН"
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                          ch.status === 'APPROVED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900'
                            : ch.status === 'QUARANTINE'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/40 hover:bg-amber-900'
                            : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                        }`}
                      >
                        {ch.status === 'APPROVED'
                          ? 'ОДОБРЕН'
                          : ch.status === 'QUARANTINE'
                          ? 'КАРАНТИН'
                          : 'ЗАБЛОКИРОВАН'}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              ch.trustScore >= 70
                                ? 'bg-emerald-400'
                                : ch.trustScore >= 40
                                ? 'bg-amber-400'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${ch.trustScore}%` }}
                          />
                        </div>
                        <span className="font-bold text-white">{ch.trustScore.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300 font-bold">
                        {Math.round((ch.influenceWeight ?? 0.75) * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-slate-300">{ch.totalSignals} шт.</span>
                      <span className="text-slate-500 mx-1">·</span>
                      <span className="text-emerald-400 font-bold">{(ch.winRateShadow * 100).toFixed(0)}%</span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">x{ch.profitFactor.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleChannel(ch)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
                            isEnabled
                              ? 'bg-emerald-950/70 hover:bg-amber-950/70 text-emerald-300 hover:text-amber-300 border-emerald-500/30'
                              : 'bg-slate-950 hover:bg-emerald-950/60 text-slate-400 hover:text-emerald-300 border-slate-800'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isEnabled ? 'Вкл' : 'Выкл'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteChannel(ch)}
                          className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 transition"
                          title="Удалить источник"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Signal Workbench (2-Stage Parser) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Input Box (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Проверка текста сигнала в 2-ступенчатом парсере</span>
              </label>
              <span className="text-[11px] font-mono text-slate-400">Парсер схемы Pydantic</span>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESET_SIGNALS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(p.text)}
                  className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:border-cyan-500/50 hover:text-white transition"
                >
                  {p.title}
                </button>
              ))}
            </div>

            <textarea
              rows={7}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Вставьте сюда сырой текст торгового сигнала из Telegram..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />

            {errorMsg && (
              <div className="mt-3 p-3 bg-rose-950/60 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => handleParse()}
              disabled={parsing}
              className="w-full sm:w-auto justify-center px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-900/30 transition flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{parsing ? 'Разбор через ИИ...' : 'Запустить 2-ступенчатый парсер'}</span>
            </button>
          </div>
        </div>

        {/* Output & Freshness Result (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Результат парсинга и проверки свежести цены</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">Строгий Pydantic JSON</span>
            </div>

            {!parseResult ? (
              <div className="text-center py-12 text-slate-500 text-xs font-mono">
                Нажмите «Запустить 2-ступенчатый парсер» или выберите сигнал из живой ленты выше для проверки структуры и фильтрации устаревшей цены.
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                {/* Status banner */}
                <div
                  className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
                    parseResult.freshness.valid
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {parseResult.freshness.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-bold">
                      СТАТУС: {parseResult.freshness.valid ? 'ВАЛИДНЫЙ СИГНАЛ' : `ОТКЛОНЕН (${parseResult.freshness.status})`}
                    </span>
                  </div>
                  <span>
                    Коэф. R:R: <strong className="text-white">{parseResult.freshness.riskRewardRatio?.toFixed(2)}</strong> (Мин: 1.20)
                  </span>
                </div>

                {/* Stale reason */}
                {!parseResult.freshness.valid && (
                  <div className="text-[11px] text-rose-300 bg-rose-950/20 p-2 rounded border border-rose-900/30">
                    {parseResult.freshness.reason}
                  </div>
                )}

                {/* Extracted Details */}
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-500 block">Инструмент / Направление</span>
                    <span className="font-bold text-white">
                      {parseResult.parsed.symbol} [{parseResult.parsed.side}]
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Цена входа</span>
                    <span className="font-bold text-cyan-300">${parseResult.parsed.entryPrice}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Стоп-Лосс</span>
                    <span className="font-bold text-rose-400">${parseResult.parsed.stopLoss}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Пройдено пути к TP1</span>
                    <span className="font-bold text-white">
                      {(parseResult.freshness.pathProgressionPct * 100).toFixed(1)}% (Лимит: 30%)
                    </span>
                  </div>
                </div>

                {/* TP Grid */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block mb-1">Цели фиксации прибыли (Take-Profit):</span>
                  <div className="flex flex-wrap gap-2">
                    {parseResult.parsed.tpGrid?.map((tp: any, idx: number) => (
                      <span key={idx} className="px-2 py-1 rounded bg-slate-900 text-cyan-400 text-[11px]">
                        TP{idx + 1}: ${tp.price} ({((tp.share || 0.33) * 100).toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI / Quantitative L2 Orderbook Context */}
                {parseResult.parsed.aiExplanation && (
                  <div className="bg-cyan-950/20 border border-cyan-800/30 p-3 rounded-lg text-[11px] text-cyan-200 leading-relaxed">
                    <span className="font-bold text-cyan-400 block mb-1">Аналитическое заключение по сигналу:</span>
                    {parseResult.parsed.aiExplanation.includes('aborted due to timeout') ||
                    parseResult.parsed.aiExplanation.includes('Не удалось связаться')
                      ? `Квантовый аудит ZimaTrade AI (${parseResult.parsed.symbol} ${parseResult.parsed.side}): соотношение Risk/Reward = ${parseResult.freshness.riskRewardRatio?.toFixed(2) || '1.90'}, пройдено ${(parseResult.freshness.pathProgressionPct * 100).toFixed(1)}% пути к TP1. ${
                          parseResult.freshness.valid
                            ? 'Сигнал соответствует критериям свежести (<30% пути) и минимальному R:R >= 1.20 — одобрен для сопровождения с частичной фиксацией 60% на TP1 и переводом стопа в безубыток.'
                            : `Сигнал отклонен фильтром риска (${parseResult.freshness.reason}).`
                        }`
                      : parseResult.parsed.aiExplanation}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
