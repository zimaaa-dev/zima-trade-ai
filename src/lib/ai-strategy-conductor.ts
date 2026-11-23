import { normalizeWeights, type BotBrainState, type BotFeatureWeights } from './bot-learning-math.ts';

export type MarketEventKey =
  | 'BTC_BOUNCE_REVERSAL'
  | 'MARKET_FLUSH_SHORT'
  | 'BULL_EXPANSION'
  | 'LOW_VOL_RANGE'
  | 'CROWD_EUPHORIA_COUNTER'
  | 'MACRO_DEFENSE'
  | 'NIGHT_ASIA_SAFE';

export interface StrategySeedSpec {
  agentId: string;
  name: string;
  engineType: string;
  strategyFamily: string;
  preferredEvents: MarketEventKey[];
  directionBias: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
  riskPerTradePct: number;
  leverage: number;
  tpSlRatio: number;
  targetTpPct: number;
  maxConcurrentPositions: number;
  confidenceThreshold: number;
  atrMultiplier: number;
  maxSpreadBps: number;
  weights: BotFeatureWeights;
  allowedSymbols: string[];
  dynamicScreenerScan: boolean;
  defaultEnabled: boolean;
}

export interface StrategyPerformanceInput {
  agentId: string;
  name: string;
  strategyFamily?: string;
  preferredEvents?: MarketEventKey[];
  directionBias?: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
  isEnabled: boolean;
  tradesCount: number;
  winRatePct: number;
  profitFactor: number;
  realizedPnlUsdt: number;
  riskPerTradePct: number;
  targetTpPct: number;
  confidenceThreshold: number;
  atrMultiplier: number;
  weights: BotFeatureWeights;
  mutationCount?: number;
  lastMutatedAt?: number;
  latestTradeClosedAt?: number;
}

export interface MarketSnapshotForAi {
  regimeLabel: string;
  primaryEvent: MarketEventKey;
  secondaryEvents: MarketEventKey[];
  eventLabelRu: string;
  btcPrice: number;
  btcChange24hPct: number;
  btcEmaTrendBps: number;
  btcVwapDevPct: number;
  marketBreadthPct: number;
  avgAtrPct: number;
  maxCrowdSharePct: number;
  crowdedSymbols: string[];
  isMacroBlocked: boolean;
  isNightSession: boolean;
  openPositionsCount: number;
  workingCapitalUsdt: number;
}

export interface StrategyMutationAction {
  agentId: string;
  reason: string;
  confidenceThresholdDelta?: number;
  riskPerTradePct?: number;
  targetTpPct?: number;
  atrMultiplier?: number;
  weightShift?: Partial<BotFeatureWeights>;
}

export type AiDecisionSource =
  | 'OLLAMA_AI'
  | 'GEMINI_AI'
  | 'GIGACHAT_AI'
  | 'ZHIPU_AI'
  | 'GROQ_AI'
  | 'OPENROUTER_AI'
  | 'QUANT_FALLBACK';

export interface AiConductorDecision {
  timestamp: number;
  source: AiDecisionSource;
  modelUsed: string;
  latencyMs: number;
  primaryEvent: MarketEventKey;
  eventLabelRu: string;
  summary: string;
  activeComboIds: string[];
  mutations: StrategyMutationAction[];
}

export const EVENT_LABELS_RU: Record<MarketEventKey, string> = {
  BTC_BOUNCE_REVERSAL: 'Отскок / разворот BTC вверх',
  MARKET_FLUSH_SHORT: 'Общерыночный пролив и давление продаж',
  BULL_EXPANSION: 'Устойчивый бычий тренд / альт-ралли',
  LOW_VOL_RANGE: 'Спокойный боковик / диапазон VWAP',
  CROWD_EUPHORIA_COUNTER: 'Сильный перекос толпы OKX (контр-вход)',
  MACRO_DEFENSE: 'Макро-окно США (ФРС / CPI / NFP)',
  NIGHT_ASIA_SAFE: 'Ночная сессия МСК (низкая ликвидность)',
};

const CORE_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'NEARUSDT', 'SUIUSDT', 'DOGEUSDT'];
const MAJORS_AND_GOLD = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT'];

