export type ExecutionMode = 'SHADOW' | 'LIVE';

export interface SystemHealth {
  status: string;
  mode: ExecutionMode;
  isKillSwitchActive: boolean;
  killSwitchTriggerReason: string | null;
  capitalUsdt: number;
  rolling24hPnlUsdt: number;
  drawdownPct: number;
  totalRealizedPnlUsdt: number;
  pings: { bybit: number; okx: number; mexc: number };
  nodes: {
    nodeA: { name: string; vcpu0_status: string; vcpu1_status: string; ram_mb: number; ram_limit_mb: number; shm_buffer_kb: number };
    nodeB: { name: string; status: string; sync_limit_mbps: number; last_export_sha: string };
    nodeC: { name: string; status: string; models: string[]; active_account_idx: number };
    nodeD: { name: string; status: string; provider: string };
    nodeE: { name: string; status: string; cron_interval: string; dead_man_failures: number };
  };
  activePositionsCount: number;
  activeLimitOrdersCount: number;
  activeBotProfile?: {
    id: 'SAFE' | 'BALANCED' | 'ACTIVE' | 'CUSTOM';
    label: string;
    riskPerTradePct: number;
    leverage: number;
    tpSlRatio: number;
    botTradingEnabled: boolean;
  };
}

export const DEFAULT_SYSTEM_HEALTH: SystemHealth = {
  status: 'ONLINE',
  mode: 'SHADOW',
  isKillSwitchActive: false,
  killSwitchTriggerReason: null,
  capitalUsdt: 10000,
  rolling24hPnlUsdt: 0,
  drawdownPct: 0,
  totalRealizedPnlUsdt: 0,
  pings: { bybit: 140, okx: 210, mexc: 230 },
  nodes: {
    nodeA: {
      name: 'Node A: web-app-prod (Cloud.ru ru.AZ-1)',
      vcpu0_status: 'HEALTHY',
      vcpu1_status: 'HEALTHY',
      ram_mb: 480,
      ram_limit_mb: 4096,
      shm_buffer_kb: 512,
    },
    nodeB: {
      name: 'Node B: GPU Forge (Ryzen 5 5600X, 8GB GPU)',
      status: 'STANDBY',
      sync_limit_mbps: 5.0,
      last_export_sha: '9f7b9a9e49a248fc...',
    },
    nodeC: {
      name: 'Node C: Ollama Pool',
      status: 'NOT_CONFIGURED',
      models: ['gpt-oss:20b', 'gpt-oss:120b'],
      active_account_idx: 0,
    },
    nodeD: {
      name: 'Node D: Semantic Memory & Embeddings',
      status: 'ACTIVE',
      provider: 'Квантовый L2-анализатор (локальный режим)',
    },
    nodeE: {
      name: 'Node E: Cloudflare Shield',
      status: 'WATCHING',
      cron_interval: '60s',
      dead_man_failures: 0,
    },
  },
  activePositionsCount: 0,
  activeLimitOrdersCount: 0,
  activeBotProfile: {
    id: 'BALANCED',
    label: 'Сбалансированный (1.5% · 10x)',
    riskPerTradePct: 1.5,
    leverage: 10,
    tpSlRatio: 1.8,
    botTradingEnabled: true,
  },
};

export interface OrderbookItem {
  price: number;
  qty: number;
  total?: number;
}

export interface OrderbookData {
  timestamp: number;
  seqId: number;
  bids: OrderbookItem[];
  asks: OrderbookItem[];
}

export interface ScreenerPair {
  symbol: string;
  turnover24h: number;
  spreadBps: number;
  atrPct: number;
  status: 'READY' | 'WARMING_UP' | 'TREND';
  price: number;
  priceChangePct?: number;
  trendDirection?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  isTrendHot?: boolean;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryVwap: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
  marginType: string;
  mode: ExecutionMode;
  slPrice: number;
  tpGrid: { price: number; qty: number }[];
  fundingPaid: number;
  openedAt: number;
  botId?: string;
  botName?: string;
  isBreakEven?: boolean;
  isTrailing?: boolean;
}

export interface BotLogEntry {
  id: string;
  timestamp: number;
  botId: string;
  botName: string;
  action: 'ORDER_OPEN' | 'TP_HIT' | 'SL_HIT' | 'SCAN_PASS' | 'RISK_GUARD' | 'MANUAL_CLOSE' | 'LIMIT_FILL';
  symbol: string;
  side?: 'LONG' | 'SHORT';
  price?: number;
  pnl?: number;
  message: string;
  rttMs: number;
}

export interface LimitOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  limitPrice: number;
  qty: number;
  queueAheadQty: number;
  volumeSincePlacement: number;
  status: string;
  createdTs: number;
}

export type NewsSourceType = 'TELEGRAM' | 'RSS' | 'TWITTER' | 'EXCHANGE_ANN';

export interface ChannelItem {
  channelId: number;
  title: string;
  username: string;
  sourceType?: NewsSourceType;
  category?: string;
  influenceWeight?: number;
  isEnabled?: boolean;
  lastSignalText?: string;
  lastParsedAt?: number;
  status: 'QUARANTINE' | 'APPROVED' | 'BANNED';
  trustScore: number;
  scamEditCount: number;
  totalSignals: number;
  winRateShadow: number;
  profitFactor: number;
  maxDrawdownPct: number;
  daysInQuarantine: number;
}

