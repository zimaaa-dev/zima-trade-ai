import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Play,
  Pause,
  RefreshCw,
  Sliders,
  XCircle,
  Save,
  Brain,
  Sparkles,
  RotateCcw,
  Activity,
  TrendingUp,
  GitCompare,
  Radio,
  Plus,
  Send,
  Rss,
  Globe,
  Trash2,
  Power,
  Flame,
  Copy,
  Terminal,
  Check,
} from 'lucide-react';
import type {
  AgentItem,
  BotLogEntry,
  Position,
  XaiDecisionRecord,
  RewardHistoryPoint,
  ChannelItem,
  NewsSourceType,
  ParsedNewsFeedItem,
  TelegramBotStatus,
} from '../types.ts';
import { RewardCurveChart } from './RewardCurveChart.tsx';
import { MetricTooltip, type MetricId } from './MetricTooltip.tsx';

const AVAILABLE_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'HYPEUSDT',
  'NEARUSDT',
  'SUIUSDT',
  'DOGEUSDT',
  '1000PEPEUSDT',
  'XRPUSDT',
  'AVAXUSDT',
  'AAVEUSDT',
  'ENAUSDT',
  'LINKUSDT',
  'TRXUSDT',
  'APTUSDT',
  'ZECUSDT',
];

interface BotDraftConfig {
  riskPerTradePct: number;
  leverage: number;
  tpSlRatio: number;
  maxConcurrentPositions: number;
  allowedSymbols: string[];
  dynamicScreenerScan: boolean;
  confidenceThreshold: number;
  atrMultiplier: number;
  learningRate: number;
}

const RewardSparklineSvg: React.FC<{ history: RewardHistoryPoint[] }> = ({ history }) => {
  if (!history || history.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-[11px] font-mono text-slate-500">
        Нет точек кривой обучения
      </div>
    );
  }

  const width = 320;
  const height = 64;
  const padX = 8;
  const padY = 8;

  const values = history.map((h) => h.cumulativeReward);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0.5, ...values);
  const range = Math.max(0.2, maxVal - minVal);

  const pts = history.map((pt, idx) => {
    const x =
      history.length === 1
        ? width / 2
        : padX + (idx / (history.length - 1)) * (width - padX * 2);
    const y = height - padY - ((pt.cumulativeReward - minVal) / range) * (height - padY * 2);
    return { x, y, pt };
  });

  const polylinePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `${pts[0].x.toFixed(1)},${height - padY} ${polylinePoints} ${pts[pts.length - 1].x.toFixed(1)},${height - padY}`;
  const lastVal = values[values.length - 1] ?? 0;
  const strokeColor = lastVal >= 0 ? '#10b981' : '#f43f5e';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-16 overflow-visible bg-slate-950/90 rounded border border-slate-800/80"
    >
      <defs>
        <linearGradient id="rlRewardGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#rlRewardGrad)" />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
      />
      {pts.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r={idx === pts.length - 1 ? 3.2 : 2}
          fill={idx === pts.length - 1 ? '#22d3ee' : strokeColor}
        >
          <title>
            {p.pt.label}: {p.pt.reward >= 0 ? '+' : ''}
            {p.pt.reward.toFixed(2)}R (Σ {p.pt.cumulativeReward.toFixed(2)}R)
          </title>
        </circle>
      ))}
    </svg>
  );
};