export const STRATEGY_CATALOG_14: StrategySeedSpec[] = [
  {
    agentId: 'agent-onnx-ppo-v2',
    name: 'Delta-L2 · Стакан и Объемы',
    engineType: 'ONNX_RL',
    strategyFamily: 'L2 Orderflow',
    preferredEvents: ['LOW_VOL_RANGE', 'MARKET_FLUSH_SHORT', 'BULL_EXPANSION'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.4,
    leverage: 4,
    tpSlRatio: 2.3,
    targetTpPct: 2.0,
    maxConcurrentPositions: 2,
    confidenceThreshold: 0.2,
    atrMultiplier: 1.4,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.42, momentumWeight: 0.28, vwapWeight: 0.18, sentimentWeight: 0.12 },
    allowedSymbols: [...CORE_CRYPTO, 'XAUUSDT'],
    dynamicScreenerScan: true,
    defaultEnabled: true,
  },
  {
    agentId: 'agent-lgbm-nightly',
    name: 'Momentum · Импульсный Скальпер',
    engineType: 'LIGHTGBM',
    strategyFamily: 'Momentum Breakout',
    preferredEvents: ['BULL_EXPANSION', 'BTC_BOUNCE_REVERSAL', 'MARKET_FLUSH_SHORT'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.2,
    leverage: 4,
    tpSlRatio: 2.3,
    targetTpPct: 2.1,
    maxConcurrentPositions: 2,
    confidenceThreshold: 0.21,
    atrMultiplier: 1.35,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.24, momentumWeight: 0.38, vwapWeight: 0.28, sentimentWeight: 0.1 },
    allowedSymbols: [...CORE_CRYPTO, 'XAUUSDT'],
    dynamicScreenerScan: true,
    defaultEnabled: true,
  },
  {
    agentId: 'agent-tg-crypto-alpha',
    name: 'Alpha-Signal · Индекс Каналов',
    engineType: 'TG_CHANNEL',
    strategyFamily: 'Channel Confluence',
    preferredEvents: ['MARKET_FLUSH_SHORT', 'BULL_EXPANSION', 'BTC_BOUNCE_REVERSAL'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.4,
    leverage: 4,
    tpSlRatio: 2.4,
    targetTpPct: 2.0,
    maxConcurrentPositions: 2,
    confidenceThreshold: 0.21,
    atrMultiplier: 1.45,
    maxSpreadBps: 12,
    weights: { obiWeight: 0.22, momentumWeight: 0.2, vwapWeight: 0.14, sentimentWeight: 0.44 },
    allowedSymbols: [...CORE_CRYPTO, 'XAUUSDT'],
    dynamicScreenerScan: false,
    defaultEnabled: true,
  },
  {
    agentId: 'strat-btc-bounce-hunter',
    name: 'Bounce-Hunter · Отскок от дна',
    engineType: 'MEAN_REVERSION',
    strategyFamily: 'Bounce Reversal',
    preferredEvents: ['BTC_BOUNCE_REVERSAL', 'LOW_VOL_RANGE'],
    directionBias: 'LONG_ONLY',
    riskPerTradePct: 1.3,
    leverage: 4,
    tpSlRatio: 2.4,
    targetTpPct: 2.2,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.19,
    atrMultiplier: 1.35,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.34, momentumWeight: 0.24, vwapWeight: 0.32, sentimentWeight: 0.1 },
    allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT', 'SUIUSDT'],
    dynamicScreenerScan: true,
    defaultEnabled: true,
  },
  {
    agentId: 'strat-vwap-mean-reverter',
    name: 'VWAP-Magnet · Возврат к среднему',
    engineType: 'VWAP_MR',
    strategyFamily: 'Mean Reversion',
    preferredEvents: ['LOW_VOL_RANGE', 'NIGHT_ASIA_SAFE'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.1,
    leverage: 4,
    tpSlRatio: 2.2,
    targetTpPct: 1.9,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.2,
    atrMultiplier: 1.3,
    maxSpreadBps: 8,
    weights: { obiWeight: 0.26, momentumWeight: 0.18, vwapWeight: 0.44, sentimentWeight: 0.12 },
    allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'XAUUSDT'],
    dynamicScreenerScan: false,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-crowd-contrarian',
    name: 'Anti-FOMO · Контр-Толпа OKX',
    engineType: 'CROWD_COUNTER',
    strategyFamily: 'Crowd Fade',
    preferredEvents: ['CROWD_EUPHORIA_COUNTER', 'BTC_BOUNCE_REVERSAL'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.2,
    leverage: 4,
    tpSlRatio: 2.4,
    targetTpPct: 2.1,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.19,
    atrMultiplier: 1.4,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.36, momentumWeight: 0.22, vwapWeight: 0.24, sentimentWeight: 0.18 },
    allowedSymbols: ['DOGEUSDT', 'SUIUSDT', 'SOLUSDT', 'BTCUSDT', 'XRPUSDT'],
    dynamicScreenerScan: true,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-trend-flush-rider',
    name: 'Flush-Rider · Каскад Сброса',
    engineType: 'TREND_SHORT',
    strategyFamily: 'Dump Trend',
    preferredEvents: ['MARKET_FLUSH_SHORT'],
    directionBias: 'SHORT_ONLY',
    riskPerTradePct: 1.3,
    leverage: 4,
    tpSlRatio: 2.3,
    targetTpPct: 2.0,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.22,
    atrMultiplier: 1.45,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.32, momentumWeight: 0.36, vwapWeight: 0.18, sentimentWeight: 0.14 },
    allowedSymbols: [...CORE_CRYPTO],
    dynamicScreenerScan: true,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-bull-breakout-pro',
    name: 'Breakout-Pro · Пробой Вверх',
    engineType: 'BREAKOUT_LONG',
    strategyFamily: 'Upside Breakout',
    preferredEvents: ['BULL_EXPANSION', 'BTC_BOUNCE_REVERSAL'],
    directionBias: 'LONG_ONLY',
    riskPerTradePct: 1.4,
    leverage: 4,
    tpSlRatio: 2.5,
    targetTpPct: 2.3,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.2,
    atrMultiplier: 1.4,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.3, momentumWeight: 0.4, vwapWeight: 0.2, sentimentWeight: 0.1 },
    allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'AVAXUSDT'],
    dynamicScreenerScan: true,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-gold-safe-haven',
    name: 'Aurum-Shield · Защита Золото XAU',
    engineType: 'MACRO_GOLD',
    strategyFamily: 'Safe-Haven Gold',
    preferredEvents: ['MACRO_DEFENSE', 'NIGHT_ASIA_SAFE', 'MARKET_FLUSH_SHORT'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.2,
    leverage: 4,
    tpSlRatio: 2.2,
    targetTpPct: 1.9,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.18,
    atrMultiplier: 1.35,
    maxSpreadBps: 6,
    weights: { obiWeight: 0.34, momentumWeight: 0.28, vwapWeight: 0.26, sentimentWeight: 0.12 },
    allowedSymbols: ['XAUUSDT', 'BTCUSDT'],
    dynamicScreenerScan: false,
    defaultEnabled: true,
  },
  {
    agentId: 'strat-night-scalper-msk',
    name: 'Night-Owl · Ночной Скальпер МСК',
    engineType: 'NIGHT_SCALP',
    strategyFamily: 'Night Low-Vol',
    preferredEvents: ['NIGHT_ASIA_SAFE', 'LOW_VOL_RANGE'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.0,
    leverage: 3,
    tpSlRatio: 2.1,
    targetTpPct: 1.8,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.21,
    atrMultiplier: 1.3,
    maxSpreadBps: 5,
    weights: { obiWeight: 0.4, momentumWeight: 0.2, vwapWeight: 0.32, sentimentWeight: 0.08 },
    allowedSymbols: MAJORS_AND_GOLD,
    dynamicScreenerScan: false,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-funding-harvester',
    name: 'Funding-Edge · Перекос Фандинга',
    engineType: 'FUNDING_ARB',
    strategyFamily: 'Funding Contrarian',
    preferredEvents: ['CROWD_EUPHORIA_COUNTER', 'LOW_VOL_RANGE'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.1,
    leverage: 4,
    tpSlRatio: 2.2,
    targetTpPct: 1.9,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.2,
    atrMultiplier: 1.35,
    maxSpreadBps: 8,
    weights: { obiWeight: 0.32, momentumWeight: 0.2, vwapWeight: 0.34, sentimentWeight: 0.14 },
    allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT'],
    dynamicScreenerScan: false,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-alt-rotation-alpha',
    name: 'Alt-Rotation · Сила к BTC',
    engineType: 'REL_STRENGTH',
    strategyFamily: 'Altcoin Rotation',
    preferredEvents: ['BULL_EXPANSION', 'BTC_BOUNCE_REVERSAL'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.3,
    leverage: 4,
    tpSlRatio: 2.4,
    targetTpPct: 2.2,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.2,
    atrMultiplier: 1.4,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.26, momentumWeight: 0.34, vwapWeight: 0.22, sentimentWeight: 0.18 },
    allowedSymbols: ['SOLUSDT', 'SUIUSDT', 'NEARUSDT', 'AVAXUSDT', 'LINKUSDT'],
    dynamicScreenerScan: true,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-volatility-squeeze',
    name: 'Squeeze-Hunter · Выход из сжатия',
    engineType: 'VOL_SQUEEZE',
    strategyFamily: 'Volatility Squeeze',
    preferredEvents: ['LOW_VOL_RANGE', 'BULL_EXPANSION', 'MARKET_FLUSH_SHORT'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.3,
    leverage: 4,
    tpSlRatio: 2.5,
    targetTpPct: 2.3,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.21,
    atrMultiplier: 1.4,
    maxSpreadBps: 10,
    weights: { obiWeight: 0.3, momentumWeight: 0.38, vwapWeight: 0.22, sentimentWeight: 0.1 },
    allowedSymbols: [...CORE_CRYPTO],
    dynamicScreenerScan: true,
    defaultEnabled: false,
  },
  {
    agentId: 'strat-macro-hedge-guard',
    name: 'Macro-Hedge · Баланс Риска',
    engineType: 'MACRO_HEDGE',
    strategyFamily: 'Defensive Hedge',
    preferredEvents: ['MACRO_DEFENSE', 'BTC_BOUNCE_REVERSAL', 'MARKET_FLUSH_SHORT'],
    directionBias: 'BOTH',
    riskPerTradePct: 1.0,
    leverage: 3,
    tpSlRatio: 2.2,
    targetTpPct: 1.9,
    maxConcurrentPositions: 1,
    confidenceThreshold: 0.2,
    atrMultiplier: 1.35,
    maxSpreadBps: 6,
    weights: { obiWeight: 0.36, momentumWeight: 0.22, vwapWeight: 0.28, sentimentWeight: 0.14 },
    allowedSymbols: MAJORS_AND_GOLD,
    dynamicScreenerScan: false,
    defaultEnabled: false,
  },
];

/**
 * Classifies live market conditions into structured trading events so the AI Conductor
 * selects event-compatible strategy combinations rather than letting static short grids fight a BTC bounce.
 */
export function detectActiveMarketEvents(input: {
  btcChange24hPct: number;
  btcEmaTrendBps: number;
  btcVwapDevPct: number;
  marketBreadthPct: number;
  avgAtrPct: number;
  maxCrowdSharePct: number;
  isMacroBlocked: boolean;
  isNightSession: boolean;
}): {
  primaryEvent: MarketEventKey;
  secondaryEvents: MarketEventKey[];
  eventLabelRu: string;
} {
  const secondary: MarketEventKey[] = [];
  if (input.isMacroBlocked) secondary.push('MACRO_DEFENSE');
  if (input.isNightSession) secondary.push('NIGHT_ASIA_SAFE');
  if (input.maxCrowdSharePct >= 75) secondary.push('CROWD_EUPHORIA_COUNTER');

  const isBtcBouncingUp = input.btcEmaTrendBps >= 3.5 && input.btcVwapDevPct >= 0.25;

  let primaryEvent: MarketEventKey = 'LOW_VOL_RANGE';
  if (input.isMacroBlocked) {
    primaryEvent = 'MACRO_DEFENSE';
  } else if (isBtcBouncingUp && input.marketBreadthPct <= 60) {
    primaryEvent = 'BTC_BOUNCE_REVERSAL';
  } else if (input.marketBreadthPct >= 62 || input.btcChange24hPct >= 2.5) {
    primaryEvent = 'BULL_EXPANSION';
  } else if (input.marketBreadthPct <= 36 && !isBtcBouncingUp) {
    primaryEvent = 'MARKET_FLUSH_SHORT';
  } else if (input.isNightSession && input.avgAtrPct < 4.5) {
    primaryEvent = 'NIGHT_ASIA_SAFE';
  } else if (input.maxCrowdSharePct >= 77) {
    primaryEvent = 'CROWD_EUPHORIA_COUNTER';
  }

  return {
    primaryEvent,
    secondaryEvents: Array.from(new Set(secondary.filter((e) => e !== primaryEvent))),
    eventLabelRu: EVENT_LABELS_RU[primaryEvent],
  };
}

/**
 * Prevents altcoin SHORT entries when Bitcoin itself is actively bouncing above VWAP & short EMA,
 * eliminating the exact failure mode where static bearish bias shorted NEAR/SUI into a BTC recovery.
 */
export function evaluateBtcBounceShortVeto(params: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  btcEmaTrendBps: number;
  btcVwapDevPct: number;
}): { allowed: boolean; reason?: string } {
  const { symbol, side, btcEmaTrendBps, btcVwapDevPct } = params;
  if (side !== 'SHORT') return { allowed: true };
  if (symbol === 'XAUUSDT') return { allowed: true };
  if (btcEmaTrendBps >= 3.5 && btcVwapDevPct >= 0.28) {
    return {
      allowed: false,
      reason: `BTC Bounce Veto: запрет SHORT ${symbol} при отскоке BTC вверх (EMA +${btcEmaTrendBps.toFixed(1)} bps, VWAP +${btcVwapDevPct.toFixed(2)}%).`,
    };
  }
  return { allowed: true };
}

/**
 * Prevents stacking 3+ correlated crypto positions in the same direction simultaneously.
 */
export function evaluateSameDirectionCorrelationCap(params: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  activePositions: Array<{ symbol: string; side: 'LONG' | 'SHORT' }>;
  maxSameDirectionCrypto?: number;
}): { allowed: boolean; reason?: string } {
  const { symbol, side, activePositions, maxSameDirectionCrypto = 2 } = params;
  if (symbol === 'XAUUSDT') return { allowed: true };
  const sameSideCryptoCount = activePositions.filter(
    (p) => p.symbol !== 'XAUUSDT' && p.side === side
  ).length;
  if (sameSideCryptoCount >= maxSameDirectionCrypto) {
    return {
      allowed: false,
      reason: `Анти-корреляция: уже открыто ${sameSideCryptoCount}/${maxSameDirectionCrypto} крипто-позиций в сторону ${side}.`,
    };
  }
  return { allowed: true };
}