export interface ParsedNewsFeedItem {
  id: string;
  channelId: number;
  sourceTitle: string;
  sourceHandle: string;
  sourceType: NewsSourceType;
  timestamp: number;
  rawText: string;
  symbol: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number;
  impactWeight: number;
  dataSource?: 'LIVE_TELEGRAM_WEB' | 'LIVE_BYBIT_API' | 'LIVE_RSS_FEED' | 'L2_ORDERBOOK_SIGNAL';
  sourceUrl?: string;
  extractedSetup?: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    tp1: number;
  };
}

export interface BotFeatureWeights {
  obiWeight: number;
  momentumWeight: number;
  vwapWeight: number;
  sentimentWeight: number;
}

export interface RewardHistoryPoint {
  timestamp: number;
  label: string;
  reward: number;
  cumulativeReward: number;
  sha256: string;
}

export interface BotBrainState {
  weights: BotFeatureWeights;
  lastWeightDelta: BotFeatureWeights;
  confidenceThreshold: number;
  learningRate: number;
  atrMultiplier: number;
  maxSpreadBps: number;
  epochsTrained: number;
  onlineUpdatesCount: number;
  cumulativeReward: number;
  lastTrainedAt: number;
  rewardHistory: RewardHistoryPoint[];
}

export interface XaiDecisionRecord {
  id: string;
  timestamp: number;
  botId: string;
  botName: string;
  engineType: string;
  symbol: string;
  action: 'LONG' | 'SHORT' | 'SKIP';
  entryPrice: number;
  compositeScore: number;
  confidenceThreshold: number;
  atrPct: number;
  slDistancePct: number;
  spreadBps: number;
  factors: {
    obi: number;
    rsi14: number;
    emaTrendBps: number;
    vwapDevPct: number;
    sentiment: number;
  };
  contributions: {
    obi: number;
    momentum: number;
    vwap: number;
    sentiment: number;
  };
  reasonSummary: string;
  positionId?: string;
  rlOutcome?: {
    closedAt: number;
    exitReason: string;
    netPnlUsdt: number;
    reward: number;
    weightDelta: BotFeatureWeights;
    newThreshold: number;
  };
}

export interface AgentItem {
  agentId: string;
  name: string;
  engineType: string;
  mode: 'SHADOW' | 'QUARANTINE' | 'LIVE' | 'DISABLED';
  sha256: string;
  tradesCount: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  virtualBalance: number;
  liveAllocation: number;
  isEnabled?: boolean;
  riskPerTradePct?: number;
  leverage?: number;
  allowedSymbols?: string[];
  dynamicScreenerScan?: boolean;
  tpSlRatio?: number;
  maxConcurrentPositions?: number;
  brain?: BotBrainState;
}

export interface PersistenceStatus {
  enabled: boolean;
  storageFile: string;
  lastSavedAt: number;
  recordsCount: number;
}

export interface TelegramSubscriber {
  chatId: string;
  username?: string;
  firstName?: string;
  type: 'private' | 'group' | 'supergroup' | 'channel' | 'manual';
  connectedAt: number;
  lastInteractionAt: number;
}

export interface TelegramNotificationToggles {
  notifyOnOpen: boolean;
  notifyOnScaleOut: boolean;
  notifyOnClose: boolean;
  notifyOnKillSwitch: boolean;
  notifyOnAiTrain: boolean;
  notifyOnSignals: boolean;
}

export interface TelegramDispatchedMessage {
  id: string;
  timestamp: number;
  category: 'OPEN' | 'SCALE_OUT' | 'CLOSE' | 'KILL_SWITCH' | 'AI_TRAIN' | 'SIGNAL' | 'TEST' | 'COMMAND_REPLY';
  title: string;
  textPreview: string;
  symbol?: string;
  deliveredCount: number;
  status: 'DELIVERED' | 'QUEUED_NO_CHAT_ID' | 'API_ERROR';
  errorText?: string;
}

export interface TelegramBotStatus {
  enabled: boolean;
  botUsername: string;
  maskedToken: string;
  hasToken: boolean;
  verified: boolean;
  botId?: number;
  botFirstName?: string;
  chatId?: string;
  lastCheckedAt: number;
  lastError?: string | null;
  subscribers: TelegramSubscriber[];
  toggles: TelegramNotificationToggles;
  recentMessages: TelegramDispatchedMessage[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    model?: string;
    tokens?: number;
    latencyMs?: number;
    contextIncluded?: boolean;
    analyticsType?: 'portfolio' | 'trends' | 'bots' | 'risk' | 'system' | 'general';
    suggestedFollowUps?: string[];
  };
}

export interface AiQuickPrompt {
  id: string;
  category: 'Аналитика' | 'Рынок и Тренды' | 'Нейро-Боты' | 'Риск-Контроль' | 'Архитектура';
  icon: string;
  title: string;
  prompt: string;
  description: string;
}

export interface GitCommitItem {
  hash: string;
  author: string;
  relativeTime: string;
  message: string;
  date?: string;
}

export interface GitHubSyncStatus {
  repoUrl: string;
  branch: string;
  currentCommit: GitCommitItem;
  remoteCommit?: GitCommitItem;
  isUpToDate: boolean;
  commitsBehind: number;
  commitsAhead: number;
  isClean: boolean;
  recentCommits: GitCommitItem[];
  incomingCommits: GitCommitItem[];
  lastCheckedAt: number;
  autoSyncEnabled: boolean;
  error?: string | null;
}