export const AiArenaView: React.FC = () => {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [activePositions, setActivePositions] = useState<Position[]>([]);
  const [xaiDecisions, setXaiDecisions] = useState<XaiDecisionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [promotionStatus, setPromotionStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(
    null
  );
  const [botsState, setBotsState] = useState<{
    isRunning: boolean;
    speedMs: number;
    bots: AgentItem[];
    recentLogs: BotLogEntry[];
    xaiDecisions?: XaiDecisionRecord[];
  } | null>(null);
  const [tickingBot, setTickingBot] = useState<boolean>(false);
  const [trainingBotId, setTrainingBotId] = useState<string | null>(null);

  // Expanded config drawer per botId
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [draftConfigs, setDraftConfigs] = useState<Record<string, BotDraftConfig>>({});
  const [savingBotId, setSavingBotId] = useState<string | null>(null);
  const [closingBotId, setClosingBotId] = useState<string | null>(null);

  // Bottom studio tab & XAI filter
  const [bottomTab, setBottomTab] = useState<'XAI' | 'LOGS'>('XAI');
  const [selectedXaiBot, setSelectedXaiBot] = useState<string>('ALL');

  // Dual-strategy comparison pair [Strategy A, Strategy B] synced with RewardCurveChart
  const [comparePair, setComparePair] = useState<[string, string]>([
    'agent-onnx-ppo-v2',
    'agent-lgbm-nightly',
  ]);

  // News & Telegram Sources State for AI Sentiment & TG Alpha Parser Agent
  const [newsChannels, setNewsChannels] = useState<ChannelItem[]>([]);
  const [parsedNewsFeed, setParsedNewsFeed] = useState<ParsedNewsFeedItem[]>([]);
  const [weightedSentiment, setWeightedSentiment] = useState<number>(0);
  const [showNewsManager, setShowNewsManager] = useState<boolean>(true);
  const [newSourceHandle, setNewSourceHandle] = useState<string>('');
  const [newSourceTitle, setNewSourceTitle] = useState<string>('');
  const [newSourceType, setNewSourceType] = useState<NewsSourceType>('TELEGRAM');
  const [addingSource, setAddingSource] = useState<boolean>(false);
  const [scanningSources, setScanningSources] = useState<boolean>(false);

  // Telegram Bot (@zimatradeai_bot) Notification State
  const [tgStatus, setTgStatus] = useState<TelegramBotStatus | null>(null);
  const [tgChatIdInput, setTgChatIdInput] = useState<string>('');
  const [testingTg, setTestingTg] = useState<boolean>(false);
  const [syncingTg, setSyncingTg] = useState<boolean>(false);

  // Market Trend & Autonomous Retraining Recommendation Monitor
  const [trendAudit, setTrendAudit] = useState<{
    regime: string;
    marketRegime?: string;
    regimeTitle: string;
    regimeSummary: string;
    regimeDescription?: string;
    recommendedCommand?: string;
    totalPairsScanned?: number;
    advancersCount?: number;
    declinersCount?: number;
    marketBreadthPct?: number;
    topGainers?: Array<{ symbol: string; priceChangePct: number; turnover24h: number; atrPct: number; price: number }>;
    topLosers?: Array<{ symbol: string; priceChangePct: number; turnover24h: number; atrPct: number; price: number }>;
    topTrendingSymbols?: string[];
    btcChange24hPct: number;
    ethChange24hPct: number;
    solChange24hPct: number;
    avgAtrPct: number;
    isRetrainingRecommended: boolean;
    retrainingReason: string;
    hoursSinceLastTrain: number;
    autoAdaptationActive?: boolean;
    lastAutoAdaptedAt?: number;
  } | null>(null);
  const [autoAdaptEnabled, setAutoAdaptEnabled] = useState<boolean>(true);
  const [isSyncingAdapt, setIsSyncingAdapt] = useState<boolean>(false);
  const [isAuditingTrends, setIsAuditingTrends] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const lastSlowMetaFetchTs = useRef<number>(0);

  const fetchTrendAudit = async () => {
    try {
      const res = await fetch('/api/ai/trend-audit');
      if (res.ok) {
        const data = await res.json();
        setTrendAudit(data);
        if (typeof data.autoAdaptationActive === 'boolean') {
          setAutoAdaptEnabled(data.autoAdaptationActive);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleToggleAutoAdapt = async () => {
    const nextVal = !autoAdaptEnabled;
    setAutoAdaptEnabled(nextVal);
    try {
      const res = await fetch('/api/bots/auto-adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal, syncNow: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audit) setTrendAudit(data.audit);
        fetchAgentsAndBots();
        setPromotionStatus({
          type: 'success',
          text: nextVal
            ? 'Авто-адаптация к рынку включена: боты будут непрерывно синхронизировать веса и пороги без задержек!'
            : 'Авто-адаптация к рынку отключена.',
        });
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleInstantAutoAdaptSync = async () => {
    setIsSyncingAdapt(true);
    try {
      const res = await fetch('/api/bots/auto-adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncNow: true }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audit) setTrendAudit(data.audit);
        fetchAgentsAndBots();
        setPromotionStatus({
          type: 'success',
          text: 'Параметры ботов мгновенно синхронизированы с текущим рынком без задержек (Zero-Lag Adaptation)!',
        });
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: `Ошибка синхронизации: ${err.message}`,
      });
    } finally {
      setIsSyncingAdapt(false);
    }
  };

  const handleForceAudit = async () => {
    setIsAuditingTrends(true);
    try {
      const res = await fetch('/api/ai/trend-audit/check-now', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.audit) setTrendAudit(data.audit);
      }
    } catch {
      // ignore
    } finally {
      setIsAuditingTrends(false);
    }
  };

  const handleAssignToCompareSlot = (slot: 0 | 1, agentId: string) => {
    setComparePair((prev) => {
      const otherSlot = slot === 0 ? 1 : 0;
      if (prev[otherSlot] === agentId) {
        return slot === 0 ? [agentId, prev[0]] : [prev[1], agentId];
      }
      return slot === 0 ? [agentId, prev[1]] : [prev[0], agentId];
    });
  };

  const fetchAgentsAndBots = async () => {
    try {
      const safeParse = async (r: Response | null) => {
        if (!r) return null;
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) {
          try {
            return await r.json();
          } catch {
            return null;
          }
        }
        return null;
      };

      const now = Date.now();
      const shouldFetchSlowMeta = now - lastSlowMetaFetchTs.current > 25000;
      if (shouldFetchSlowMeta) {
        lastSlowMetaFetchTs.current = now;
      }

      const [agentRes, botRes, posRes, newsRes, tgRes] = await Promise.all([
        fetch('/api/arena/agents').catch(() => null),
        fetch('/api/bots/state').catch(() => null),
        fetch('/api/positions').catch(() => null),
        shouldFetchSlowMeta ? fetch('/api/news-sources').catch(() => null) : Promise.resolve(null),
        shouldFetchSlowMeta ? fetch('/api/telegram/status').catch(() => null) : Promise.resolve(null),
      ]);

      const [agentData, botData, posData, newsData, tgData] = await Promise.all([
        safeParse(agentRes),
        safeParse(botRes),
        safeParse(posRes),
        newsRes ? safeParse(newsRes) : Promise.resolve(null),
        tgRes ? safeParse(tgRes) : Promise.resolve(null),
      ]);

      if (newsData) {
        setNewsChannels(newsData.channels || []);
        setParsedNewsFeed(newsData.parsedNewsFeed || newsData.newsFeed || []);
        setWeightedSentiment(newsData.weightedSentimentScore ?? 0);
      }
      if (tgData) {
        setTgStatus(tgData);
      }
      if (agentData) {
        const list: AgentItem[] = agentData.agents || [];
        setAgents(list);
        setDraftConfigs((prev) => {
          const next = { ...prev };
          for (const a of list) {
            if (!next[a.agentId]) {
              next[a.agentId] = {
                riskPerTradePct: a.riskPerTradePct ?? 1.5,
                leverage: a.leverage ?? 10,
                tpSlRatio: a.tpSlRatio ?? 1.8,
                maxConcurrentPositions: a.maxConcurrentPositions ?? 2,
                allowedSymbols:
                  Array.isArray(a.allowedSymbols) && a.allowedSymbols.length > 0
                    ? a.allowedSymbols
                    : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
                confidenceThreshold: a.brain?.confidenceThreshold ?? 0.21,
                atrMultiplier: a.brain?.atrMultiplier ?? 1.45,
                learningRate: a.brain?.learningRate ?? 0.06,
                dynamicScreenerScan: a.dynamicScreenerScan ?? true,
              };
            }
          }
          return next;
        });
      }
      if (botData) {
        setBotsState(botData);
        if (Array.isArray(botData.xaiDecisions)) {
          setXaiDecisions(botData.xaiDecisions);
        }
      }
      if (posData) {
        setActivePositions(posData.positions || []);
      }
    } catch {
      // Graceful degradation: never throw unhandled console errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentsAndBots();
    fetchTrendAudit();
    const timer = setInterval(fetchAgentsAndBots, 5000);
    const trendTimer = setInterval(fetchTrendAudit, 45000);
    return () => {
      clearInterval(timer);
      clearInterval(trendTimer);
    };
  }, []);

  const handleToggleGlobalBots = async () => {
    try {
      const res = await fetch('/api/bots/toggle', { method: 'POST' });
      if (res.ok) fetchAgentsAndBots();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerBotTick = async () => {
    setTickingBot(true);
    try {
      const res = await fetch('/api/bots/tick', { method: 'POST' });
      if (res.ok) fetchAgentsAndBots();
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setTickingBot(false), 500);
    }
  };

  const handleQuickAddNewsSource = async (e?: React.FormEvent, presetHandle?: string, presetTitle?: string, presetType?: NewsSourceType) => {
    if (e) e.preventDefault();
    const targetUsername = presetHandle ? presetHandle : newSourceHandle.trim();
    const targetTitle = presetTitle ? presetTitle : newSourceTitle.trim();
    const targetType = presetType ? presetType : newSourceType;

    if (!targetUsername && !targetTitle) {
      setPromotionStatus({
        type: 'error',
        text: 'Введите @юзернейм Telegram-канала (например, @unfolded) или ссылку на источник.',
      });
      return;
    }

    setAddingSource(true);
    try {
      const res = await fetch('/api/news-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUsername,
          title: targetTitle,
          sourceType: targetType,
          influenceWeight: 0.85,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromotionStatus({
          type: 'error',
          text: data.error || 'Не удалось добавить источник новостей',
        });
      } else {
        setNewsChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
        if (!presetHandle) {
          setNewSourceHandle('');
          setNewSourceTitle('');
        }
        setPromotionStatus({
          type: 'success',
          text: `Источник «${data.added?.title || targetUsername}» (${data.added?.username}) подключен, первая новость уже обработана парсером!`,
        });
        fetchAgentsAndBots();
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: err.message || 'Ошибка подключения источника',
      });
    } finally {
      setAddingSource(false);
    }
  };

  const handleToggleNewsChannel = async (ch: ChannelItem) => {
    try {
      const res = await fetch(`/api/news-sources/${ch.channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: ch.isEnabled === false ? true : false }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewsChannels(data.channels || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNewsChannel = async (ch: ChannelItem) => {
    try {
      const res = await fetch(`/api/news-sources/${ch.channelId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setNewsChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleScanNewsNow = async () => {
    setScanningSources(true);
    try {
      const res = await fetch('/api/news-sources/scan', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setNewsChannels(data.channels || []);
        setParsedNewsFeed(data.parsedNewsFeed || data.newsFeed || []);
        setPromotionStatus({
          type: 'success',
          text: data.scannedItem
            ? `Считана и обработана свежая новость из «${data.scannedItem.sourceTitle}» (${data.scannedItem.symbol}): индекс сентимента обновлен!`
            : 'Сканирование источников завершено.',
        });
        fetchAgentsAndBots();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScanningSources(false);
    }
  };

  const handleSyncTelegramUpdates = async () => {
    setSyncingTg(true);
    try {
      const res = await fetch('/api/telegram/sync-updates', { method: 'POST' });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
      setPromotionStatus({
        type: data.subscribersCount > 0 ? 'success' : 'info',
        text: data.message || 'Проверка диалогов @zimatradeai_bot выполнена.',
      });
    } catch (err: any) {
      setPromotionStatus({ type: 'error', text: err.message });
    } finally {
      setSyncingTg(false);
    }
  };

  const handleTestTelegramPush = async () => {
    setTestingTg(true);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: tgChatIdInput.trim() || undefined }),
      });
      const data = await res.json();
      if (data.status) setTgStatus(data.status);
      if (tgChatIdInput.trim()) setTgChatIdInput('');
      setPromotionStatus({
        type: data.deliveryStatus === 'DELIVERED' ? 'success' : 'info',
        text: data.message,
      });
    } catch (err: any) {
      setPromotionStatus({ type: 'error', text: err.message });
    } finally {
      setTestingTg(false);
    }
  };

  const handleTrainEpoch = async (agentId: string, botName: string) => {
    setTrainingBotId(agentId);
    setPromotionStatus(null);
    try {
      const res = await fetch('/api/bots/train-epoch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, interval: '5' }),
      });
      const data = await res.json();
      if (res.ok && data.reports && data.reports.length > 0) {
        const rep = data.reports[0];
        setPromotionStatus({
          type: 'success',
          text:
            agentId === 'ALL'
              ? `Завершена пакетная калибровка на исторических свечах (5m) для всех ${data.reports.length} стратегий.`
              : `Цикл #${rep.epochsTrained} («${botName}») откалиброван на рыночных свечах: протестировано ${rep.simulatedTrades} сетапов, WinRate ${rep.winRatePct}%, прирост ${rep.epochReward >= 0 ? '+' : ''}${rep.epochReward.toFixed(2)}R.`,
        });
        await fetchAgentsAndBots();
      } else {
        setPromotionStatus({
          type: 'error',
          text: data.error || 'Не удалось выполнить цикл калибровки',
        });
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: `Ошибка калибровки: ${err.message}`,
      });
    } finally {
      setTrainingBotId(null);
    }
  };

  const handleResetBrain = async (agentId: string, botName: string) => {
    setSavingBotId(agentId);
    try {
      const res = await fetch('/api/bots/reset-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        setPromotionStatus({
          type: 'info',
          text: `Веса факторов и пороги стратегии «${botName}» сброшены к базовым значениям.`,
        });
        await fetchAgentsAndBots();
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: `Ошибка сброса весов: ${err.message}`,
      });
    } finally {
      setSavingBotId(null);
    }
  };

  const handleToggleSingleBot = async (agent: AgentItem) => {
    const nextEnabled = agent.isEnabled === false ? true : false;
    setSavingBotId(agent.agentId);
    try {
      const res = await fetch('/api/bots/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.agentId,
          isEnabled: nextEnabled,
        }),
      });
      if (res.ok) {
        setPromotionStatus({
          type: 'success',
          text: `Бот «${agent.name}» ${nextEnabled ? 'ВКЛЮЧЕН и допущен к многофакторному анализу' : 'поставлен на ПАУЗУ (новые сделки заблокированы)'}.`,
        });
        await fetchAgentsAndBots();
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: `Ошибка изменения статуса бота: ${err.message}`,
      });
    } finally {
      setSavingBotId(null);
    }
  };

  const handleSaveBotConfig = async (agentId: string, botName: string) => {
    const draft = draftConfigs[agentId];
    if (!draft) return;
    if (draft.allowedSymbols.length === 0) {
      setPromotionStatus({
        type: 'error',
        text: 'Выберите хотя бы одну торговую пару для работы стратегии.',
      });
      return;
    }

    setSavingBotId(agentId);
    try {
      const res = await fetch('/api/bots/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          riskPerTradePct: draft.riskPerTradePct,
          leverage: draft.leverage,
          tpSlRatio: draft.tpSlRatio,
          maxConcurrentPositions: draft.maxConcurrentPositions,
          allowedSymbols: draft.allowedSymbols,
          dynamicScreenerScan: draft.dynamicScreenerScan,
          confidenceThreshold: draft.confidenceThreshold,
          atrMultiplier: draft.atrMultiplier,
          learningRate: draft.learningRate,
        }),
      });
      if (res.ok) {
        setPromotionStatus({
          type: 'success',
          text: `Параметры стратегии «${botName}» сохранены: риск ${draft.riskPerTradePct}%, плечо ${draft.leverage}x, порог входа ${draft.confidenceThreshold.toFixed(2)}, ATR SL ${draft.atrMultiplier}x.`,
        });
        setEditingBotId(null);
        await fetchAgentsAndBots();
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: `Ошибка сохранения настроек: ${err.message}`,
      });
    } finally {
      setSavingBotId(null);
    }
  };

  const handleCloseBotPositions = async (agentId: string, botName: string) => {
    setClosingBotId(agentId);
    try {
      const res = await fetch('/api/bots/close-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (res.ok) {
        setPromotionStatus({
          type: 'info',
          text:
            data.closedCount > 0
              ? `Закрыто позиций стратегии «${botName}»: ${data.closedCount} шт.`
              : `У стратегии «${botName}» нет открытых позиций для закрытия.`,
        });
        await fetchAgentsAndBots();
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: `Ошибка закрытия позиций: ${err.message}`,
      });
    } finally {
      setClosingBotId(null);
    }
  };

  const handlePromote = async (agentId: string) => {
    setPromotionStatus(null);
    try {
      const res = await fetch('/api/arena/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromotionStatus({
          type: 'error',
          text: data.error || 'Требования карантина не выполнены.',
        });
      } else {
        setPromotionStatus({
          type: 'success',
          text: 'Успешно! Агент переведен из карантина в БОЕВОЙ режим (LIVE).',
        });
        fetchAgentsAndBots();
      }
    } catch (err: any) {
      setPromotionStatus({
        type: 'error',
        text: err.message || 'Ошибка при переводе агента.',
      });
    }
  };

  const updateDraftField = <K extends keyof BotDraftConfig>(
    agentId: string,
    field: K,
    value: BotDraftConfig[K]
  ) => {
    setDraftConfigs((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] || {
          riskPerTradePct: 1.5,
          leverage: 10,
          tpSlRatio: 1.8,
          maxConcurrentPositions: 2,
          allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
          confidenceThreshold: 0.21,
          atrMultiplier: 1.45,
          learningRate: 0.06,
        }),
        [field]: value,
      },
    }));
  };

  const toggleDraftSymbol = (agentId: string, symbol: string) => {
    const current = draftConfigs[agentId]?.allowedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const exists = current.includes(symbol);
    const next = exists ? current.filter((s) => s !== symbol) : [...current, symbol];
    updateDraftField(agentId, 'allowedSymbols', next);
  };

  const setSymbolPreset = (agentId: string, preset: 'ALL_TRENDS' | 'MAJORS' | 'ALTS' | 'MEMES') => {
    let syms: string[] = [];
    if (preset === 'ALL_TRENDS') {
      syms = AVAILABLE_SYMBOLS;
    } else if (preset === 'MAJORS') {
      syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    } else if (preset === 'ALTS') {
      syms = ['HYPEUSDT', 'SUIUSDT', 'NEARUSDT', 'AVAXUSDT', 'APTUSDT', 'AAVEUSDT'];
    } else if (preset === 'MEMES') {
      syms = ['DOGEUSDT', '1000PEPEUSDT'];
    }
    updateDraftField(agentId, 'allowedSymbols', syms);
    updateDraftField(agentId, 'dynamicScreenerScan', preset === 'ALL_TRENDS');
  };

  const filteredXai =
    selectedXaiBot === 'ALL'
      ? xaiDecisions
      : xaiDecisions.filter((d) => d.botId === selectedXaiBot);

  return (
    <div className="p-3 sm:p-4 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold shrink-0">
            <Brain className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white leading-snug">
                Торговые стратегии и калибровка факторов
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Многофакторный вход (L2 OBI 25 ур. · RSI/EMA · VWAP · ATR-14 SL · TG Sentiment)
            </p>
          </div>
        </div>

        {/* Controls & Gate Info */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewsManager((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 border ${
              showNewsManager
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                : 'bg-slate-950 hover:bg-slate-800 text-cyan-300 border-cyan-500/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>+ ТГ-каналы и новости ({newsChannels.filter((c) => c.isEnabled !== false && c.status !== 'BANNED').length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTrainEpoch('ALL', 'Все стратегии')}
            disabled={trainingBotId !== null}
            className="px-3 py-2 bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 border border-cyan-500/40"
            title="Загрузить исторические свечи (5m) и провести калибровку для всех ботов"
          >
            <Sparkles className={`w-3.5 h-3.5 shrink-0 ${trainingBotId === 'ALL' ? 'animate-spin text-cyan-300' : 'text-cyan-400'}`} />
            <span>{trainingBotId === 'ALL' ? 'Калибровка...' : 'Откалибровать все'}</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerBotTick}
            disabled={tickingBot}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 border border-slate-700"
            title="Форсировать цикл многофакторного анализа и генерацию сделки"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${tickingBot ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{tickingBot ? 'Расчет...' : 'Цикл расчета'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleGlobalBots}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 ${
              botsState?.isRunning
                ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-600/40'
                : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/40'
            }`}
          >
            {botsState?.isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 shrink-0" />
                <span>Общая пауза ботов</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span>Включить авто-торговлю</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Market Regime Shift & Retraining Recommendation Monitor */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  Анализатор рыночных режимов & Детектор сдвига трендов
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-400/30">
                  Bybit / OKX Linear
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Мониторинг трендов 24ч, волатильности ATR и актуальности весов стратегий
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {trendAudit && (
              <span
                className={`px-3 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                  trendAudit.regime === 'STRONG_BULL'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : trendAudit.regime === 'STRONG_BEAR'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : trendAudit.regime === 'HIGH_VOLATILITY'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                }`}
              >
                <span>{trendAudit.regimeTitle}</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleForceAudit}
              disabled={isAuditingTrends}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-medium transition flex items-center gap-1.5 border border-slate-700"
              title="Принудительно пересчитать тренды и отправить рекомендацию в Telegram при необходимости"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditingTrends ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{isAuditingTrends ? 'Анализ...' : 'Проверить сейчас'}</span>
            </button>
          </div>
        </div>

        {/* Market Breadth & Altcoin Screener Metrics */}
        {trendAudit && (
          <div className="space-y-3 font-mono text-xs">
            {/* Market Breadth Header Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-300 font-bold">Охват рынка (Bybit / OKX):</span>
                <span className="text-cyan-300 font-semibold">{trendAudit.totalPairsScanned || 150}+ пар USDT</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <span>Растут: <b className="text-emerald-400">{trendAudit.advancersCount ?? '—'}</b></span>
                <span>Падают: <b className="text-rose-400">{trendAudit.declinersCount ?? '—'}</b></span>
                <span>Ширина рынка: <b className="text-cyan-300">{trendAudit.marketBreadthPct ?? 50}%</b></span>
                <span>Ср. волатильность: <b className="text-amber-300">ATR {trendAudit.avgAtrPct}%</b></span>
              </div>
            </div>

            {/* Top Trending Altcoins (Gainers & Losers) */}
            {trendAudit.topGainers && trendAudit.topGainers.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-300 font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    <span>🔥 Топ лидеры трендов (Импульсы & Пампы рынка):</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Боты торгуют в приоритете L2</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {trendAudit.topGainers.map((g) => (
                    <div
                      key={g.symbol}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 text-xs"
                      title={`24h оборот: $${(g.turnover24h / 1e6).toFixed(1)}M, ATR ${g.atrPct}%`}
                    >
                      <span className="font-bold text-white">{g.symbol}</span>
                      <span className="font-semibold text-emerald-400">+{g.priceChangePct.toFixed(2)}%</span>
                      <span className="text-[10px] text-slate-400 font-mono">${(g.turnover24h / 1e6).toFixed(0)}M</span>
                    </div>
                  ))}
                  {trendAudit.topLosers && trendAudit.topLosers.slice(0, 3).map((l) => (
                    <div
                      key={l.symbol}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 flex items-center gap-2 text-xs"
                      title={`24h оборот: $${(l.turnover24h / 1e6).toFixed(1)}M, ATR ${l.atrPct}%`}
                    >
                      <span className="font-bold text-white">{l.symbol}</span>
                      <span className="font-semibold text-rose-400">{l.priceChangePct.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Core Anchors (BTC, ETH, SOL) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase">BTCUSDT (Якорь)</span>
                <div className={`text-sm font-bold mt-0.5 ${trendAudit.btcChange24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trendAudit.btcChange24hPct >= 0 ? '+' : ''}{trendAudit.btcChange24hPct.toFixed(2)}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase">ETHUSDT (Якорь)</span>
                <div className={`text-sm font-bold mt-0.5 ${trendAudit.ethChange24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trendAudit.ethChange24hPct >= 0 ? '+' : ''}{trendAudit.ethChange24hPct.toFixed(2)}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase">SOLUSDT (L1)</span>
                <div className={`text-sm font-bold mt-0.5 ${trendAudit.solChange24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trendAudit.solChange24hPct >= 0 ? '+' : ''}{trendAudit.solChange24hPct.toFixed(2)}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase">Режим алгоритмов</span>
                <div className="text-xs font-bold text-cyan-300 mt-1 truncate">
                  ⚡ 150+ пар в пуле
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Zero-Lag Adaptive Engine & Market Regime Control */}
        {trendAudit && (
          <div className="space-y-2.5">
            <div
              className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                autoAdaptEnabled
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                  : 'bg-amber-950/25 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                    autoAdaptEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  }`}
                >
                  <Cpu className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-white tracking-wide">
                      {autoAdaptEnabled
                        ? 'АВТОМАТИЧЕСКАЯ АДАПТАЦИЯ К РЫНКУ (Zero-Lag Adaptive Engine)'
                        : 'АВТО-АДАПТАЦИЯ ОТКЛЮЧЕНА (Ручной режим)'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono tracking-wider border ${
                        (trendAudit.marketRegime || trendAudit.regime) === 'ALT_SEASON_MOMENTUM' || (trendAudit.marketRegime || trendAudit.regime) === 'ALT_SEASON_EXPANSION'
                          ? 'bg-purple-950/60 border-purple-500/40 text-purple-300'
                          : (trendAudit.marketRegime || trendAudit.regime) === 'HIGH_VOLATILITY_EXPANSION' || (trendAudit.marketRegime || trendAudit.regime) === 'HIGH_VOLATILITY'
                          ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                          : (trendAudit.marketRegime || trendAudit.regime) === 'MARKET_DUMP' || (trendAudit.marketRegime || trendAudit.regime) === 'MARKET_WIDE_DUMP'
                          ? 'bg-red-950/60 border-red-500/40 text-red-300'
                          : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300'
                      }`}
                    >
                      {trendAudit.regimeTitle || trendAudit.marketRegime || trendAudit.regime || 'RANGE_CHOP'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      (калибровка: {trendAudit.hoursSinceLastTrain}ч назад)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    {autoAdaptEnabled
                      ? trendAudit.regimeSummary ||
                        trendAudit.regimeDescription ||
                        'Веса факторов, пороги входа и ATR-мультипликатор плавно балансируются под текущую фазу рынка без задержек и перезагрузок.'
                      : trendAudit.retrainingReason}
                  </p>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Auto-Adapt Toggle */}
                <button
                  type="button"
                  onClick={handleToggleAutoAdapt}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 shadow-sm ${
                    autoAdaptEnabled
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  }`}
                  title="Включить / отключить автоматическую адаптацию параметров ботов к рынку"
                >
                  <Zap className={`w-3.5 h-3.5 ${autoAdaptEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{autoAdaptEnabled ? 'Авто-адаптация ВКЛ' : 'Включить авто'}</span>
                </button>

                {/* Instant Sync Button */}
                <button
                  type="button"
                  onClick={handleInstantAutoAdaptSync}
                  disabled={isSyncingAdapt}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 shadow-sm"
                  title="Немедленно обновить профили и веса всех ботов под текущий режим"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAdapt ? 'animate-spin' : ''}`} />
                  <span>{isSyncingAdapt ? 'Синхронизация...' : 'Синхронизировать'}</span>
                </button>

                {/* Copy Terminal Command for offline deep historical backtesting */}
                <button
                  type="button"
                  onClick={() => {
                    const cmd = trendAudit.recommendedCommand || 'python3 scripts/train_pc.py --epochs 5';
                    navigator.clipboard.writeText(cmd);
                    setCopiedCmd(true);
                    setTimeout(() => setCopiedCmd(false), 2000);
                  }}
                  className="px-2.5 py-1.5 bg-black/60 hover:bg-black/80 border border-white/[0.08] text-slate-300 hover:text-white rounded-lg text-xs font-mono transition flex items-center gap-1 shrink-0"
                  title="Скопировать команду глубокого обучения для ПК"
                >
                  {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Terminal className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedCmd ? 'Скопировано!' : 'train_pc.py'}</span>
                </button>
              </div>
            </div>

            {/* Offline warning if auto-adaptation is intentionally turned off */}
            {!autoAdaptEnabled && trendAudit.isRetrainingRecommended && (
              <div className="px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Авто-адаптация отключена: рекомендуется запустить калибровку на ПК или включить автоматическую адаптацию.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Inline News & Telegram Channels Manager */}
      {showNewsManager && (
        <div className="bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0">
                <Send className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  Источники новостей и Telegram-каналы (TG Alpha Parser)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Подключенные ТГ-каналы (@channel), RSS и X-аккаунты формируют индекс Sentiment
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">
                Индекс сентимента:{' '}
                <strong className={weightedSentiment >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {weightedSentiment >= 0 ? '+' : ''}
                  {(weightedSentiment * 100).toFixed(0)}%
                </strong>
              </span>
              <button
                type="button"
                onClick={handleScanNewsNow}
                disabled={scanningSources}
                className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanningSources ? 'animate-spin' : ''}`} />
                <span>{scanningSources ? 'Чтение...' : 'Сканировать сейчас'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNewsManager(false)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
              >
                Скрыть
              </button>
            </div>
          </div>

          {/* Quick Add Form */}
          <form onSubmit={(e) => handleQuickAddNewsSource(e)} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-3">
              <select
                value={newSourceType}
                onChange={(e) => setNewSourceType(e.target.value as NewsSourceType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="TELEGRAM">Telegram (@ / t.me)</option>
                <option value="RSS">Новостной RSS</option>
                <option value="TWITTER">X / Twitter</option>
                <option value="EXCHANGE_ANN">Анонсы бирж</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <input
                type="text"
                value={newSourceHandle}
                onChange={(e) => setNewSourceHandle(e.target.value)}
                placeholder="@telegram_channel или ссылка t.me/..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="sm:col-span-3">
              <input
                type="text"
                value={newSourceTitle}
                onChange={(e) => setNewSourceTitle(e.target.value)}
                placeholder="Название (необязательно)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={addingSource}
                className="w-full h-full py-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>{addingSource ? '...' : 'Добавить'}</span>
              </button>
            </div>
          </form>

          {/* 1-Click Presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="text-slate-400 mr-1">Быстрое подключение:</span>
            {[
              { handle: '@unfolded', title: 'Unfolded News', type: 'TELEGRAM' as NewsSourceType },
              { handle: '@whale_alert_io', title: 'Whale Alert', type: 'TELEGRAM' as NewsSourceType },
              { handle: '@Bybit_Announcements', title: 'Bybit Ann', type: 'EXCHANGE_ANN' as NewsSourceType },
              { handle: 'coindesk.com/rss', title: 'CoinDesk RSS', type: 'RSS' as NewsSourceType },
            ].map((p) => {
              const exists = newsChannels.some((c) => c.username.toLowerCase() === p.handle.toLowerCase());
              return (
                <button
                  key={p.handle}
                  type="button"
                  disabled={exists || addingSource}
                  onClick={() => handleQuickAddNewsSource(undefined, p.handle, p.title, p.type)}
                  className={`px-2 py-1 rounded-lg border transition ${
                    exists
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-cyan-500/50 hover:text-white'
                  }`}
                >
                  {exists ? '✓ ' : '+ '}
                  {p.title} ({p.handle})
                </button>
              );
            })}
          </div>

          {/* Connected Channels Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {newsChannels.map((ch) => {
              const isEnabled = ch.isEnabled !== false;
              return (
                <div
                  key={ch.channelId}
                  className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between gap-2 ${
                    !isEnabled
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-65'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className="font-bold text-white truncate">{ch.title}</span>
                    </div>
                    <div className="text-[11px] text-cyan-300 truncate">
                      {ch.username} · Доверие {ch.trustScore.toFixed(0)}% · Сигналов: {ch.totalSignals || 1}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleNewsChannel(ch)}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        isEnabled
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {isEnabled ? 'Вкл' : 'Выкл'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNewsChannel(ch)}
                      className="p-1 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800"
                      title="Удалить источник"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* LIVE PROCESSED NEWS & SIGNALS MONITOR */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Последние обработанные новости и сигналы ({parsedNewsFeed.length})
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold whitespace-nowrap">
                  ПАРСЕР РАБОТАЕТ (LIVE)
                </span>
              </div>
              <button
                type="button"
                onClick={handleScanNewsNow}
                disabled={scanningSources}
                className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-[11px] font-mono font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3 h-3 ${scanningSources ? 'animate-spin' : ''}`} />
                <span>{scanningSources ? 'Чтение...' : '+ Считать свежую новость'}</span>
              </button>
            </div>

            {parsedNewsFeed.length === 0 ? (
              <div className="text-center py-4 text-xs font-mono text-slate-400">
                Нажмите «+ Считать свежую новость», чтобы мгновенно протестировать парсер каналов.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                {parsedNewsFeed.slice(0, 6).map((item, idx) => {
                  const isBull = item.sentiment === 'BULLISH' || item.sentimentScore > 0;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 transition ${
                        idx === 0
                          ? 'bg-slate-900/95 border-cyan-500/40 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800/80'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {idx === 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[9px] font-bold shrink-0">
                              НОВОЕ
                            </span>
                          )}
                          <span className="font-bold text-white truncate">{item.sourceTitle}</span>
                          <span className="text-[10px] text-cyan-400 truncate">({item.sourceHandle})</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300 text-[10px] font-bold">
                            #{item.symbol}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isBull
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {isBull ? 'БЫЧИЙ' : 'МЕДВЕЖИЙ'} {item.sentimentScore >= 0 ? '+' : ''}
                            {(item.sentimentScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed break-words line-clamp-2">
                        {item.rawText}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-[10px] text-slate-400">
                        <span>
                          {item.extractedSetup
                            ? `Распознан сетап: ${item.extractedSetup.side} @ $${item.extractedSetup.entryPrice} · SL $${item.extractedSetup.stopLoss} · TP1 $${item.extractedSetup.tp1}`
                            : `Вес сигнала: ${Math.round((item.impactWeight || 0.8) * 100)}%`}
                        </span>
                        <span className="text-slate-500 shrink-0">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Telegram Bot (@zimatradeai_bot) Notification Bar */}
          <div className="bg-gradient-to-r from-slate-950 via-cyan-950/30 to-slate-950 border border-cyan-500/30 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 font-mono text-xs">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shrink-0">
                <Send className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white">
                    Уведомления в Telegram: {tgStatus?.botUsername || '@zimatradeai_bot'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                    ТОКЕН АКТИВЕН ({tgStatus?.maskedToken || '9239315632...JY5II'})
                  </span>
                  <span className="text-[11px] text-slate-300">
                    Получателей: <strong className="text-cyan-300">{tgStatus?.subscribers?.length || 0}</strong>
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Нажмите{' '}
                  <a
                    href={`https://t.me/${(tgStatus?.botUsername || '@zimatradeai_bot').replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 underline font-semibold hover:text-cyan-200"
                  >
                    открыть {tgStatus?.botUsername || '@zimatradeai_bot'}
                  </a>{' '}
                  и отправьте <code className="text-white">/start</code>, либо укажите ваш Chat ID:
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                type="text"
                value={tgChatIdInput}
                onChange={(e) => setTgChatIdInput(e.target.value)}
                placeholder="Chat ID (авто или вручную)"
                className="w-44 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleSyncTelegramUpdates}
                disabled={syncingTg}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold transition flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${syncingTg ? 'animate-spin' : ''}`} />
                <span>{syncingTg ? 'Поиск...' : 'Найти /start'}</span>
              </button>
              <button
                type="button"
                onClick={handleTestTelegramPush}
                disabled={testingTg}
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" />
                <span>{testingTg ? 'Отправка...' : 'Тест в ТГ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {promotionStatus && (
        <div
          className={`p-3 rounded-xl text-xs font-mono flex items-center justify-between gap-2 border ${
            promotionStatus.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
              : promotionStatus.type === 'error'
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              : 'bg-slate-900 border-cyan-500/40 text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="break-words">{promotionStatus.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setPromotionStatus(null)}
            className="text-slate-400 hover:text-white text-xs shrink-0"
          >
            Закрыть
          </button>
        </div>
      )}

      {/* Institutional Pro-Trader Execution & Risk Audit Telemetry Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Институциональный контур защиты и Pro-исполнения
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold whitespace-nowrap">
                  AUDIT PASSED · L2 VWAP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Авто-перевод в Безубыток (Break-Even) после TP1 (60%) · Динамический ATR Trailing-Stop · Фильтр ловушек L2≠Momentum · Учет комиссий Taker 0.11% в 1.5% лимите риска
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
              <span className="text-slate-400">Scale-Out TP1:</span>
              <span className="text-emerald-400 font-bold">60% + Авто-БУ</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
              <span className="text-slate-400">В Безубытке / Трейлинге:</span>
              <span className="text-cyan-300 font-bold">
                {activePositions.filter((p) => p.isBreakEven || p.isTrailing).length} поз.
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
              <span className="text-slate-400">Confluence / Anti-Trap:</span>
              <span className="text-amber-300 font-bold">АКТИВЕН</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Recharts Reward Curve Section */}
      <RewardCurveChart
        agents={agents}
        trainingBotId={trainingBotId}
        onTrainEpoch={handleTrainEpoch}
        onResetBrain={handleResetBrain}
        onSelectAgentForConfig={(agentId) => setEditingBotId(agentId)}
        externalComparePair={comparePair}
      />

      {/* Agents Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {agents.map((agent) => {
          const isLive = agent.mode === 'LIVE';
          const isQuarantined = agent.mode === 'QUARANTINE';
          const isBotEnabled = agent.isEnabled !== false;
          const isEditing = editingBotId === agent.agentId;
          const isTrainingThis = trainingBotId === agent.agentId || trainingBotId === 'ALL';
          const botOpenPositions = activePositions.filter((p) => p.botId === agent.agentId);

          const brain = agent.brain || {
            weights: { obiWeight: 0.35, momentumWeight: 0.25, vwapWeight: 0.2, sentimentWeight: 0.2 },
            lastWeightDelta: { obiWeight: 0, momentumWeight: 0, vwapWeight: 0, sentimentWeight: 0 },
            confidenceThreshold: 0.21,
            learningRate: 0.06,
            atrMultiplier: 1.45,
            maxSpreadBps: 18.0,
            epochsTrained: 3,
            onlineUpdatesCount: 5,
            cumulativeReward: 2.45,
            lastTrainedAt: Date.now(),
            rewardHistory: [],
          };

          const draft = draftConfigs[agent.agentId] || {
            riskPerTradePct: agent.riskPerTradePct ?? 1.5,
            leverage: agent.leverage ?? 10,
            tpSlRatio: agent.tpSlRatio ?? 1.8,
            maxConcurrentPositions: agent.maxConcurrentPositions ?? 2,
            allowedSymbols: agent.allowedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'HYPEUSDT', 'NEARUSDT'],
            dynamicScreenerScan: agent.dynamicScreenerScan ?? true,
            confidenceThreshold: brain.confidenceThreshold ?? 0.21,
            atrMultiplier: brain.atrMultiplier ?? 1.45,
            learningRate: brain.learningRate ?? 0.06,
          };

          const weightRows: Array<{
            key: string;
            metric: MetricId;
            label: string;
            val: number;
            delta: number;
            barColor: string;
          }> = [
            {
              key: 'obi',
              metric: 'OBI',
              label: 'Крупные заявки в стакане (OBI)',
              val: brain.weights.obiWeight,
              delta: brain.lastWeightDelta?.obiWeight || 0,
              barColor: 'bg-cyan-400',
            },
            {
              key: 'mom',
              metric: 'RSI_EMA',
              label: 'Сила и скорость тренда (RSI + EMA)',
              val: brain.weights.momentumWeight,
              delta: brain.lastWeightDelta?.momentumWeight || 0,
              barColor: 'bg-emerald-400',
            },
            {
              key: 'vwap',
              metric: 'VWAP',
              label: 'Выгодность цены от средней (VWAP)',
              val: brain.weights.vwapWeight,
              delta: brain.lastWeightDelta?.vwapWeight || 0,
              barColor: 'bg-indigo-400',
            },
            {
              key: 'sent',
              metric: 'SENTIMENT_LLM',
              label: 'Новости и сигналы Telegram',
              val: brain.weights.sentimentWeight,
              delta: brain.lastWeightDelta?.sentimentWeight || 0,
              barColor: 'bg-amber-400',
            },
          ];

          return (
            <div
              key={agent.agentId}
              className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
                !isBotEnabled
                  ? 'bg-slate-900/50 border-slate-800/80 opacity-85'
                  : isLive
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        !isBotEnabled
                          ? 'bg-slate-800 text-slate-400'
                          : isLive
                          ? 'bg-emerald-950 text-emerald-400'
                          : 'bg-amber-950 text-amber-400'
                      }`}
                    >
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{agent.name}</h3>
                      <div className="text-[11px] font-mono text-slate-400">
                        {agent.engineType} · {isLive ? 'Допущен к реальным сделкам' : isQuarantined ? 'На обучении (Карантин)' : agent.mode}
                      </div>
                    </div>
                  </div>

                  {/* Individual Pause / Active Toggle Button */}
                  <button
                    type="button"
                    disabled={savingBotId === agent.agentId}
                    onClick={() => handleToggleSingleBot(agent)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1 whitespace-nowrap shrink-0 border ${
                      isBotEnabled
                        ? 'bg-emerald-950/80 hover:bg-amber-950/80 text-emerald-300 hover:text-amber-300 border-emerald-500/30'
                        : 'bg-amber-950/80 hover:bg-emerald-950/80 text-amber-300 hover:text-emerald-300 border-amber-500/30'
                    }`}
                    title={isBotEnabled ? 'Поставить этого бота на паузу' : 'Включить этого бота'}
                  >
                    {isBotEnabled ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Работает</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        <span>На паузе</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Performance Metrics Grid with Context-Aware Tooltips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs font-mono bg-slate-950 p-3 rounded-lg border border-slate-800/80 tabular-nums">
                  <div>
                    <MetricTooltip metric="SHARPE" value={agent.sharpeRatio} showIcon={false}>
                      <span className="text-[10px] text-slate-400 block">Стабильность</span>
                    </MetricTooltip>
                    <span className="font-bold text-cyan-400 text-xs block mt-0.5">{agent.sharpeRatio.toFixed(2)}</span>
                    <span className="text-[9px] text-slate-500 block">Sharpe</span>
                  </div>
                  <div>
                    <MetricTooltip metric="PROFIT_FACTOR" value={agent.profitFactor} showIcon={false}>
                      <span className="text-[10px] text-slate-400 block">Окупаемость</span>
                    </MetricTooltip>
                    <span className="font-bold text-emerald-400 text-xs block mt-0.5">x{agent.profitFactor.toFixed(2)}</span>
                    <span className="text-[9px] text-slate-500 block">Прибыль/Убыток</span>
                  </div>
                  <div>
                    <MetricTooltip metric="QUARANTINE_TRADES" value={agent.tradesCount} showIcon={false}>
                      <span className="text-[10px] text-slate-400 block">Опыт (Сделки)</span>
                    </MetricTooltip>
                    <span className="font-bold text-white text-xs block mt-0.5">{agent.tradesCount}/30</span>
                    <span className="text-[9px] text-slate-500 block">Проверка</span>
                  </div>
                  <div>
                    <MetricTooltip metric="MAX_DRAWDOWN" value={agent.maxDrawdownPct} showIcon={false}>
                      <span className="text-[10px] text-slate-400 block">Макс. спад</span>
                    </MetricTooltip>
                    <span className={`font-bold text-xs block mt-0.5 ${agent.maxDrawdownPct >= 5.0 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {agent.maxDrawdownPct.toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-slate-500 block">Лимит 5%</span>
                  </div>
                </div>

                {/* Feature Weights Studio */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3 mb-3 space-y-2.5 font-mono text-xs tabular-nums">
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-800/80 pb-1.5">
                    <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Веса факторов перед сделкой</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Циклов: {brain.epochsTrained} · Обновлений: {brain.onlineUpdatesCount}
                    </span>
                  </div>

                  {/* 4 Feature Weight Bars */}
                  <div className="space-y-1.5">
                    {weightRows.map((row) => {
                      const pct = Math.round(row.val * 100);
                      const deltaPct = row.delta * 100;
                      return (
                        <div key={row.key} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <MetricTooltip metric={row.metric} value={row.val}>
                              <span className="text-slate-300">{row.label}</span>
                            </MetricTooltip>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {Math.abs(deltaPct) >= 0.05 && (
                                <span
                                  className={`text-[10px] ${
                                    deltaPct > 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {deltaPct > 0 ? '+' : ''}
                                  {deltaPct.toFixed(1)}%
                                </span>
                              )}
                              <span className="text-white font-bold">{pct}%</span>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${row.barColor} transition-all duration-200`}
                              style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cumulative Reward Sparkline */}
                  <div className="pt-1.5 border-t border-slate-800/70 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                      <MetricTooltip metric="REWARD_CURVE" value={brain.cumulativeReward}>
                        <span className="text-slate-400">Кривая накопленной результативности (R):</span>
                      </MetricTooltip>
                      <span
                        className={`font-bold ${
                          brain.cumulativeReward >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {brain.cumulativeReward >= 0 ? '+' : ''}
                        {brain.cumulativeReward.toFixed(2)}R
                      </span>
                    </div>
                    <RewardSparklineSvg history={brain.rewardHistory || []} />
                  </div>

                  {/* Adaptive Hyperparameters Summary */}
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/70">
                    <MetricTooltip metric="CONFIDENCE_THRESHOLD" value={brain.confidenceThreshold} showIcon={false}>
                      <span>Порог: &ge;{brain.confidenceThreshold.toFixed(2)}</span>
                    </MetricTooltip>
                    <span>·</span>
                    <MetricTooltip metric="ATR" value={brain.atrMultiplier} showIcon={false}>
                      <span>ATR Стоп: {brain.atrMultiplier.toFixed(2)}x</span>
                    </MetricTooltip>
                    <span>·</span>
                    <MetricTooltip metric="LEARNING_RATE" value={brain.learningRate} showIcon={false}>
                      <span>Шаг &eta;={brain.learningRate.toFixed(3)}</span>
                    </MetricTooltip>
                  </div>
                </div>

                {/* Current Active Risk & Symbols Summary */}
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs font-mono space-y-1 tabular-nums mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1">
                      <span>Риск /</span>
                      <MetricTooltip metric="LEVERAGE" value={agent.leverage ?? 10} showIcon={false}>
                        <span>Плечо</span>
                      </MetricTooltip>
                      <span>/</span>
                      <MetricTooltip metric="TP_SL_RATIO" value={agent.tpSlRatio ?? 1.8} showIcon={false}>
                        <span>RR:</span>
                      </MetricTooltip>
                    </span>
                    <span className="text-cyan-300 font-bold">
                      {agent.riskPerTradePct ?? 1.5}% · {agent.leverage ?? 10}x · 1:{agent.tpSlRatio ?? 1.8}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Виртуальный субсчет:</span>
                    <span className="text-white font-bold">${agent.virtualBalance.toFixed(2)} USDT</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Пары: {(agent.allowedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']).join(' · ')}
                  </div>
                </div>

                {/* Expandable Fine-Tuning Panel */}
                {isEditing && (
                  <div className="bg-slate-950 border border-cyan-500/40 rounded-lg p-3.5 mb-3 space-y-3 text-xs font-mono">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-cyan-300">Настройка риска и параметров стратегии</span>
                      <button
                        type="button"
                        onClick={() => setEditingBotId(null)}
                        className="text-slate-400 hover:text-white text-[11px]"
                      >
                        Свернуть
                      </button>
                    </div>

                    {/* Risk Per Trade Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor={`risk-${agent.agentId}`} className="text-slate-300">
                          Риск на сделку (% от депозита):
                        </label>
                        <span className="text-cyan-300 font-bold tabular-nums">{draft.riskPerTradePct.toFixed(1)}%</span>
                      </div>
                      <input
                        id={`risk-${agent.agentId}`}
                        type="range"
                        min="0.5"
                        max="5.0"
                        step="0.1"
                        value={draft.riskPerTradePct}
                        onChange={(e) => updateDraftField(agent.agentId, 'riskPerTradePct', parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>

                    {/* Confidence Threshold & ATR Multiplier Row */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <MetricTooltip metric="CONFIDENCE_THRESHOLD" value={draft.confidenceThreshold} className="mb-1">
                          <label htmlFor={`thresh-${agent.agentId}`} className="text-slate-400 text-[11px] cursor-help">
                            Порог входа (0.12–0.50)
                          </label>
                        </MetricTooltip>
                        <input
                          id={`thresh-${agent.agentId}`}
                          type="number"
                          min="0.12"
                          max="0.50"
                          step="0.01"
                          value={draft.confidenceThreshold}
                          onChange={(e) =>
                            updateDraftField(
                              agent.agentId,
                              'confidenceThreshold',
                              Math.max(0.12, Math.min(0.5, parseFloat(e.target.value) || 0.21))
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-white tabular-nums"
                        />
                      </div>

                      <div>
                        <MetricTooltip metric="ATR" value={draft.atrMultiplier} className="mb-1">
                          <label htmlFor={`atr-${agent.agentId}`} className="text-slate-400 text-[11px] cursor-help">
                            Множитель ATR стопа (x)
                          </label>
                        </MetricTooltip>
                        <input
                          id={`atr-${agent.agentId}`}
                          type="number"
                          min="0.8"
                          max="2.8"
                          step="0.05"
                          value={draft.atrMultiplier}
                          onChange={(e) =>
                            updateDraftField(
                              agent.agentId,
                              'atrMultiplier',
                              Math.max(0.8, Math.min(2.8, parseFloat(e.target.value) || 1.45))
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-white tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Leverage & RR Row */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <MetricTooltip metric="LEVERAGE" value={draft.leverage} className="mb-1">
                          <label htmlFor={`lev-${agent.agentId}`} className="text-slate-400 text-[11px] cursor-help">
                            Плечо (1x – 20x)
                          </label>
                        </MetricTooltip>
                        <input
                          id={`lev-${agent.agentId}`}
                          type="number"
                          min="1"
                          max="20"
                          value={draft.leverage}
                          onChange={(e) =>
                            updateDraftField(
                              agent.agentId,
                              'leverage',
                              Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 10))
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-white tabular-nums"
                        />
                      </div>

                      <div>
                        <MetricTooltip metric="TP_SL_RATIO" value={draft.tpSlRatio} className="mb-1">
                          <label htmlFor={`rr-${agent.agentId}`} className="text-slate-400 text-[11px] cursor-help">
                            Множитель TP/SL (RR)
                          </label>
                        </MetricTooltip>
                        <input
                          id={`rr-${agent.agentId}`}
                          type="number"
                          min="1.2"
                          max="4.0"
                          step="0.1"
                          value={draft.tpSlRatio}
                          onChange={(e) =>
                            updateDraftField(
                              agent.agentId,
                              'tpSlRatio',
                              Math.max(1.2, Math.min(4.0, parseFloat(e.target.value) || 1.8))
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-white tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Allowed Symbols & Dynamic Screener Selector */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] font-mono">
                        <div className="flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="text-slate-300">Авто-ротация рыночных трендов L2:</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateDraftField(agent.agentId, 'dynamicScreenerScan', !draft.dynamicScreenerScan)}
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition border ${
                            draft.dynamicScreenerScan
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                              : 'bg-slate-900 text-slate-500 border-slate-800'
                          }`}
                        >
                          {draft.dynamicScreenerScan ? 'ВКЛ (Все горячие монеты)' : 'ТОЛЬКО РУЧНОЙ СПИСОК'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 block text-[11px]">
                          Базовые пары ({draft.allowedSymbols.length}):
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSymbolPreset(agent.agentId, 'ALL_TRENDS')}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40 transition"
                          >
                            Все тренды
                          </button>
                          <button
                            type="button"
                            onClick={() => setSymbolPreset(agent.agentId, 'MAJORS')}
                            className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 transition"
                          >
                            Мажоры
                          </button>
                          <button
                            type="button"
                            onClick={() => setSymbolPreset(agent.agentId, 'ALTS')}
                            className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 transition"
                          >
                            Альты
                          </button>
                          <button
                            type="button"
                            onClick={() => setSymbolPreset(agent.agentId, 'MEMES')}
                            className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 transition"
                          >
                            Мемы
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {AVAILABLE_SYMBOLS.map((sym) => {
                          const active = draft.allowedSymbols.includes(sym);
                          return (
                            <button
                              key={sym}
                              type="button"
                              onClick={() => toggleDraftSymbol(agent.agentId, sym)}
                              className={`px-2 py-1 rounded text-[11px] font-mono transition border ${
                                active
                                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50 font-semibold'
                                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                              }`}
                            >
                              {sym.replace('USDT', '')}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingBotId === agent.agentId}
                        onClick={() => handleSaveBotConfig(agent.agentId, agent.name)}
                        className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg transition flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingBotId === agent.agentId ? 'Сохранение...' : 'Сохранить'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={savingBotId === agent.agentId}
                        onClick={() => handleResetBrain(agent.agentId, agent.name)}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition flex items-center gap-1 border border-slate-700"
                        title="Сбросить веса факторов к заводским значениям"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Сброс весов</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* SHA256 Hash check */}
                <div className="text-[10px] font-mono text-slate-500 bg-slate-950/60 p-2 rounded border border-slate-800/60 flex items-center gap-1.5 overflow-hidden">
                  <FileCheck className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">SHA: {agent.sha256}</span>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                {/* Quick News Source Button specifically highlighted on TG Alpha Parser Agent */}
                {agent.agentId === 'agent-tg-alpha' && (
                  <button
                    type="button"
                    onClick={() => setShowNewsManager((prev) => !prev)}
                    className="w-full py-2 px-3 bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-mono font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Добавить ТГ-каналы / Источники ({newsChannels.filter((c) => c.isEnabled !== false && c.status !== 'BANNED').length} акт.)</span>
                  </button>
                )}

                {/* Quick Dual-Compare Slot Assignment Bar */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 bg-slate-950/80 border border-slate-800/80 rounded-lg p-1.5 text-[11px] font-mono">
                  <span className="text-slate-400 flex items-center gap-1 pl-1">
                    <GitCompare className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>График A vs B:</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAssignToCompareSlot(0, agent.agentId)}
                      className={`px-2 py-0.5 rounded border transition whitespace-nowrap ${
                        comparePair[0] === agent.agentId
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-500/60 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {comparePair[0] === agent.agentId ? 'Слот A ✓' : 'В слот A'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssignToCompareSlot(1, agent.agentId)}
                      className={`px-2 py-0.5 rounded border transition whitespace-nowrap ${
                        comparePair[1] === agent.agentId
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {comparePair[1] === agent.agentId ? 'Слот B ✓' : 'В слот B'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isTrainingThis}
                    onClick={() => handleTrainEpoch(agent.agentId, agent.name)}
                    className="flex-1 min-w-[140px] py-2 px-2.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 text-xs font-mono font-semibold rounded-lg transition flex items-center justify-center gap-1.5 border border-cyan-500/40"
                    title="Запустить калибровку на исторических свечах (5m)"
                  >
                    <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isTrainingThis ? 'animate-spin' : 'text-cyan-400'}`} />
                    <span>{isTrainingThis ? 'Калибровка...' : 'Калибровать'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingBotId(isEditing ? null : agent.agentId)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold rounded-lg transition flex items-center justify-center gap-1 border border-slate-700"
                    title="Настроить риск, порог входа, ATR стоп и торговые пары"
                  >
                    <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{isEditing ? 'Скрыть' : 'Параметры'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={botOpenPositions.length === 0 || closingBotId === agent.agentId}
                    onClick={() => handleCloseBotPositions(agent.agentId, agent.name)}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 text-xs font-mono font-semibold rounded-lg transition flex items-center justify-center gap-1 border border-slate-700 disabled:opacity-40"
                    title="Принудительно закрыть все открытые позиции этой стратегии"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>({botOpenPositions.length})</span>
                  </button>
                </div>

                {isQuarantined ? (
                  <button
                    type="button"
                    onClick={() => handlePromote(agent.agentId)}
                    className="w-full py-2 px-3 bg-amber-600/90 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-center"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>В LIVE (&ge;30 сделок, PF &ge;1.5)</span>
                  </button>
                ) : (
                  <div className="text-center text-xs font-mono text-emerald-400 font-semibold flex items-center justify-center gap-1 pt-1">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Допущен к боевой торговле (LIVE)</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Studio: Decision Journal & Raw Bot Logs */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBottomTab('XAI')}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 text-left ${
                bottomTab === 'XAI'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>Журнал решений: Факторы ({xaiDecisions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setBottomTab('LOGS')}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 text-left ${
                bottomTab === 'LOGS'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span>Журнал исполнения ({botsState?.recentLogs?.length || 0})</span>
            </button>
          </div>

          {bottomTab === 'XAI' && (
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-400">Фильтр:</span>
              <button
                type="button"
                onClick={() => setSelectedXaiBot('ALL')}
                className={`px-2.5 py-1 rounded transition ${
                  selectedXaiBot === 'ALL'
                    ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Все боты
              </button>
              {agents.map((a) => (
                <button
                  key={a.agentId}
                  type="button"
                  onClick={() => setSelectedXaiBot(a.agentId)}
                  className={`px-2.5 py-1 rounded transition whitespace-nowrap shrink-0 ${
                    selectedXaiBot === a.agentId
                      ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {a.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        {bottomTab === 'XAI' ? (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1 scrollbar-thin font-mono text-xs tabular-nums">
            {filteredXai.length > 0 ? (
              filteredXai.map((item) => {
                const timeStr = new Date(item.timestamp).toLocaleTimeString();
                const isLong = item.action === 'LONG';
                const isShort = item.action === 'SHORT';

                return (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-slate-800/90 rounded-lg p-3.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-500 text-[11px]">[{timeStr}]</span>
                        <span
                          className={`font-bold ${
                            isLong
                              ? 'text-emerald-400'
                              : isShort
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {item.action === 'SKIP' ? 'ПРОПУСК СИГНАЛА' : `ВХОД ${item.action}`}
                        </span>
                        <span className="text-white font-bold">{item.symbol}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-cyan-300 font-semibold">{item.botName}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300">Цена: ${item.entryPrice.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-400">
                          Итоговый Score:{' '}
                          <strong
                            className={
                              item.compositeScore >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {item.compositeScore >= 0 ? '+' : ''}
                            {item.compositeScore.toFixed(2)}
                          </strong>{' '}
                          (порог &ge;{item.confidenceThreshold.toFixed(2)})
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-amber-300">
                          ATR-14: {item.atrPct.toFixed(2)}% (SL {item.slDistancePct.toFixed(2)}%)
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">Спред: {item.spreadBps.toFixed(1)} bps</span>
                      </div>
                    </div>

                    {/* 4-Factor Breakdown Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] bg-slate-900/70 p-2.5 rounded border border-slate-800/60">
                      <div>
                        <span className="text-slate-400 block text-[10px]">1. Стакан L2 OBI (25 ур.)</span>
                        <span className="text-white font-semibold">
                          OBI: {item.factors.obi >= 0 ? '+' : ''}
                          {item.factors.obi.toFixed(2)}
                        </span>
                        <span className="text-cyan-400 ml-1.5">
                          (вклад {item.contributions.obi >= 0 ? '+' : ''}
                          {item.contributions.obi.toFixed(3)})
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">2. Импульс RSI-14 / EMA</span>
                        <span className="text-white font-semibold">
                          RSI: {item.factors.rsi14.toFixed(1)} · EMA: {item.factors.emaTrendBps >= 0 ? '+' : ''}
                          {item.factors.emaTrendBps.toFixed(1)} bps
                        </span>
                        <span className="text-emerald-400 ml-1.5">
                          ({item.contributions.momentum >= 0 ? '+' : ''}
                          {item.contributions.momentum.toFixed(3)})
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">3. Отклонение от VWAP</span>
                        <span className="text-white font-semibold">
                          VWAP: {item.factors.vwapDevPct >= 0 ? '+' : ''}
                          {item.factors.vwapDevPct.toFixed(2)}%
                        </span>
                        <span className="text-indigo-400 ml-1.5">
                          (вклад {item.contributions.vwap >= 0 ? '+' : ''}
                          {item.contributions.vwap.toFixed(3)})
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">4. Сентимент TG</span>
                        <span className="text-white font-semibold">
                          Sent: {item.factors.sentiment >= 0 ? '+' : ''}
                          {item.factors.sentiment.toFixed(2)}
                        </span>
                        <span className="text-amber-400 ml-1.5">
                          (вклад {item.contributions.sentiment >= 0 ? '+' : ''}
                          {item.contributions.sentiment.toFixed(3)})
                        </span>
                      </div>
                    </div>

                    {/* Post-Trade Outcome Feedback if trade closed */}
                    {item.rlOutcome && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-emerald-300 bg-emerald-950/25 border border-emerald-500/30 rounded px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <Brain className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            Результат после закрытия ({item.rlOutcome.exitReason}): Чистый PnL{' '}
                            <strong>
                              {item.rlOutcome.netPnlUsdt >= 0 ? '+' : ''}${item.rlOutcome.netPnlUsdt.toFixed(2)} USDT
                            </strong>{' '}
                            · Результат{' '}
                            <strong>
                              {item.rlOutcome.reward >= 0 ? '+' : ''}
                              {item.rlOutcome.reward.toFixed(2)}R
                            </strong>
                          </span>
                        </div>
                        <div className="text-slate-300">
                          Сдвиг весов &Delta;w: OBI {item.rlOutcome.weightDelta.obiWeight >= 0 ? '+' : ''}
                          {(item.rlOutcome.weightDelta.obiWeight * 100).toFixed(2)}% · Mom{' '}
                          {item.rlOutcome.weightDelta.momentumWeight >= 0 ? '+' : ''}
                          {(item.rlOutcome.weightDelta.momentumWeight * 100).toFixed(2)}% · VWAP{' '}
                          {item.rlOutcome.weightDelta.vwapWeight >= 0 ? '+' : ''}
                          {(item.rlOutcome.weightDelta.vwapWeight * 100).toFixed(2)}% · Новый порог:{' '}
                          {item.rlOutcome.newThreshold.toFixed(3)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-slate-500 text-center py-6 text-xs font-mono">
                Нажмите «Цикл расчета», чтобы сформировать новую запись в журнале решений...
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 max-h-80 overflow-y-auto space-y-2.5 font-mono text-xs scrollbar-thin tabular-nums">
            {botsState?.recentLogs && botsState.recentLogs.length > 0 ? (
              botsState.recentLogs.map((log) => {
                const dateStr = new Date(log.timestamp).toLocaleTimeString();
                const isEntry = log.action === 'ORDER_OPEN';
                const isTp = log.action === 'TP_HIT';
                const isSl = log.action === 'SL_HIT';
                const isLimit = log.action === 'LIMIT_FILL';

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 text-xs leading-relaxed border-b border-slate-900/80 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-slate-500 flex-shrink-0 text-[11px]">[{dateStr}]</span>

                    <span
                      className={`font-bold flex-shrink-0 ${
                        isEntry
                          ? 'text-cyan-300'
                          : isTp
                          ? 'text-emerald-400'
                          : isSl
                          ? 'text-rose-400'
                          : isLimit
                          ? 'text-purple-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {isEntry ? 'ВХОД' : isTp ? 'ТЕЙК' : isSl ? 'СТОП' : isLimit ? 'ЛИМИТ' : 'СИСТЕМА'}
                    </span>

                    <span className="text-cyan-400 font-bold flex-shrink-0">{log.botName}:</span>

                    <span className="text-slate-200 flex-1">{log.message}</span>

                    <span className="text-slate-500 text-[11px] flex-shrink-0 font-mono">RTT: {log.rttMs}мс</span>
                  </div>
                );
              })
            ) : (
              <div className="text-slate-500 text-center py-4 text-xs font-mono">
                Ожидание тика цикла анализа ботов...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