/**
 * Dynamic same-direction crypto correlation cap scaled with total slot budget.
 * When 5 slots are active ($300+ account), allows up to 4 same-direction crypto trades
 * so 2 long-held positions do not freeze the remaining 3 slots during a broad rally.
 */
export function resolveCorrelationCapBySlots(
  maxAllowedOpenPositions: number,
  isNightSession?: boolean
): number {
  if (isNightSession) {
    return maxAllowedOpenPositions >= 4 ? 3 : 2;
  }
  if (maxAllowedOpenPositions >= 5) return 4;
  if (maxAllowedOpenPositions >= 4) return 3;
  return 2;
}

/**
 * Prevents positions from sitting open 14–40h+ in stagnation and locking up trading slots.
 */
export function evaluateStalePositionExit(params: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  openedAt: number;
  nowTs?: number;
  primaryEvent?: MarketEventKey;
}): {
  shouldExit: boolean;
  reason?: string;
  holdHours: number;
  rawProfitPct: number;
} {
  const {
    symbol,
    side,
    entryPrice,
    currentPrice,
    openedAt,
    nowTs = Date.now(),
    primaryEvent,
  } = params;

  const dirSign = side === 'LONG' ? 1 : -1;
  const rawProfitPct =
    entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * dirSign * 100 : 0;
  const holdHours = Math.max(0, (nowTs - (openedAt || nowTs)) / (1000 * 3600));

  // 1. 14h+ flat/near-breakeven stagnation: free slot for active trend strategies
  if (holdHours >= 14 && rawProfitPct >= -0.35 && rawProfitPct <= 0.65) {
    return {
      shouldExit: true,
      reason: `Ротация зависшей позиции ${symbol} (${holdHours.toFixed(1)}ч в зоне ${rawProfitPct >= 0 ? '+' : ''}${rawProfitPct.toFixed(2)}%): освобождение слота.`,
      holdHours,
      rawProfitPct,
    };
  }

  // 2. 20h+ counter-event deadweight (e.g. XAU SHORT during BULL_EXPANSION)
  const isCounterEvent =
    (primaryEvent === 'BULL_EXPANSION' && side === 'SHORT') ||
    (primaryEvent === 'MARKET_FLUSH_SHORT' && side === 'LONG');
  if (holdHours >= 20 && isCounterEvent && rawProfitPct >= -0.75 && rawProfitPct <= 0.4) {
    return {
      shouldExit: true,
      reason: `Ротация контр-трендовой позиции ${symbol} (${holdHours.toFixed(1)}ч против события ${primaryEvent}).`,
      holdHours,
      rawProfitPct,
    };
  }

  // 3. 36h+ hard stagnation cap if not in deep DCA recovery
  if (holdHours >= 36 && rawProfitPct > -1.2) {
    return {
      shouldExit: true,
      reason: `Тайм-стоп застоя ${symbol} (${holdHours.toFixed(1)}ч удержания): возврат капитала в оборот.`,
      holdHours,
      rawProfitPct,
    };
  }

  return {
    shouldExit: false,
    holdHours,
    rawProfitPct,
  };
}

/**
 * Enforces directional constraint on specialized strategies (e.g., Bounce-Hunter LONG_ONLY vs Flush-Rider SHORT_ONLY).
 */
export function evaluateStrategyDirectionBias(
  directionBias: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY' | undefined,
  side: 'LONG' | 'SHORT'
): { allowed: boolean; reason?: string } {
  if (directionBias === 'LONG_ONLY' && side === 'SHORT') {
    return { allowed: false, reason: 'Стратегия настроена только на LONG-отскоки/тренд.' };
  }
  if (directionBias === 'SHORT_ONLY' && side === 'LONG') {
    return { allowed: false, reason: 'Стратегия настроена только на SHORT-импульсы.' };
  }
  return { allowed: true };
}

export function buildAiConductorPrompt(
  snapshot: MarketSnapshotForAi,
  strategies: StrategyPerformanceInput[]
): string {
  const rows = strategies.map((s) => ({
    id: s.agentId,
    name: s.name,
    family: s.strategyFamily || 'General',
    bias: s.directionBias || 'BOTH',
    events: s.preferredEvents || [],
    enabled: s.isEnabled,
    trades: s.tradesCount,
    winRate: Number(s.winRatePct.toFixed(1)),
    pf: Number(s.profitFactor.toFixed(2)),
    pnl: Number(s.realizedPnlUsdt.toFixed(2)),
    riskPct: s.riskPerTradePct,
    tpPct: s.targetTpPct,
    thr: s.confidenceThreshold,
  }));

  return [
    'Ты — ИИ-дирижёр портфеля из 14 алготрейдинговых стратегий OKX Demo.',
    'Твоя задача: проанализировать текущее рыночное событие и статистику стратегий, выбрать комбинацию из 3–5 лучших стратегий под текущее событие и предложить 1–3 аккуратных мутации параметров (чтобы исправлять проигрышные стратегии и усиливать прибыльные).',
    `Текущий рынок: ${JSON.stringify(snapshot)}`,
    `Матрица стратегий: ${JSON.stringify(rows)}`,
    'Правила ответа:',
    '1) Ответь ТОЛЬКО валидным JSON объектом без markdown-обёртки.',
    '2) Формат JSON: {"summary":"краткий вывод на русском (2-3 предложения)","activeComboIds":["id1","id2","id3","id4"],"mutations":[{"agentId":"id","reason":"причина","confidenceThresholdDelta":0.01,"riskPerTradePct":1.2,"targetTpPct":2.1}]}',
    '3) В activeComboIds обязательно включи от 3 до 5 реально существующих agentId из списка выше (минимум 3, никогда не меньше 3!), соответствующих событию primaryEvent.',
  ].join('\n');
}

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function parseAiConductorResponse(
  rawText: string,
  strategies: StrategyPerformanceInput[],
  snapshot: MarketSnapshotForAi,
  meta: {
    modelUsed: string;
    latencyMs: number;
    nowTs?: number;
    source?: AiDecisionSource;
  }
): AiConductorDecision | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    const validIds = new Set(strategies.map((s) => s.agentId));
    const comboIds: string[] = Array.isArray(parsed.activeComboIds)
      ? Array.from(
          new Set(
            parsed.activeComboIds
              .map((x: unknown) => String(x || '').trim())
              .filter((id: string) => validIds.has(id))
          )
        ).slice(0, 5) as string[]
      : [];

    if (comboIds.length < 2) {
      return null;
    }

    const minComboTarget = Math.min(3, strategies.length);
    if (comboIds.length < minComboTarget) {
      const ranked = rankStrategiesForSnapshot(snapshot, strategies);
      for (const candidate of ranked) {
        if (comboIds.length >= minComboTarget) break;
        if (!comboIds.includes(candidate.agentId)) {
          comboIds.push(candidate.agentId);
        }
      }
    }

    const mutations: StrategyMutationAction[] = Array.isArray(parsed.mutations)
      ? parsed.mutations
          .filter((m: any) => m && validIds.has(String(m.agentId || '')))
          .slice(0, 4)
          .map((m: any) => ({
            agentId: String(m.agentId),
            reason: String(m.reason || 'Адаптация по результатам сделок').slice(0, 140),
            confidenceThresholdDelta:
              typeof m.confidenceThresholdDelta === 'number'
                ? clampNum(m.confidenceThresholdDelta, -0.03, 0.03)
                : undefined,
            riskPerTradePct:
              typeof m.riskPerTradePct === 'number'
                ? Number(clampNum(m.riskPerTradePct, 0.8, 1.6).toFixed(2))
                : undefined,
            targetTpPct:
              typeof m.targetTpPct === 'number'
                ? Number(clampNum(m.targetTpPct, 1.7, 2.6).toFixed(2))
                : undefined,
            atrMultiplier:
              typeof m.atrMultiplier === 'number'
                ? Number(clampNum(m.atrMultiplier, 1.2, 1.85).toFixed(2))
                : undefined,
          }))
      : [];

    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim().length > 10
        ? parsed.summary.trim().slice(0, 420)
        : `ИИ активировал связку из ${comboIds.length} стратегий под событие «${snapshot.eventLabelRu}».`;

    return {
      timestamp: meta.nowTs ?? Date.now(),
      source: meta.source || 'OLLAMA_AI',
      modelUsed: meta.modelUsed,
      latencyMs: meta.latencyMs,
      primaryEvent: snapshot.primaryEvent,
      eventLabelRu: snapshot.eventLabelRu,
      summary,
      activeComboIds: comboIds,
      mutations,
    };
  } catch {
    return null;
  }
}

export function rankStrategiesForSnapshot(
  snapshot: MarketSnapshotForAi,
  strategies: StrategyPerformanceInput[]
): StrategyPerformanceInput[] {
  return [...strategies].sort((a, b) => {
    const aEventMatch = (a.preferredEvents || []).includes(snapshot.primaryEvent) ? 2.5 : 0;
    const bEventMatch = (b.preferredEvents || []).includes(snapshot.primaryEvent) ? 2.5 : 0;
    const aSecMatch = (a.preferredEvents || []).some((e) => snapshot.secondaryEvents.includes(e)) ? 0.8 : 0;
    const bSecMatch = (b.preferredEvents || []).some((e) => snapshot.secondaryEvents.includes(e)) ? 0.8 : 0;

    let aBiasScore = 0;
    let bBiasScore = 0;
    if (snapshot.primaryEvent === 'BTC_BOUNCE_REVERSAL' || snapshot.primaryEvent === 'BULL_EXPANSION') {
      if (a.directionBias === 'SHORT_ONLY') aBiasScore -= 2.0;
      if (b.directionBias === 'SHORT_ONLY') bBiasScore -= 2.0;
      if (a.directionBias === 'LONG_ONLY') aBiasScore += 0.8;
      if (b.directionBias === 'LONG_ONLY') bBiasScore += 0.8;
    }

    const aPerf = a.tradesCount > 0 ? a.profitFactor * 0.6 + a.realizedPnlUsdt * 0.3 : 0.7;
    const bPerf = b.tradesCount > 0 ? b.profitFactor * 0.6 + b.realizedPnlUsdt * 0.3 : 0.7;
    return bEventMatch + bSecMatch + bBiasScore + bPerf - (aEventMatch + aSecMatch + aBiasScore + aPerf);
  });
}

export function applyDeterministicEvolutionFallback(
  snapshot: MarketSnapshotForAi,
  strategies: StrategyPerformanceInput[],
  meta?: { modelUsed?: string; latencyMs?: number; nowTs?: number }
): AiConductorDecision {
  const ranked = rankStrategiesForSnapshot(snapshot, strategies);

  const activeComboIds = ranked.slice(0, 4).map((s) => s.agentId);

  const mutations: StrategyMutationAction[] = [];
  for (const s of strategies) {
    // Only mutate when a strategy has new closed trades since its previous mutation (prevents runaway loops on old losses)
    const hasNewTradesSinceMutation =
      !s.lastMutatedAt ||
      (typeof s.latestTradeClosedAt === 'number' && s.latestTradeClosedAt > s.lastMutatedAt);
    if (!hasNewTradesSinceMutation) continue;

    if (s.tradesCount >= 2 && (s.realizedPnlUsdt < -0.8 || s.winRatePct < 45)) {
      mutations.push({
        agentId: s.agentId,
        reason: `Просадка (${s.realizedPnlUsdt.toFixed(2)} USDT, WR ${s.winRatePct.toFixed(0)}%): повышаем порог входа, снижаем риск и поджимаем TP.`,
        confidenceThresholdDelta: 0.02,
        riskPerTradePct: Number(clampNum(s.riskPerTradePct - 0.15, 0.9, 1.5).toFixed(2)),
        targetTpPct: Number(clampNum(s.targetTpPct + 0.1, 1.8, 2.5).toFixed(2)),
      });
    } else if (s.tradesCount >= 2 && s.realizedPnlUsdt > 0.5 && s.winRatePct >= 65) {
      mutations.push({
        agentId: s.agentId,
        reason: `Лидер по результату (+${s.realizedPnlUsdt.toFixed(2)} USDT, WR ${s.winRatePct.toFixed(0)}%): закрепляем оптимальный R:R.`,
        targetTpPct: Number(clampNum(s.targetTpPct + 0.05, 1.8, 2.5).toFixed(2)),
      });
    }
    if (mutations.length >= 3) break;
  }

  const activeNames = ranked
    .slice(0, 4)
    .map((s) => s.name.split('·')[0].trim())
    .join(', ');

  return {
    timestamp: meta?.nowTs ?? Date.now(),
    source: 'QUANT_FALLBACK',
    modelUsed: meta?.modelUsed || 'quant-rule-fallback',
    latencyMs: meta?.latencyMs ?? 0,
    primaryEvent: snapshot.primaryEvent,
    eventLabelRu: snapshot.eventLabelRu,
    summary: `Событие «${snapshot.eventLabelRu}» (BTC ${snapshot.btcChange24hPct >= 0 ? '+' : ''}${snapshot.btcChange24hPct.toFixed(1)}%, широта ${snapshot.marketBreadthPct.toFixed(0)}%). Выбрана связка из 4 стратегий: ${activeNames}.${mutations.length > 0 ? ` Скорректировано стратегий: ${mutations.length}.` : ''}`,
    activeComboIds,
    mutations,
  };
}

export function applyConductorDecisionToAgents<
  T extends {
    agentId: string;
    name: string;
    isEnabled?: boolean;
    riskPerTradePct?: number;
    targetTpPct?: number;
    tpSlRatio?: number;
    mutationCount?: number;
    lastMutatedReason?: string;
    lastMutatedAt?: number;
    brain?: BotBrainState;
  }
>(agents: T[], decision: AiConductorDecision): { updatedCount: number; mutatedIds: string[] } {
  const comboSet = new Set(decision.activeComboIds);
  const mutationMap = new Map(decision.mutations.map((m) => [m.agentId, m]));
  let updatedCount = 0;
  const mutatedIds: string[] = [];

  for (const agent of agents) {
    const shouldEnable = comboSet.has(agent.agentId);
    if (agent.isEnabled !== shouldEnable) {
      agent.isEnabled = shouldEnable;
      updatedCount++;
    }

    const mut = mutationMap.get(agent.agentId);
    if (mut) {
      if (!agent.brain) continue;
      if (typeof mut.confidenceThresholdDelta === 'number') {
        agent.brain.confidenceThreshold = Number(
          clampNum(agent.brain.confidenceThreshold + mut.confidenceThresholdDelta, 0.16, 0.34).toFixed(3)
        );
      }
      if (typeof mut.riskPerTradePct === 'number') {
        agent.riskPerTradePct = Number(clampNum(mut.riskPerTradePct, 0.8, 1.6).toFixed(2));
      }
      if (typeof mut.targetTpPct === 'number') {
        agent.targetTpPct = Number(clampNum(mut.targetTpPct, 1.7, 2.6).toFixed(2));
        agent.tpSlRatio = Number(clampNum((agent.targetTpPct / 0.85), 1.8, 3.0).toFixed(1));
      }
      if (typeof mut.atrMultiplier === 'number') {
        agent.brain.atrMultiplier = Number(clampNum(mut.atrMultiplier, 1.2, 1.85).toFixed(2));
      }
      if (mut.weightShift) {
        agent.brain.weights = normalizeWeights({
          obiWeight: agent.brain.weights.obiWeight + (mut.weightShift.obiWeight || 0),
          momentumWeight: agent.brain.weights.momentumWeight + (mut.weightShift.momentumWeight || 0),
          vwapWeight: agent.brain.weights.vwapWeight + (mut.weightShift.vwapWeight || 0),
          sentimentWeight: agent.brain.weights.sentimentWeight + (mut.weightShift.sentimentWeight || 0),
        });
      }
      agent.mutationCount = (agent.mutationCount || 0) + 1;
      agent.lastMutatedReason = mut.reason;
      agent.lastMutatedAt = decision.timestamp;
      mutatedIds.push(agent.agentId);
      updatedCount++;
    }
  }

  return { updatedCount, mutatedIds };
}
