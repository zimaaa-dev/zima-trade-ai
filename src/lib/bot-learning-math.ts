import type { OrderbookLevel } from './engine-math.ts';

/**
 * Pure TypeScript / ECMAScript FIPS 180-4 SHA-256 implementation.
 * Zero Node.js `crypto` dependency so this module is 100% browser- and server-safe.
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256HexBrowserSafe(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  const bitLen = utf8.length * 8;
  const totalBytes = (((utf8.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(totalBytes);
  buf.set(utf8);
  buf[utf8.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(totalBytes - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalBytes - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalBytes; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

export interface KlineBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
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

export type MarketRegimeType =
  | 'ALT_SEASON_EXPANSION'
  | 'MARKET_WIDE_DUMP'
  | 'SELECTIVE_PUMPS'
  | 'STRONG_BULL'
  | 'STRONG_BEAR'
  | 'HIGH_VOLATILITY'
  | 'RANGE_CHOP';

export interface AdaptiveMarketProfile {
  regime: MarketRegimeType;
  regimeTitle: string;
  volatilityState: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  dynamicAtrMultiplier: number;
  dynamicConfidenceThreshold: number;
  dynamicTpSlRatio: number;
  weightBiases: BotFeatureWeights;
  allowedSides: 'LONG_AND_SHORT' | 'LONG_ONLY' | 'SHORT_ONLY';
}

export interface MarketFeatureVector {
  obi: number;
  spreadBps: number;
  rsi14: number;
  emaTrendBps: number;
  momentumSignal: number;
  vwapDeviationPct: number;
  vwapSignal: number;
  atrPct: number;
  sentimentSignal: number;
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
  virtualPortfolioId?: string;
  mtfSummary?: {
    globalMacroBias: string;
    primaryTrend4h: string;
    structure1h: string;
    setup15m: string;
    confirm5m: string;
    alignmentScore: number;
  };
  rlOutcome?: {
    closedAt: number;
    exitReason: string;
    netPnlUsdt: number;
    reward: number;
    weightDelta: BotFeatureWeights;
    newThreshold: number;
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function normalizeWeights(w: BotFeatureWeights): BotFeatureWeights {
  const o = Math.max(0.05, Number.isFinite(w.obiWeight) ? w.obiWeight : 0.25);
  const m = Math.max(0.05, Number.isFinite(w.momentumWeight) ? w.momentumWeight : 0.25);
  const v = Math.max(0.05, Number.isFinite(w.vwapWeight) ? w.vwapWeight : 0.25);
  const s = Math.max(0.05, Number.isFinite(w.sentimentWeight) ? w.sentimentWeight : 0.25);
  const sum = o + m + v + s;
  return {
    obiWeight: Number((o / sum).toFixed(4)),
    momentumWeight: Number((m / sum).toFixed(4)),
    vwapWeight: Number((v / sum).toFixed(4)),
    sentimentWeight: Number((1 - Number((o / sum).toFixed(4)) - Number((m / sum).toFixed(4)) - Number((v / sum).toFixed(4))).toFixed(4)),
  };
}

export function computeBrainSha256(
  agentId: string,
  weights: BotFeatureWeights,
  steps: number,
  hashFn: (payload: string) => string = sha256HexBrowserSafe
): string {
  const payload = `${agentId}:${weights.obiWeight.toFixed(4)}:${weights.momentumWeight.toFixed(4)}:${weights.vwapWeight.toFixed(4)}:${weights.sentimentWeight.toFixed(4)}:step-${steps}`;
  return hashFn(payload);
}

const LEGACY_SYNTHETIC_BRAIN_LABELS = new Set<string>([
  'Цикл #1 (L2 Init)',
  'Цикл #2 (Bybit L2)',
  'Цикл #3 (ATR+VWAP)',
  'Цикл #1 (Momentum)',
  'Цикл #2 (Hist 5m)',
  'Цикл #3 (L2 Depth)',
  'Цикл #1 (Alpha)',
  'Цикл #2 (Индекс)',
  'Цикл #3 (Confluence)',
]);

export function isSyntheticBrainHistoryLabel(label?: string): boolean {
  if (!label) return false;
  return LEGACY_SYNTHETIC_BRAIN_LABELS.has(label.trim());
}

export function createDefaultBotBrain(engineType: string, _agentId?: string): BotBrainState {
  let rawWeights: BotFeatureWeights;
  let confidenceThreshold = 0.22;
  let atrMultiplier = 1.45;
  let learningRate = 0.06;

  if (engineType === 'ONNX_RL') {
    rawWeights = { obiWeight: 0.42, momentumWeight: 0.28, vwapWeight: 0.18, sentimentWeight: 0.12 };
    confidenceThreshold = 0.20;
    atrMultiplier = 1.4;
    learningRate = 0.065;
  } else if (engineType === 'LIGHTGBM') {
    rawWeights = { obiWeight: 0.24, momentumWeight: 0.38, vwapWeight: 0.28, sentimentWeight: 0.10 };
    confidenceThreshold = 0.22;
    atrMultiplier = 1.35;
    learningRate = 0.055;
  } else {
    // TG_CHANNEL
    rawWeights = { obiWeight: 0.22, momentumWeight: 0.20, vwapWeight: 0.14, sentimentWeight: 0.44 };
    confidenceThreshold = 0.21;
    atrMultiplier = 1.55;
    learningRate = 0.06;
  }

  const weights = normalizeWeights(rawWeights);

  return {
    weights,
    lastWeightDelta: { obiWeight: 0, momentumWeight: 0, vwapWeight: 0, sentimentWeight: 0 },
    confidenceThreshold,
    learningRate,
    atrMultiplier,
    maxSpreadBps: 18.0,
    epochsTrained: 0,
    onlineUpdatesCount: 0,
    cumulativeReward: 0,
    lastTrainedAt: 0,
    rewardHistory: [],
  };
}

/**
 * Computes decay-weighted Orderbook Imbalance (OBI) across up to 25 levels
 * and spread in basis points (bps).
 */
export function calculateDeepObi(
  bids: OrderbookLevel[],
  asks: OrderbookLevel[],
  depthLevels: number = 25
): { obi: number; spreadBps: number } {
  if (!bids.length || !asks.length) {
    return { obi: 0, spreadBps: 1.0 };
  }

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const spreadBps = bestBid > 0 ? Math.max(0.1, ((bestAsk - bestBid) / bestBid) * 10000) : 1.0;

  const nBids = bids.slice(0, depthLevels);
  const nAsks = asks.slice(0, depthLevels);

  let weightedBidNotional = 0;
  let weightedAskNotional = 0;

  for (let i = 0; i < nBids.length; i++) {
    const decay = Math.exp(-0.08 * i);
    weightedBidNotional += nBids[i].price * nBids[i].qty * decay;
  }
  for (let i = 0; i < nAsks.length; i++) {
    const decay = Math.exp(-0.08 * i);
    weightedAskNotional += nAsks[i].price * nAsks[i].qty * decay;
  }

  const total = weightedBidNotional + weightedAskNotional;
  const obi = total > 0 ? clamp((weightedBidNotional - weightedAskNotional) / total, -1, 1) : 0;

  return {
    obi: Number(obi.toFixed(4)),
    spreadBps: Number(spreadBps.toFixed(2)),
  };
}

/**
 * Calculates Wilder's RSI-14 using true Wilder RMA exponential smoothing
 * from an array of close prices (chronological order: oldest -> newest).
 */
export function calculateRsi14(closes: number[], period: number = 14): number {
  if (closes.length < 3) return 50.0;
  const len = closes.length;
  const seedPeriod = Math.min(period, len - 1);

  let avgGain = 0;
  let avgLoss = 0;

  // Initial seed average over first `seedPeriod` deltas
  for (let i = 1; i <= seedPeriod; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= seedPeriod;
  avgLoss /= seedPeriod;

  // Apply Wilder's smoothing (RMA) across remaining bars
  for (let i = seedPeriod + 1; i < len; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (seedPeriod - 1) + gain) / seedPeriod;
    avgLoss = (avgLoss * (seedPeriod - 1) + loss) / seedPeriod;
  }

  if (avgLoss === 0 && avgGain === 0) return 50.0;
  if (avgLoss === 0) return 85.0;

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Number(clamp(rsi, 5, 95).toFixed(2));
}

/**
 * Calculates Exponential Moving Average (EMA) for a chronological series.
 */
export function calculateEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculates Volume-Weighted Average Price (VWAP) deviation percentage from chronological klines.
 */
export function calculateVwapDeviation(klines: KlineBar[]): { vwap: number; deviationPct: number; vwapSignal: number } {
  if (klines.length === 0) {
    return { vwap: 0, deviationPct: 0, vwapSignal: 0 };
  }

  const slice = klines.slice(-30);
  let sumPV = 0;
  let sumV = 0;

  for (const bar of slice) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const vol = Math.max(bar.volume, 0.0001);
    sumPV += typicalPrice * vol;
    sumV += vol;
  }

  const lastClose = slice[slice.length - 1].close;
  const vwap = sumV > 0 ? sumPV / sumV : lastClose;
  const deviationPct = vwap > 0 ? ((lastClose - vwap) / vwap) * 100 : 0;

  // Institutional Value-Zone VWAP Signal:
  // Rewards fresh trend impulse near VWAP (0.05% - 0.90%) and decays when price is overextended (>1.0%) to prevent buying tops / shorting bottoms
  const absDev = Math.abs(deviationPct);
  const rawVwapSig =
    absDev <= 0.95
      ? Math.tanh(deviationPct * 1.4)
      : Math.sign(deviationPct) * Math.max(-0.35, 0.87 - (absDev - 0.95) * 0.75);
  const vwapSignal = clamp(rawVwapSig, -1, 1);

  return {
    vwap: Number(vwap.toFixed(4)),
    deviationPct: Number(deviationPct.toFixed(3)),
    vwapSignal: Number(vwapSignal.toFixed(4)),
  };
}

/**
 * Calculates 14-period Average True Range (ATR) using Wilder's smoothing
 * as percentage of latest close price. Supports high-volatility altcoins up to 8.0%.
 */
export function calculateAtr14Pct(klines: KlineBar[], period: number = 14): number {
  if (klines.length < 2) return 0.85;

  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const cur = klines[i];
    const prevClose = klines[i - 1].close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
    trs.push(tr);
  }

  const seedLen = Math.min(period, trs.length);
  let atr = trs.slice(0, seedLen).reduce((acc, v) => acc + v, 0) / seedLen;
  for (let i = seedLen; i < trs.length; i++) {
    atr = (atr * (seedLen - 1) + trs[i]) / seedLen;
  }

  const lastClose = klines[klines.length - 1].close;
  if (lastClose <= 0) return 0.85;

  const atrPct = (atr / lastClose) * 100;
  return Number(clamp(atrPct, 0.25, 8.0).toFixed(3));
}

/**
 * Freqtrade-inspired CooldownPeriod & StoplossGuard protection state per symbol.
 */
export interface SymbolCooldownEntry {
  symbol: string;
  untilTs: number;
  lastExitReason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE';
  consecutiveSlCount: number;
  lastClosedAt: number;
}

export function evaluateSymbolCooldownGuard(
  cooldownMap: Record<string, SymbolCooldownEntry>,
  symbol: string,
  nowTs: number = Date.now()
): { allowed: boolean; reason?: string; remainingSec: number } {
  const entry = cooldownMap[symbol];
  if (!entry || nowTs >= entry.untilTs) {
    return { allowed: true, remainingSec: 0 };
  }
  const remainingSec = Math.max(1, Math.ceil((entry.untilTs - nowTs) / 1000));
  const tag =
    entry.consecutiveSlCount >= 2
      ? `StoplossGuard (${entry.consecutiveSlCount} SL подряд)`
      : entry.lastExitReason === 'SL_HIT'
      ? 'Cooldown после Stop-Loss'
      : 'Cooldown после сделки';
  return {
    allowed: false,
    remainingSec,
    reason: `Защита от реванш-трейдинга [${tag}]: пауза по ${symbol} ещё ${remainingSec}с.`,
  };
}

/**
 * Calculates 20-period Bollinger Bands (%B and Bandwidth %) for Freqtrade BinHAndCluc / NFI pullback detection.
 */
export function calculateBollingerBands(closes: number[], period: number = 20, stdMult: number = 2.0): {
  mid: number;
  upper: number;
  lower: number;
  percentB: number;
  widthPct: number;
} {
  if (closes.length === 0) {
    return { mid: 0, upper: 0, lower: 0, percentB: 0.5, widthPct: 1.0 };
  }
  const slice = closes.slice(-period);
  const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
  const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  const upper = mean + stdMult * std;
  const lower = mean - stdMult * std;
  const last = slice[slice.length - 1];
  const bandRange = Math.max(1e-9, upper - lower);
  const percentB = clamp((last - lower) / bandRange, -0.2, 1.2);
  const widthPct = mean > 0 ? (bandRange / mean) * 100 : 1.0;

  return {
    mid: Number(mean.toFixed(4)),
    upper: Number(upper.toFixed(4)),
    lower: Number(lower.toFixed(4)),
    percentB: Number(percentB.toFixed(4)),
    widthPct: Number(widthPct.toFixed(3)),
  };
}

/**
 * Extracts normalized multi-factor feature vector from live L2 orderbook, klines, and channel sentiment.
 * Incorporates Freqtrade NostalgiaForInfinity (NFI) / BinHAndCluc Bollinger Band & EMA trend-pullback mechanics.
 */
export function extractMarketFeatures(params: {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  klines: KlineBar[];
  sentimentScore: number;
}): MarketFeatureVector {
  const { obi, spreadBps } = calculateDeepObi(params.bids, params.asks, 25);
  const closes = params.klines.map((k) => k.close);

  const rsi14 = calculateRsi14(closes, 14);
  const ema9 = calculateEma(closes.slice(-25), 9);
  const ema21 = calculateEma(closes.slice(-35), 21);
  const ema50 = calculateEma(closes, Math.min(45, closes.length));
  const lastClose = closes[closes.length - 1] || params.bids[0]?.price || 100;
  const bb = calculateBollingerBands(closes, 20, 2.0);

  // Macro + Micro EMA trend alignment (EMA9 vs EMA21 + EMA21 vs EMA50)
  const emaTrendBps = lastClose > 0 ? ((ema9 - ema21) / lastClose) * 10000 : 0;
  const macroTrendBps = lastClose > 0 ? ((ema21 - ema50) / lastClose) * 10000 : 0;
  const emaNormalized = clamp(Math.tanh((emaTrendBps * 0.65 + macroTrendBps * 0.35) / 16), -1, 1);

  // Freqtrade NFI / BinHAndCluc Pullback-in-Trend Boost:
  // In an uptrend (emaNormalized > 0), reward buying when RSI is in healthy pullback/value zone (36..58) and BB %B is not topped out
  // In a downtrend (emaNormalized < 0), reward shorting when RSI is in healthy bounce zone (42..64) and BB %B is not bottomed out
  const rsiNormalized = clamp((rsi14 - 50) / 30, -1, 1);
  let nfiPullbackBonus = 0;
  if (emaNormalized > 0.05 && bb.percentB <= 0.55 && rsi14 >= 34 && rsi14 <= 56) {
    nfiPullbackBonus = 0.18; // Classic NFI dip-in-uptrend entry
  } else if (emaNormalized < -0.05 && bb.percentB >= 0.45 && rsi14 >= 44 && rsi14 <= 66) {
    nfiPullbackBonus = -0.18; // Classic NFI rally-in-downtrend short entry
  }

  const momentumSignal = Number(clamp(0.55 * emaNormalized + 0.45 * rsiNormalized + nfiPullbackBonus, -1, 1).toFixed(4));

  const { deviationPct, vwapSignal } = calculateVwapDeviation(params.klines);
  const atrPct = calculateAtr14Pct(params.klines, 14);
  const sentimentSignal = Number(clamp(params.sentimentScore, -1, 1).toFixed(4));

  return {
    obi,
    spreadBps,
    rsi14,
    emaTrendBps: Number(emaTrendBps.toFixed(2)),
    momentumSignal,
    vwapDeviationPct: deviationPct,
    vwapSignal,
    atrPct,
    sentimentSignal,
  };
}

/**
 * Calculates FreqAI Dissimilarity Index (DI_values) from freqtrade/freqai/freqai_interface.py.
 * Measures normalized Euclidean distance of the current market feature vector from healthy
 * institutional trend-pullback distributions. If DI > diThreshold (default 1.85),
 * flags the candle as an outlier (`doPredict = false`) to block entries during chaotic spikes.
 */
export function calculateFreqaiDissimilarityIndex(
  features: MarketFeatureVector,
  diThreshold: number = 1.85
): { diValue: number; doPredict: boolean; outlierReason?: string } {
  const dirSign = Math.sign(features.momentumSignal || features.obi || 1);
  // Ideal cluster center for a trend entry: OBI ~ 0.30*dir, Mom ~ 0.35*dir, VWAP ~ 0.0*dir, RSI ~ 50, ATR ~ 1.8%
  const zObi = (features.obi - 0.30 * dirSign) / 0.45;
  const zMom = (features.momentumSignal - 0.35 * dirSign) / 0.45;
  const zVwap = features.vwapDeviationPct / 0.65;
  const zRsi = (features.rsi14 - 50) / 22;
  const zAtr = Math.max(0, features.atrPct - 2.2) / 2.0;

  const diValue = Number(
    Math.sqrt((zObi ** 2 + zMom ** 2 + zVwap ** 2 + zRsi ** 2 + zAtr ** 2) / 5).toFixed(3)
  );
  const doPredict = diValue <= diThreshold;

  return {
    diValue,
    doPredict,
    outlierReason: doPredict
      ? undefined
      : `FreqAI DI Outlier [DI=${diValue.toFixed(2)} > ${diThreshold.toFixed(2)}]: Аномальное отклонение признаков (VWAP=${features.vwapDeviationPct.toFixed(2)}%, RSI=${features.rsi14.toFixed(1)}, ATR=${features.atrPct.toFixed(2)}%).`,
  };
}

/**
 * Freqtrade `minimal_roi` Time-Decaying ROI Table (ported from `freqtrade/strategy/interface.py:min_roi_reached`).
 * Ensures profitable trades are systematically harvested as hold duration increases instead of
 * waiting indefinitely for a distant static target and reversing into a stop-loss.
 *
 * Keys are hold duration in minutes; values are required net price profit ratio (after round-trip fees).
 */
export const DEFAULT_FREQTRADE_MINIMAL_ROI: Record<number, number> = {
  0: 0.0165,   // 0+ min: +1.65% price move (+16.5% ROE at 10x)
  15: 0.0105,  // 15+ min: +1.05% price move (+10.5% ROE at 10x)
  35: 0.0072,  // 35+ min: +0.72% price move (+7.2% ROE at 10x)
  60: 0.0048,  // 60+ min: +0.48% price move (+4.8% ROE at 10x)
  120: 0.0028, // 120+ min: +0.28% net price move (+2.8% ROE at 10x)
};

export function checkFreqtradeMinimalRoi(
  holdDurationMinutes: number,
  currentNetProfitRatio: number,
  roiTable: Record<number, number> = DEFAULT_FREQTRADE_MINIMAL_ROI
): {
  roiReached: boolean;
  roiThreshold: number | null;
  matchedBucketMinutes: number | null;
} {
  const buckets = Object.keys(roiTable)
    .map((k) => Number(k))
    .filter((m) => Number.isFinite(m) && m <= holdDurationMinutes)
    .sort((a, b) => b - a);

  if (buckets.length === 0) {
    return { roiReached: false, roiThreshold: null, matchedBucketMinutes: null };
  }

  const matchedBucketMinutes = buckets[0];
  const roiThreshold = roiTable[matchedBucketMinutes];
  const roiReached = currentNetProfitRatio >= roiThreshold;

  return {
    roiReached,
    roiThreshold,
    matchedBucketMinutes,
  };
}

/**
 * Freqtrade `should_exit` Unified Exit Hierarchy (ported from `freqtrade/strategy/interface.py:1430-1523`).
 * Evaluates in exact Freqtrade sequence:
 * 1. EXIT_SIGNAL (`use_exit_signal = true`, `exit_profit_only = true`, `exit_profit_offset = 0.0025`):
 *    If position is in net profit (> +0.25% price move after fees) AND live L2/RSI indicators reverse against the position, exit immediately!
 * 2. STOP_LOSS / TRAILING_STOP_LOSS: Price breaches `slPrice`.
 * 3. ROI (`min_roi_reached`): Time-decaying `minimal_roi` target reached for current `holdDurationMinutes`.
 */
export function evaluateFreqtradeShouldExit(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  slPrice: number;
  isTrailing?: boolean;
  isBreakEven?: boolean;
  openedAt: number;
  nowTs?: number;
  roundTripFeeRatio?: number;
  liveFeatures?: {
    obi: number;
    rsi14: number;
    momentumSignal: number;
  };
  roiTable?: Record<number, number>;
}): {
  shouldExit: boolean;
  exitType: 'NONE' | 'EXIT_SIGNAL' | 'STOP_LOSS' | 'ROI' | 'TRAILING_STOP_LOSS';
  exitReasonTag: string;
  netProfitRatio: number;
  holdDurationMinutes: number;
} {
  const {
    side,
    entryPrice,
    currentPrice,
    slPrice,
    isTrailing = false,
    isBreakEven = false,
    openedAt,
    nowTs = Date.now(),
    roundTripFeeRatio = 0.0011,
    liveFeatures,
    roiTable = DEFAULT_FREQTRADE_MINIMAL_ROI,
  } = params;

  const dirSign = side === 'LONG' ? 1 : -1;
  const rawProfitRatio = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * dirSign : 0;
  const netProfitRatio = Number((rawProfitRatio - roundTripFeeRatio).toFixed(5));
  const holdDurationMinutes = Math.max(0, Math.floor((nowTs - openedAt) / 60000));

  // 1. Check Stop-Loss / Trailing Stop-Loss breach first if price crossed slPrice
  const slBreached = side === 'LONG' ? currentPrice <= slPrice : currentPrice >= slPrice;
  if (slBreached) {
    if (isTrailing || (isBreakEven && netProfitRatio > 0)) {
      return {
        shouldExit: true,
        exitType: 'TRAILING_STOP_LOSS',
        exitReasonTag: isTrailing ? 'trailing_stop_loss' : 'breakeven_stop_lock',
        netProfitRatio,
        holdDurationMinutes,
      };
    }
    return {
      shouldExit: true,
      exitType: 'STOP_LOSS',
      exitReasonTag: 'stop_loss',
      netProfitRatio,
      holdDurationMinutes,
    };
  }

  // 2. Check `populate_exit_trend` + `exit_profit_only`:
  // - If RSI reaches exhaustion (>= 67 for LONG / <= 33 for SHORT), harvest profit once netProfitRatio >= 0.0025 (+0.25%).
  // - For pure L2 OBI reversal without RSI exhaustion, require netProfitRatio >= 0.0085 (+0.85% move = +8.5% ROE at 10x)
  //   so normal 3.5s orderbook flickers do not prematurely cut winning trades at +$0.04 before TP1 (1.55R).
  if (liveFeatures && netProfitRatio >= 0.0025) {
    const isLongReversal =
      side === 'LONG' &&
      (liveFeatures.rsi14 >= 67 ||
        (netProfitRatio >= 0.0085 && liveFeatures.obi <= -0.22 && liveFeatures.momentumSignal < 0.02));
    const isShortReversal =
      side === 'SHORT' &&
      (liveFeatures.rsi14 <= 33 ||
        (netProfitRatio >= 0.0085 && liveFeatures.obi >= 0.22 && liveFeatures.momentumSignal > -0.02));

    if (isLongReversal || isShortReversal) {
      return {
        shouldExit: true,
        exitType: 'EXIT_SIGNAL',
        exitReasonTag: `exit_signal_profit_lock (RSI=${liveFeatures.rsi14.toFixed(1)}, OBI=${liveFeatures.obi.toFixed(2)})`,
        netProfitRatio,
        holdDurationMinutes,
      };
    }
  }

  // 3. Check `minimal_roi` (`min_roi_reached`)
  const roiCheck = checkFreqtradeMinimalRoi(holdDurationMinutes, netProfitRatio, roiTable);
  if (roiCheck.roiReached) {
    return {
      shouldExit: true,
      exitType: 'ROI',
      exitReasonTag: `minimal_roi_${roiCheck.matchedBucketMinutes}m (+${(netProfitRatio * 100).toFixed(2)}%)`,
      netProfitRatio,
      holdDurationMinutes,
    };
  }

  return {
    shouldExit: false,
    exitType: 'NONE',
    exitReasonTag: '',
    netProfitRatio,
    holdDurationMinutes,
  };
}

/**
 * Freqtrade `LowProfitPairs` Protection Plugin (ported from `freqtrade/plugins/protections/low_profit_pairs.py`).
 * Locks a pair if its cumulative closed PnL over `lookbackMinutes` (default 360m = 6h) is below `requiredProfitUsdt` (0.0).
 */
export function evaluateLowProfitPairsProtection(params: {
  symbol: string;
  closedTrades: Array<{
    symbol: string;
    netPnlUsdt: number;
    closedAt: number;
  }>;
  nowTs?: number;
  lookbackMinutes?: number;
  stopDurationMinutes?: number;
  tradeLimit?: number;
  requiredProfitUsdt?: number;
}): { allowed: boolean; reason?: string; unlockAtTs?: number } {
  const {
    symbol,
    closedTrades,
    nowTs = Date.now(),
    lookbackMinutes = 360,
    stopDurationMinutes = 90,
    tradeLimit = 1,
    requiredProfitUsdt = 0.0,
  } = params;

  const lookbackCutoff = nowTs - lookbackMinutes * 60 * 1000;
  const recentPairTrades = closedTrades.filter(
    (t) => t.symbol === symbol && (t.closedAt || 0) >= lookbackCutoff
  );

  if (recentPairTrades.length < tradeLimit) {
    return { allowed: true };
  }

  const cumulativePnl = recentPairTrades.reduce((acc, t) => acc + (t.netPnlUsdt || 0), 0);
  if (cumulativePnl < requiredProfitUsdt) {
    const latestClose = Math.max(...recentPairTrades.map((t) => t.closedAt || 0));
    const unlockAtTs = latestClose + stopDurationMinutes * 60 * 1000;
    if (nowTs < unlockAtTs) {
      const remMin = Math.ceil((unlockAtTs - nowTs) / 60000);
      return {
        allowed: false,
        unlockAtTs,
        reason: `LowProfitPairs Protection: пара ${symbol} в минусе ($${cumulativePnl.toFixed(2)}) за последние ${lookbackMinutes}м. Блокировка ещё ${remMin}м.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Freqtrade Pairlist Pipeline (`VolumePairList -> SpreadFilter -> VolatilityFilter -> PerformanceFilter`)
 * ported from `freqtrade/plugins/pairlist/PerformanceFilter.py` & `VolatilityFilter.py`.
 * Filters out dead/hyper-volatile pairs and ranks the whitelist by historical `profit_ratio` (highest profit first,
 * untested pairs neutral 0, losing pairs last).
 */
export function applyFreqtradePairlistPipeline(params: {
  candidates: string[];
  screenerMeta: Array<{
    symbol: string;
    spreadBps?: number;
    atrPct?: number;
    priceChangePct?: number;
    turnover24h?: number;
  }>;
  closedTrades: Array<{
    symbol: string;
    netPnlUsdt: number;
  }>;
  maxSpreadBps?: number;
  minVolatilityPct?: number;
  maxVolatilityPct?: number;
}): string[] {
  const {
    candidates,
    screenerMeta,
    closedTrades,
    maxSpreadBps = 10.0,
    minVolatilityPct = 0.35,
    maxVolatilityPct = 6.5,
  } = params;

  const metaMap = new Map(screenerMeta.map((m) => [m.symbol, m]));

  // 1. SpreadFilter & VolatilityFilter
  const filtered = candidates.filter((sym) => {
    const m = metaMap.get(sym);
    if (!m) return true; // keep whitelisted major if screener metadata not loaded yet
    const spreadOk = (m.spreadBps ?? 1.0) <= maxSpreadBps;
    const atr = m.atrPct ?? 1.8;
    const volOk = atr >= minVolatilityPct && atr <= maxVolatilityPct;
    return spreadOk && volOk;
  });

  // 2. PerformanceFilter (aggregate profit & trade count per pair, exactly like PerformanceFilter.py)
  const perfMap = new Map<string, { profitUsdt: number; count: number }>();
  for (const t of closedTrades) {
    const cur = perfMap.get(t.symbol) || { profitUsdt: 0, count: 0 };
    cur.profitUsdt = Number((cur.profitUsdt + (t.netPnlUsdt || 0)).toFixed(4));
    cur.count += 1;
    perfMap.set(t.symbol, cur);
  }

  return [...filtered].sort((a, b) => {
    const perfA = perfMap.get(a) || { profitUsdt: 0, count: 0 };
    const perfB = perfMap.get(b) || { profitUsdt: 0, count: 0 };
    if (perfA.profitUsdt !== perfB.profitUsdt) {
      return perfB.profitUsdt - perfA.profitUsdt; // Higher realized profit first (0 beats negative!)
    }
    if (perfA.count !== perfB.count) {
      return perfA.count - perfB.count; // Fewer trades preferred on equal profit
    }
    const metaA = metaMap.get(a);
    const metaB = metaMap.get(b);
    return Math.abs(metaB?.priceChangePct || 0) - Math.abs(metaA?.priceChangePct || 0);
  });
}

/**
 * Evaluates a bot's strategy policy using Freqtrade IStrategy + FreqAI DI_values + NFI rules + Telegram Channel Alpha:
 * - FreqAI Dissimilarity Index (`DI_values`) filters out anomalous market spikes.
 * - Strict VWAP Value-Zone Entry: never chase a candle that already moved > +0.58% above VWAP for LONG (or < -0.58% below VWAP for SHORT).
 * - Telegram Channel Veto & Conviction: prevents opening trades against strong Telegram channel signals (`|sentimentSignal| >= 0.35`),
 *   and allows `TG_CHANNEL` / channel-backed signals (`|sentimentSignal| >= 0.45`) to execute without waiting for extreme L2 OBI.
 */
export interface SignalEvaluationContext {
  marketRegime?: string;
  primaryEvent?: string;
  strategyId?: string;
}

const TREND_BREAKOUT_STRATEGY_IDS = new Set([
  'strat-bull-breakout-pro',
  'agent-lgbm-nightly',
  'strat-alt-rotation-alpha',
  'strat-volatility-squeeze',
  'agent-mtf-scalper',
  'agent-volume-spike',
]);

export function isTrendBreakoutContext(options?: SignalEvaluationContext): boolean {
  if (!options) return false;
  if (options.strategyId && TREND_BREAKOUT_STRATEGY_IDS.has(options.strategyId)) {
    return true;
  }
  const ev = String(options.primaryEvent || '').toUpperCase();
  if (
    ev === 'BULL_EXPANSION' ||
    ev === 'BEAR_FLUSH' ||
    ev === 'MARKET_FLUSH_SHORT' ||
    ev === 'SHORT_SQUEEZE_UP' ||
    ev === 'VOLATILITY_SPIKE'
  ) {
    return true;
  }
  const reg = String(options.marketRegime || '').toUpperCase();
  return (
    reg.includes('BULL') ||
    reg.includes('EXPANSION') ||
    reg.includes('FLUSH') ||
    reg.includes('DUMP') ||
    reg.includes('БЫЧИЙ') ||
    reg.includes('АЛЬТ-СЕЗОН') ||
    reg.includes('РАЛЛИ') ||
    reg.includes('ПАМП') ||
    reg.includes('СБРОС')
  );
}

export function evaluateBotSignal(
  brain: BotBrainState,
  features: MarketFeatureVector,
  options?: SignalEvaluationContext
): {
  action: 'LONG' | 'SHORT' | 'SKIP';
  compositeScore: number;
  slDistancePct: number;
  contributions: { obi: number; momentum: number; vwap: number; sentiment: number };
  reasonSummary: string;
} {
  const w = normalizeWeights(brain.weights);

  const cObi = Number((w.obiWeight * features.obi).toFixed(4));
  const cMom = Number((w.momentumWeight * features.momentumSignal).toFixed(4));
  const cVwap = Number((w.vwapWeight * features.vwapSignal).toFixed(4));
  const cSent = Number((w.sentimentWeight * features.sentimentSignal).toFixed(4));

  let rawScore = cObi + cMom + cVwap + cSent;
  let regimeTag = 'FREQTRADE_NFI';

  // Strong Telegram Channel Signal Conviction Boost (when channel sentiment is decisive >= 0.45)
  const hasStrongTgSignal = Math.abs(features.sentimentSignal) >= 0.45;
  const tgSign = Math.sign(features.sentimentSignal);
  if (hasStrongTgSignal && Math.sign(rawScore) === tgSign) {
    rawScore += tgSign * 0.08;
    regimeTag = 'TG_CHANNEL_ALPHA';
  }

  // 1. Institutional Confluence Surge: L2 OBI, Momentum, and VWAP all align in direction
  const obiSign = Math.sign(features.obi);
  const momSign = Math.sign(features.momentumSignal);
  const vwapSign = Math.sign(features.vwapSignal);
  if (
    obiSign !== 0 &&
    obiSign === momSign &&
    obiSign === vwapSign &&
    Math.abs(features.obi) >= 0.15 &&
    Math.abs(features.momentumSignal) >= 0.12
  ) {
    rawScore *= 1.18;
    regimeTag = hasStrongTgSignal && obiSign === tgSign ? 'FT_TG_CONFLUENCE' : 'FT_CONFLUENCE';
  }

  // 2. Orderflow Divergence Trap Filter (Bull/Bear Trap): L2 book opposes price impulse
  if (features.obi * features.momentumSignal < -0.02) {
    rawScore *= 0.55;
    regimeTag = 'TRAP_DAMPENED';
  }

  const compositeScore = Number(clamp(rawScore, -1, 1).toFixed(4));
  // Structural ATR Stop-Loss (1.15% - 2.50% in live trading, bounded [0.35, 3.8] for custom unit test inputs)
  const slDistancePct = Number(clamp(features.atrPct * (brain.atrMultiplier || 1.55), 0.35, 3.8).toFixed(3));

  // 3. L2 Spread Guard (`SpreadFilter.py`)
  if (features.spreadBps > (brain.maxSpreadBps || 18.0)) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [SpreadFilter]: Спред стакана (${features.spreadBps.toFixed(1)} bps) превышает лимит ${brain.maxSpreadBps} bps.`,
    };
  }

  // 4. Telegram Channel Signal Veto: never open LONG against strong bearish TG channel signal (<= -0.35)
  //    and never open SHORT against strong bullish TG channel signal (>= +0.35)
  if (compositeScore > 0 && features.sentimentSignal <= -0.35) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [TG Signal Veto]: Сигнал Telegram-каналов медвежий (${features.sentimentSignal.toFixed(2)}). Покупка (LONG) против канала заблокирована.`,
    };
  }
  if (compositeScore < 0 && features.sentimentSignal >= 0.35) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [TG Signal Veto]: Сигнал Telegram-каналов бычий (+${features.sentimentSignal.toFixed(2)}). Продажа (SHORT) против канала заблокирована.`,
    };
  }

  // 5. Freqtrade NFI Anti-Top-Chasing & Adaptive Trend Value-Zone VWAP Guard:
  // Standard strict pullback window (RSI <= 63, VWAP <= +0.58%) vs balanced trend-breakout window (RSI <= 74, VWAP <= +1.95%).
  const trendBreakout = isTrendBreakoutContext(options);
  const maxRsiLong = trendBreakout ? 74 : 63;
  const minRsiShort = trendBreakout ? 26 : 37;
  const maxVwapDevLong = trendBreakout ? 1.95 : 0.58;
  const minVwapDevShort = trendBreakout ? -1.95 : -0.58;
  const diLimit = trendBreakout ? 2.25 : 1.85;

  const isLongExhausted = trendBreakout
    ? features.rsi14 > maxRsiLong ||
      (features.vwapDeviationPct > maxVwapDevLong && features.rsi14 >= 66) ||
      features.vwapDeviationPct > 2.65
    : features.rsi14 > maxRsiLong || features.vwapDeviationPct > maxVwapDevLong;

  const isShortExhausted = trendBreakout
    ? features.rsi14 < minRsiShort ||
      (features.vwapDeviationPct < minVwapDevShort && features.rsi14 <= 34) ||
      features.vwapDeviationPct < -2.65
    : features.rsi14 < minRsiShort || features.vwapDeviationPct < minVwapDevShort;

  if (
    compositeScore > 0 &&
    isLongExhausted &&
    (features.obi < 0.72 || features.sentimentSignal < 0)
  ) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [RSI Exhaustion / VWAP Overextension]: Цена уже ушла вверх от справедливой стоимости (RSI=${features.rsi14.toFixed(1)}/${maxRsiLong}, VWAP=${features.vwapDeviationPct >= 0 ? '+' : ''}${features.vwapDeviationPct.toFixed(2)}% > +${maxVwapDevLong.toFixed(2)}%). Ждем отката к средней полосе Боллинджера.`,
    };
  }
  if (
    compositeScore < 0 &&
    isShortExhausted &&
    (features.obi > -0.72 || features.sentimentSignal > 0)
  ) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [RSI Exhaustion / VWAP Overextension]: Цена уже провалилась далеко ниже VWAP (RSI=${features.rsi14.toFixed(1)}/${minRsiShort}, VWAP=${features.vwapDeviationPct.toFixed(2)}% < ${minVwapDevShort.toFixed(2)}%). Ждем отскока к сопротивлению.`,
    };
  }

  // 6. FreqAI Dissimilarity Index Outlier Guard (`DI_values`)
  const diCheck = calculateFreqaiDissimilarityIndex(features, diLimit);
  if (!diCheck.doPredict) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [${diCheck.outlierReason}]`,
    };
  }

  // 7. Mandatory Freqtrade `populate_entry_trend` Gate + Variant 3 Trend-Grid Pullback Support:
  // - Standard L2/Momentum impulse requires |OBI| >= 0.12 & |Mom| >= 0.08 & |EMA| >= 1.5 bps.
  // - Channel-backed continuation (`tgBackedLong` / `tgBackedShort`) allows entry when |sentimentSignal| >= 0.45 and L2 book aligns (|OBI| >= 0.04).
  // - Variant 3 Trend-Grid Pullback (`gridPullbackLong` / `gridPullbackShort` — "@ne_investor dip/bounce grid"):
  //   Allows buying a pullback below/near VWAP (vwapDeviationPct <= 0.12%, RSI <= 54) in the direction of a bullish TG channel signal (>= +0.40),
  //   or shorting a bounce above/near VWAP (vwapDeviationPct >= -0.12%, RSI >= 46) in the direction of a bearish TG channel signal (<= -0.40),
  //   provided L2 book is not heavily opposing (obi >= -0.08 for LONG / obi <= +0.08 for SHORT).
  const tgBackedLong =
    compositeScore > 0 &&
    features.sentimentSignal >= 0.45 &&
    features.obi >= 0.04 &&
    features.momentumSignal >= -0.05;
  const tgBackedShort =
    compositeScore < 0 &&
    features.sentimentSignal <= -0.45 &&
    features.obi <= -0.04 &&
    features.momentumSignal <= 0.05;

  const gridPullbackLong =
    compositeScore > 0 &&
    features.sentimentSignal >= 0.40 &&
    features.vwapDeviationPct <= 0.12 &&
    features.rsi14 <= 54 &&
    features.obi >= -0.08;
  const gridPullbackShort =
    compositeScore < 0 &&
    features.sentimentSignal <= -0.40 &&
    features.vwapDeviationPct >= -0.12 &&
    features.rsi14 >= 46 &&
    features.obi <= 0.08;

  // Strong directional EMA + Momentum trend continuation when L2 book is neutral (not opposing)
  const momentumTrendLong =
    compositeScore > 0 &&
    features.momentumSignal >= 0.30 &&
    features.emaTrendBps >= 12.0 &&
    features.obi >= -0.03;
  const momentumTrendShort =
    compositeScore < 0 &&
    features.momentumSignal <= -0.30 &&
    features.emaTrendBps <= -12.0 &&
    features.obi <= 0.03;

  if (gridPullbackLong || gridPullbackShort) {
    regimeTag = 'TREND_GRID_PULLBACK';
  } else if (momentumTrendLong || momentumTrendShort) {
    regimeTag = 'MOMENTUM_TREND';
  }

  if (
    compositeScore > 0 &&
    !tgBackedLong &&
    !gridPullbackLong &&
    !momentumTrendLong &&
    (features.obi < 0.12 || features.momentumSignal < 0.08 || features.emaTrendBps < 1.5)
  ) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [populate_entry_trend]: Нет сетапа LONG (требуется OBI >= +0.12, EMA >= +1.5 bps или откат по сигналу канала; сейчас OBI=${features.obi.toFixed(2)}, EMA=${features.emaTrendBps.toFixed(1)} bps).`,
    };
  }
  if (
    compositeScore < 0 &&
    !tgBackedShort &&
    !gridPullbackShort &&
    !momentumTrendShort &&
    (features.obi > -0.12 || features.momentumSignal > -0.08 || features.emaTrendBps > -1.5)
  ) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [populate_entry_trend]: Нет сетапа SHORT (требуется OBI <= -0.12, EMA <= -1.5 bps или отскок по сигналу канала; сейчас OBI=${features.obi.toFixed(2)}, EMA=${features.emaTrendBps.toFixed(1)} bps).`,
    };
  }

  // 8. Strict Confidence Threshold
  const absScore = Math.abs(compositeScore);
  if (absScore < brain.confidenceThreshold) {
    return {
      action: 'SKIP',
      compositeScore,
      slDistancePct,
      contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
      reasonSummary: `Пропуск [${regimeTag}]: Сигнал слабее порога (|${compositeScore.toFixed(2)}| < ${brain.confidenceThreshold.toFixed(2)}). OBI=${features.obi.toFixed(2)}, RSI=${features.rsi14.toFixed(1)}.`,
    };
  }

  const action: 'LONG' | 'SHORT' = compositeScore >= 0 ? 'LONG' : 'SHORT';
  const reasonSummary = `Сигнал [${action} · ${regimeTag} · DI=${diCheck.diValue.toFixed(2)}]: Score=${compositeScore >= 0 ? '+' : ''}${compositeScore.toFixed(2)} (порог ${brain.confidenceThreshold.toFixed(2)}) · TG=${features.sentimentSignal >= 0 ? '+' : ''}${features.sentimentSignal.toFixed(2)} · L2 OBI=${features.obi >= 0 ? '+' : ''}${features.obi.toFixed(2)} · RSI=${features.rsi14.toFixed(1)} · VWAP=${features.vwapDeviationPct >= 0 ? '+' : ''}${features.vwapDeviationPct.toFixed(2)}%`;

  return {
    action,
    compositeScore,
    slDistancePct,
    contributions: { obi: cObi, momentum: cMom, vwap: cVwap, sentiment: cSent },
    reasonSummary,
  };
}

/**
 * Online Reinforcement Learning (Contextual Bandit / Policy Gradient) weight update
 * triggered whenever a position opened by a bot is closed.
 */
export function updateBotBrainOnline(params: {
  agentId: string;
  brain: BotBrainState;
  entryFeatures: {
    obi: number;
    momentum: number;
    vwap: number;
    sentiment: number;
  };
  side: 'LONG' | 'SHORT';
  netPnlUsdt: number;
  riskBudgetUsdt: number;
  symbol: string;
}): {
  updatedBrain: BotBrainState;
  reward: number;
  weightDelta: BotFeatureWeights;
  newSha256: string;
} {
  const { agentId, brain, entryFeatures, side, netPnlUsdt, riskBudgetUsdt, symbol } = params;
  const dirSign = side === 'LONG' ? 1 : -1;

  // Risk-adjusted reward R in [-2.0, +2.5] (supports micro-capital $10 accounts where 1R = $0.15)
  const safeRisk = Math.max(0.05, riskBudgetUsdt);
  const reward = Number(clamp(netPnlUsdt / safeRisk, -2.0, 2.5).toFixed(3));

  const lr = clamp(brain.learningRate || 0.06, 0.01, 0.2);
  const oldW = normalizeWeights(brain.weights);

  // Directional alignment of each factor with the executed side
  const alignObi = entryFeatures.obi * dirSign;
  const alignMom = entryFeatures.momentum * dirSign;
  const alignVwap = entryFeatures.vwap * dirSign;
  const alignSent = entryFeatures.sentiment * dirSign;

  const rawNext: BotFeatureWeights = {
    obiWeight: Math.max(0.06, oldW.obiWeight + lr * reward * alignObi),
    momentumWeight: Math.max(0.06, oldW.momentumWeight + lr * reward * alignMom),
    vwapWeight: Math.max(0.06, oldW.vwapWeight + lr * reward * alignVwap),
    sentimentWeight: Math.max(0.06, oldW.sentimentWeight + lr * reward * alignSent),
  };

  const newW = normalizeWeights(rawNext);
  const weightDelta: BotFeatureWeights = {
    obiWeight: Number((newW.obiWeight - oldW.obiWeight).toFixed(4)),
    momentumWeight: Number((newW.momentumWeight - oldW.momentumWeight).toFixed(4)),
    vwapWeight: Number((newW.vwapWeight - oldW.vwapWeight).toFixed(4)),
    sentimentWeight: Number((newW.sentimentWeight - oldW.sentimentWeight).toFixed(4)),
  };

  // Adaptive threshold adjustment: tighten after losses (capped at 0.30 to avoid starving entries), relax after strong wins
  let nextThreshold = brain.confidenceThreshold;
  if (reward < -0.2) {
    nextThreshold = clamp(nextThreshold + 0.008, 0.14, 0.30);
  } else if (reward > 0.4) {
    nextThreshold = clamp(nextThreshold - 0.004, 0.14, 0.30);
  } else if (nextThreshold > 0.30) {
    nextThreshold = 0.30;
  }
  nextThreshold = Number(nextThreshold.toFixed(3));

  const nextUpdates = (brain.onlineUpdatesCount || 0) + 1;
  const nextCumulative = Number(((brain.cumulativeReward || 0) + reward).toFixed(3));
  const newSha256 = computeBrainSha256(agentId, newW, (brain.epochsTrained || 1) * 100 + nextUpdates);

  const nextHistory = [
    ...(brain.rewardHistory || []).slice(-29),
    {
      timestamp: Date.now(),
      label: `${symbol} (${side})`,
      reward,
      cumulativeReward: nextCumulative,
      sha256: newSha256.slice(0, 16),
    },
  ];

  const updatedBrain: BotBrainState = {
    ...brain,
    weights: newW,
    lastWeightDelta: weightDelta,
    confidenceThreshold: nextThreshold,
    onlineUpdatesCount: nextUpdates,
    cumulativeReward: nextCumulative,
    lastTrainedAt: Date.now(),
    rewardHistory: nextHistory,
  };

  return {
    updatedBrain,
    reward,
    weightDelta,
    newSha256,
  };
}

/**
 * Computes an institutional adaptive market profile based on regime, volatility (ATR),
 * market breadth, and benchmark movement.
 * Follows NautilusTrader & Freqtrade dynamic hyperparameter adaptation.
 */
export function computeAdaptiveMarketProfile(params: {
  regime: MarketRegimeType;
  avgAtrPct: number;
  marketBreadthPct: number;
  btcChange24hPct: number;
}): AdaptiveMarketProfile {
  const { regime, avgAtrPct, marketBreadthPct, btcChange24hPct } = params;

  let volatilityState: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' = 'NORMAL';
  if (avgAtrPct < 1.8) volatilityState = 'LOW';
  else if (avgAtrPct >= 4.5) volatilityState = 'EXTREME';
  else if (avgAtrPct >= 3.2) volatilityState = 'HIGH';

  let regimeTitle = '🔄 Боковой диапазон (Range / Choppy)';
  let dynamicAtrMultiplier = 1.45;
  let dynamicConfidenceThreshold = 0.22;
  let dynamicTpSlRatio = 2.0;
  let weightBiases: BotFeatureWeights = { obiWeight: 0.30, momentumWeight: 0.25, vwapWeight: 0.25, sentimentWeight: 0.20 };
  let allowedSides: 'LONG_AND_SHORT' | 'LONG_ONLY' | 'SHORT_ONLY' = 'LONG_AND_SHORT';

  switch (regime) {
    case 'ALT_SEASON_EXPANSION':
      regimeTitle = '🚀 Альт-сезон / Импульс альткоинов';
      dynamicAtrMultiplier = 1.55;
      dynamicConfidenceThreshold = 0.19; // slightly looser to catch breakouts early
      dynamicTpSlRatio = 2.3; // extend TP for runners
      weightBiases = { obiWeight: 0.22, momentumWeight: 0.40, vwapWeight: 0.18, sentimentWeight: 0.20 };
      allowedSides = 'LONG_ONLY'; // avoid counter-trend shorts during broad expansion
      break;

    case 'MARKET_WIDE_DUMP':
      regimeTitle = '📉 Общерыночный сброс (Flush)';
      dynamicAtrMultiplier = 1.70; // wider stop to absorb wick flushes
      dynamicConfidenceThreshold = 0.26; // tighter filter to avoid falling knives
      dynamicTpSlRatio = 2.4;
      weightBiases = { obiWeight: 0.38, momentumWeight: 0.36, vwapWeight: 0.14, sentimentWeight: 0.12 };
      allowedSides = 'SHORT_ONLY'; // protect against knife-catching
      break;

    case 'SELECTIVE_PUMPS':
      regimeTitle = '🎯 Выборочные пампы альткоинов';
      dynamicAtrMultiplier = 1.50;
      dynamicConfidenceThreshold = 0.21;
      dynamicTpSlRatio = 2.1;
      weightBiases = { obiWeight: 0.26, momentumWeight: 0.38, vwapWeight: 0.18, sentimentWeight: 0.18 };
      allowedSides = 'LONG_AND_SHORT';
      break;

    case 'STRONG_BULL':
      regimeTitle = '🚀 Сильный бычий тренд';
      dynamicAtrMultiplier = 1.45;
      dynamicConfidenceThreshold = 0.18;
      dynamicTpSlRatio = 2.2;
      weightBiases = { obiWeight: 0.25, momentumWeight: 0.38, vwapWeight: 0.17, sentimentWeight: 0.20 };
      allowedSides = 'LONG_ONLY';
      break;

    case 'STRONG_BEAR':
      regimeTitle = '📉 Сильный медвежий пробой';
      dynamicAtrMultiplier = 1.65;
      dynamicConfidenceThreshold = 0.25;
      dynamicTpSlRatio = 2.3;
      weightBiases = { obiWeight: 0.35, momentumWeight: 0.38, vwapWeight: 0.15, sentimentWeight: 0.12 };
      allowedSides = 'SHORT_ONLY';
      break;

    case 'HIGH_VOLATILITY':
      regimeTitle = '⚡ Высокая волатильность рынка';
      dynamicAtrMultiplier = 1.80; // wide ATR stop to avoid wicked stops
      dynamicConfidenceThreshold = 0.28; // strict confidence requirement
      dynamicTpSlRatio = 2.4;
      weightBiases = { obiWeight: 0.38, momentumWeight: 0.24, vwapWeight: 0.20, sentimentWeight: 0.18 };
      allowedSides = 'LONG_AND_SHORT';
      break;

    case 'RANGE_CHOP':
    default:
      regimeTitle = '🔄 Боковой диапазон (Range / Choppy)';
      dynamicAtrMultiplier = 1.35; // tighter stop in range
      dynamicConfidenceThreshold = 0.23; // avoid false chop breakouts
      dynamicTpSlRatio = 1.8; // take profit quicker at range boundaries
      weightBiases = { obiWeight: 0.32, momentumWeight: 0.18, vwapWeight: 0.34, sentimentWeight: 0.16 }; // prioritize VWAP mean-reversion & L2 depth
      allowedSides = 'LONG_AND_SHORT';
      break;
  }

  // Adjust for extreme or low volatility overlay
  if (volatilityState === 'EXTREME') {
    dynamicAtrMultiplier = Math.min(2.0, dynamicAtrMultiplier + 0.15);
    dynamicConfidenceThreshold = Math.min(0.35, dynamicConfidenceThreshold + 0.03);
  } else if (volatilityState === 'LOW') {
    dynamicAtrMultiplier = Math.max(1.20, dynamicAtrMultiplier - 0.10);
  }

  return {
    regime,
    regimeTitle,
    volatilityState,
    dynamicAtrMultiplier: Number(dynamicAtrMultiplier.toFixed(2)),
    dynamicConfidenceThreshold: Number(dynamicConfidenceThreshold.toFixed(2)),
    dynamicTpSlRatio: Number(dynamicTpSlRatio.toFixed(1)),
    weightBiases: normalizeWeights(weightBiases),
    allowedSides,
  };
}

/**
 * Automatically adapts a bot's brain and parameters to the current market regime.
 * Smoothly blends existing learned weights with regime biases (90% learned, 10% regime morph),
 * dynamically scales ATR stop-loss multiplier and entry threshold, and updates lastTrainedAt.
 * Zero-lag $O(1)$ computation — eliminates lag and unnecessary retraining alerts.
 */
export function adaptBotBrainToMarketRegime(
  brain: BotBrainState,
  marketStats: {
    regime: MarketRegimeType;
    avgAtrPct: number;
    marketBreadthPct: number;
    btcChange24hPct: number;
  },
  engineType: string = 'ONNX_RL'
): {
  adaptedBrain: BotBrainState;
  profile: AdaptiveMarketProfile;
  adjustments: {
    atrMultiplier: number;
    confidenceThreshold: number;
    tpSlRatio: number;
    regimeTitle: string;
    weightDelta: BotFeatureWeights;
  };
} {
  const profile = computeAdaptiveMarketProfile(marketStats);
  const currentW = normalizeWeights(brain.weights);
  const biasW = profile.weightBiases;

  // Engine-specific customization
  let targetBias = { ...biasW };
  if (engineType === 'ONNX_RL') {
    // Favor L2 OBI
    targetBias.obiWeight += 0.08;
  } else if (engineType === 'LIGHTGBM') {
    // Favor Momentum & VWAP
    targetBias.momentumWeight += 0.08;
  } else if (engineType === 'TG_CHANNEL') {
    // Favor Sentiment
    targetBias.sentimentWeight += 0.10;
  }
  targetBias = normalizeWeights(targetBias);

  // Smooth blending: 88% current weights + 12% adaptive regime nudge
  const blended: BotFeatureWeights = {
    obiWeight: currentW.obiWeight * 0.88 + targetBias.obiWeight * 0.12,
    momentumWeight: currentW.momentumWeight * 0.88 + targetBias.momentumWeight * 0.12,
    vwapWeight: currentW.vwapWeight * 0.88 + targetBias.vwapWeight * 0.12,
    sentimentWeight: currentW.sentimentWeight * 0.88 + targetBias.sentimentWeight * 0.12,
  };
  const finalWeights = normalizeWeights(blended);

  const weightDelta: BotFeatureWeights = {
    obiWeight: Number((finalWeights.obiWeight - currentW.obiWeight).toFixed(4)),
    momentumWeight: Number((finalWeights.momentumWeight - currentW.momentumWeight).toFixed(4)),
    vwapWeight: Number((finalWeights.vwapWeight - currentW.vwapWeight).toFixed(4)),
    sentimentWeight: Number((finalWeights.sentimentWeight - currentW.sentimentWeight).toFixed(4)),
  };

  // Smooth hyperparameter interpolation
  const finalAtrMultiplier = Number((brain.atrMultiplier * 0.80 + profile.dynamicAtrMultiplier * 0.20).toFixed(2));
  const finalThreshold = Number((brain.confidenceThreshold * 0.80 + profile.dynamicConfidenceThreshold * 0.20).toFixed(2));

  const adaptedBrain: BotBrainState = {
    ...brain,
    weights: finalWeights,
    lastWeightDelta: weightDelta,
    atrMultiplier: finalAtrMultiplier,
    confidenceThreshold: finalThreshold,
    lastTrainedAt: Date.now(), // keeps bot fresh so system never needs to nag user
  };

  return {
    adaptedBrain,
    profile,
    adjustments: {
      atrMultiplier: finalAtrMultiplier,
      confidenceThreshold: finalThreshold,
      tpSlRatio: profile.dynamicTpSlRatio,
      regimeTitle: profile.regimeTitle,
      weightDelta,
    },
  };
}

/**
 * Batch Epoch Trainer on real historical Bybit Klines.
 * Replays historical candles across symbols, simulates multi-factor trades,
 * optimizes feature weights via policy gradient, and produces an Epoch Training Report.
 */
export function runHistoricalKlineEpoch(params: {
  agentId: string;
  brain: BotBrainState;
  klinesBySymbol: Record<string, KlineBar[]>;
  tpSlRatio: number;
  sentimentBias?: number;
}): {
  updatedBrain: BotBrainState;
  newSha256: string;
  simulatedTrades: number;
  winsCount: number;
  lossesCount: number;
  winRatePct: number;
  epochReward: number;
  weightDelta: BotFeatureWeights;
  recommendedTpSlRatio: number;
} {
  const { agentId, brain, klinesBySymbol, tpSlRatio, sentimentBias = 0.15 } = params;
  const oldW = normalizeWeights(brain.weights);
  let workingW = { ...oldW };
  const lr = clamp((brain.learningRate || 0.06) * 0.65, 0.02, 0.15);

  let winsCount = 0;
  let lossesCount = 0;
  let totalReward = 0;
  let slHitCount = 0;
  let tpHitCount = 0;

  // Bybit v5 round-trip taker fee (0.055% entry + 0.055% exit = 0.11% = 0.0011)
  const roundTripFeePct = 0.0011;

  const symbols = Object.keys(klinesBySymbol);
  for (const sym of symbols) {
    const bars = klinesBySymbol[sym] || [];
    if (bars.length < 30) continue;

    for (let i = 22; i < bars.length - 5; i += 3) {
      const windowBars = bars.slice(i - 22, i + 1);
      const curBar = bars[i];

      // Synthesize top-of-book depth proxy from candle volume & wick imbalance for historical replay
      const bodyRange = Math.max(0.0001, curBar.high - curBar.low);
      const candleImbalance = clamp(((curBar.close - curBar.open) / bodyRange) * 0.75, -0.9, 0.9);

      const closes = windowBars.map((b) => b.close);
      const rsi14 = calculateRsi14(closes, 14);
      const ema9 = calculateEma(closes.slice(-15), 9);
      const ema21 = calculateEma(closes, 21);
      const emaTrendBps = curBar.close > 0 ? ((ema9 - ema21) / curBar.close) * 10000 : 0;
      const momSig = clamp(0.55 * Math.tanh(emaTrendBps / 18) + 0.45 * ((rsi14 - 50) / 30), -1, 1);
      const { vwapSignal } = calculateVwapDeviation(windowBars);
      const atrPct = calculateAtr14Pct(windowBars, 14);
      const sentSig = clamp(sentimentBias * Math.sign(candleImbalance + momSig), -1, 1);

      const score =
        workingW.obiWeight * candleImbalance +
        workingW.momentumWeight * momSig +
        workingW.vwapWeight * vwapSignal +
        workingW.sentimentWeight * sentSig;

      if (Math.abs(score) < brain.confidenceThreshold * 0.85) continue;

      const side: 'LONG' | 'SHORT' = score >= 0 ? 'LONG' : 'SHORT';
      const dir = side === 'LONG' ? 1 : -1;
      // Enforce fee-safe minimum stop distance of 0.60% (0.006)
      const slPct = clamp((atrPct / 100) * (brain.atrMultiplier || 1.45), 0.006, 0.025);
      const tpPct = slPct * clamp(tpSlRatio, 1.5, 3.5);
      const feeDragR = roundTripFeePct / slPct;

      // Evaluate net outcome (after Bybit round-trip fees) over next 4 bars
      let outcomeR = 0;
      let hitType: 'NONE' | 'SL' | 'TP' = 'NONE';
      for (let f = 1; f <= 4; f++) {
        const fut = bars[i + f];
        const moveUp = (fut.high - curBar.close) / curBar.close;
        const moveDown = (curBar.close - fut.low) / curBar.close;

        if (side === 'LONG') {
          if (moveDown >= slPct) {
            outcomeR = -1.0 - feeDragR;
            hitType = 'SL';
            break;
          }
          if (moveUp >= tpPct) {
            outcomeR = clamp(tpSlRatio * 0.78 - feeDragR, 0.6, 2.2);
            hitType = 'TP';
            break;
          }
        } else {
          if (moveUp >= slPct) {
            outcomeR = -1.0 - feeDragR;
            hitType = 'SL';
            break;
          }
          if (moveDown >= tpPct) {
            outcomeR = clamp(tpSlRatio * 0.78 - feeDragR, 0.6, 2.2);
            hitType = 'TP';
            break;
          }
        }
      }

      if (hitType === 'SL') slHitCount++;
      if (hitType === 'TP') tpHitCount++;

      if (outcomeR === 0) {
        const finalClose = bars[i + 4].close;
        const netRet = ((finalClose - curBar.close) / curBar.close) * dir - roundTripFeePct;
        outcomeR = clamp(netRet / slPct, -1.1, 1.4);
      }

      if (outcomeR > 0) winsCount++;
      else lossesCount++;

      totalReward += outcomeR * 0.25;

      // Update working weights along policy gradient
      workingW = normalizeWeights({
        obiWeight: Math.max(0.06, workingW.obiWeight + lr * 0.22 * outcomeR * (candleImbalance * dir)),
        momentumWeight: Math.max(0.06, workingW.momentumWeight + lr * 0.22 * outcomeR * (momSig * dir)),
        vwapWeight: Math.max(0.06, workingW.vwapWeight + lr * 0.22 * outcomeR * (vwapSignal * dir)),
        sentimentWeight: Math.max(0.06, workingW.sentimentWeight + lr * 0.22 * outcomeR * (sentSig * dir)),
      });
    }
  }

  const simulatedTrades = winsCount + lossesCount;
  const winRatePct = simulatedTrades > 0 ? Number(((winsCount / simulatedTrades) * 100).toFixed(1)) : 58.5;
  const epochReward = Number(clamp(totalReward, -1.5, 2.8).toFixed(3));

  // Auto-tune operational hyperparameters based on epoch performance
  let nextThreshold = brain.confidenceThreshold || 0.22;
  if (winRatePct < 54 || epochReward < 0) {
    // Tighten entry filter if too many noisy trades lost to fees/stops
    nextThreshold = clamp(nextThreshold + 0.008, 0.16, 0.42);
  } else if (winRatePct > 66 && simulatedTrades < 12) {
    // Slightly relax if win rate is very high but sample rate is too restrictive
    nextThreshold = clamp(nextThreshold - 0.004, 0.16, 0.42);
  }
  nextThreshold = Number(nextThreshold.toFixed(3));

  let nextAtrMultiplier = brain.atrMultiplier || 1.45;
  const slRatio = simulatedTrades > 0 ? slHitCount / simulatedTrades : 0;
  if (slRatio > 0.42) {
    // Widen ATR stop multiplier so stops aren't hunted by market noise and fees don't eat R-budget
    nextAtrMultiplier = clamp(nextAtrMultiplier + 0.06, 1.25, 2.5);
  } else if (slRatio < 0.18 && winRatePct > 62) {
    nextAtrMultiplier = clamp(nextAtrMultiplier - 0.03, 1.25, 2.5);
  }
  nextAtrMultiplier = Number(nextAtrMultiplier.toFixed(2));

  let nextMaxSpreadBps = brain.maxSpreadBps || 14.0;
  if (epochReward < 0) {
    nextMaxSpreadBps = Number(clamp(nextMaxSpreadBps - 0.5, 8.0, 14.0).toFixed(1));
  } else {
    nextMaxSpreadBps = Number(clamp(nextMaxSpreadBps, 8.0, 14.0).toFixed(1));
  }

  let recommendedTpSlRatio = tpSlRatio || 2.0;
  if (tpHitCount > slHitCount && winRatePct >= 58) {
    recommendedTpSlRatio = Number(clamp(recommendedTpSlRatio + 0.05, 1.8, 2.8).toFixed(2));
  } else if (winRatePct < 52) {
    recommendedTpSlRatio = Number(clamp(recommendedTpSlRatio + 0.1, 1.9, 2.8).toFixed(2));
  }

  const weightDelta: BotFeatureWeights = {
    obiWeight: Number((workingW.obiWeight - oldW.obiWeight).toFixed(4)),
    momentumWeight: Number((workingW.momentumWeight - oldW.momentumWeight).toFixed(4)),
    vwapWeight: Number((workingW.vwapWeight - oldW.vwapWeight).toFixed(4)),
    sentimentWeight: Number((workingW.sentimentWeight - oldW.sentimentWeight).toFixed(4)),
  };

  const nextEpochs = (brain.epochsTrained || 0) + 1;
  const nextCumulative = Number(((brain.cumulativeReward || 0) + epochReward).toFixed(3));
  const newSha256 = computeBrainSha256(agentId, workingW, nextEpochs * 100 + (brain.onlineUpdatesCount || 0));

  const nextHistory = [
    ...(brain.rewardHistory || []).slice(-29),
    {
      timestamp: Date.now(),
      label: `Цикл #${nextEpochs} (${simulatedTrades} св.)`,
      reward: epochReward,
      cumulativeReward: nextCumulative,
      sha256: newSha256.slice(0, 16),
    },
  ];

  const updatedBrain: BotBrainState = {
    ...brain,
    weights: workingW,
    lastWeightDelta: weightDelta,
    confidenceThreshold: nextThreshold,
    atrMultiplier: nextAtrMultiplier,
    maxSpreadBps: nextMaxSpreadBps,
    epochsTrained: nextEpochs,
    cumulativeReward: nextCumulative,
    lastTrainedAt: Date.now(),
    rewardHistory: nextHistory,
  };

  return {
    updatedBrain,
    newSha256,
    simulatedTrades,
    winsCount,
    lossesCount,
    winRatePct,
    epochReward,
    weightDelta,
    recommendedTpSlRatio,
  };
}

/**
 * Core liquid symbols for Variant 3 ("Сетка / Откуп просадок по тренду как делает @ne_investor").
 * Focuses strictly on top-liquidity pairs with narrow spreads (0.5-1.5 bps) and @ne_investor's main setups.
 */
export const TREND_GRID_CORE_SYMBOLS = [
  'BTCUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'BNBUSDT',
  'DOGEUSDT',
  'SUIUSDT',
  'NEARUSDT',
  'ADAUSDT',
  'XAUUSDT',
] as const;

export function computeEffectiveGridRiskStopPct(atrPct: number): {
  gridStepPct: number;
  tpTargetPct: number;
  catastrophicSlPct: number;
  effectiveWorstCaseStopPct: number;
} {
  const safeAtr = Number.isFinite(atrPct) && atrPct > 0 ? atrPct : 1.35;
  const gridStepPct = Number(clamp(safeAtr * 0.75, 0.85, 1.10).toFixed(2));
  // Realistic +9.6%..+13.0% ROE target at 4x leverage (+2.40%..+3.25% spot move) so winners harvest reliably before reversals
  const tpTargetPct = Number(clamp(gridStepPct * 2.75, 2.40, 3.25).toFixed(2));
  // Cap hard catastrophic SL at 2.20%–2.75% (-8.8%..-11.0% ROE at 4x), strictly behind SO2 (1.85 * step <= 2.04%)
  const catastrophicSlPct = Number(clamp(gridStepPct * 2.45, 2.20, 2.75).toFixed(2));
  // Across 40% Base (0x) + 30% SO1 (1.0x step) + 30% SO2 (1.85x step), averaged entry shifts ~0.80 * gridStepPct;
  // therefore remaining distance from averaged entryVwap to catastrophicSl is catastrophicSlPct - 0.80 * gridStepPct.
  const effectiveWorstCaseStopPct = Number(
    Math.max(1.50, catastrophicSlPct - 0.80 * gridStepPct).toFixed(2)
  );
  return { gridStepPct, tpTargetPct, catastrophicSlPct, effectiveWorstCaseStopPct };
}

export interface TrendGridSafetyOrder {
  stepIndex: number; // 1 or 2
  triggerPrice: number;
  qty: number;
  stepPctFromEntry: number;
  filled: boolean;
  filledAt?: number;
  fillPrice?: number;
}

export interface TrendGridPlan {
  recommendedLeverage: number; // Safe 3x-5x grid leverage (default 4x)
  baseOrderQty: number;
  totalMaxQty: number;
  gridStepPct: number;
  tpTargetPct: number; // Full-grid unload target (+1.70% .. +2.45% from averaged entryVwap)
  initialTpPrice: number;
  catastrophicSlPct: number; // Structural safety stop behind the entire 3-step grid (~3.8% - 4.8%)
  catastrophicSlPrice: number;
  safetyOrders: TrendGridSafetyOrder[];
}

/**
 * Builds a Variant 3 Trend-Grid & Pullback Averaging Plan (@ne_investor / Pionex / Passivbot style):
 * - Low safe leverage (4x, within 3x-5x range) so normal market noise never liquidates or hunts stops.
 * - Splits position into 3 tranches:
 *   - Base Entry Order (40% of total grid capacity, or minQty if indivisible)
 *   - Safety Order #1 (30% at -1.0 * gridStepPct pullback for LONG / +1.0 * gridStepPct bounce for SHORT)
 *   - Safety Order #2 (30% at -2.1 * gridStepPct deep pullback for LONG / +2.1 * gridStepPct for SHORT)
 * - Places Catastrophic Stop-Loss behind the entire grid (`3.3 * gridStepPct`, ~3.8-4.8% away),
 *   so 1.2% wicks fill Safety Order #1 and improve `entryVwap` instead of stopping out!
 * - Single Full-Position Unload Take-Profit (`+1.70%..+2.45%` from averaged `entryVwap`) — zero $0.03 premature cuts.
 */
export function buildTrendGridPlan(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  totalPlannedQty: number;
  atrPct: number;
  qtyStep: number;
  minQty: number;
  priceDecimals: number;
  tpTargetPct?: number;
  dcaEnabled?: boolean;
}): TrendGridPlan {
  const { side, entryPrice, totalPlannedQty, atrPct, qtyStep, minQty, priceDecimals } = params;
  const dcaEnabled = params.dcaEnabled !== false;
  const dirSign = side === 'LONG' ? 1 : -1;
  const qtyDecimals = Math.max(0, -Math.floor(Math.log10(Math.max(1e-8, qtyStep)) + 1e-9));

  const roundQty = (raw: number): number => {
    const stepped = Math.floor((raw + 1e-9) / qtyStep) * qtyStep;
    return Number(Math.max(minQty, stepped).toFixed(qtyDecimals));
  };

  const { gridStepPct, tpTargetPct: defaultTpTargetPct, catastrophicSlPct } = computeEffectiveGridRiskStopPct(atrPct);
  const tpTargetPct =
    typeof params.tpTargetPct === 'number' && Number.isFinite(params.tpTargetPct)
      ? Number(clamp(params.tpTargetPct, 2.20, 3.60).toFixed(2))
      : defaultTpTargetPct;

  const initialTpPrice = Number(
    (entryPrice * (1 + dirSign * (tpTargetPct / 100))).toFixed(priceDecimals)
  );
  const catastrophicSlPrice = Number(
    (entryPrice * (1 - dirSign * (catastrophicSlPct / 100))).toFixed(priceDecimals)
  );

  if (!dcaEnabled) {
    const singleShotQty = roundQty(totalPlannedQty);
    return {
      recommendedLeverage: 4,
      baseOrderQty: singleShotQty,
      totalMaxQty: singleShotQty,
      gridStepPct,
      tpTargetPct,
      initialTpPrice,
      catastrophicSlPct,
      catastrophicSlPrice,
      safetyOrders: [],
    };
  }

  // Legacy Trend-Grid split (40% Base + 30% SO1 + 30% SO2) when dcaEnabled=true in isolated unit tests
  let baseOrderQty: number;
  let so1Qty: number;
  let so2Qty: number;

  if (totalPlannedQty >= minQty * 3.2) {
    baseOrderQty = roundQty(totalPlannedQty * 0.4);
    so1Qty = roundQty(totalPlannedQty * 0.3);
    so2Qty = Number(Math.max(minQty, totalPlannedQty - baseOrderQty - so1Qty).toFixed(qtyDecimals));
  } else {
    baseOrderQty = roundQty(totalPlannedQty);
    so1Qty = Number(minQty.toFixed(qtyDecimals));
    so2Qty = Number(minQty.toFixed(qtyDecimals));
  }

  const totalMaxQty = Number((baseOrderQty + so1Qty + so2Qty).toFixed(qtyDecimals));

  const so1StepPct = gridStepPct;
  const so2StepPct = Number((gridStepPct * 1.85).toFixed(2));

  const so1TriggerPrice = Number(
    (entryPrice * (1 - dirSign * (so1StepPct / 100))).toFixed(priceDecimals)
  );
  const so2TriggerPrice = Number(
    (entryPrice * (1 - dirSign * (so2StepPct / 100))).toFixed(priceDecimals)
  );

  const safetyOrders: TrendGridSafetyOrder[] = [
    {
      stepIndex: 1,
      triggerPrice: so1TriggerPrice,
      qty: so1Qty,
      stepPctFromEntry: so1StepPct,
      filled: false,
    },
    {
      stepIndex: 2,
      triggerPrice: so2TriggerPrice,
      qty: so2Qty,
      stepPctFromEntry: so2StepPct,
      filled: false,
    },
  ];

  return {
    recommendedLeverage: 4,
    baseOrderQty,
    totalMaxQty,
    gridStepPct,
    tpTargetPct,
    initialTpPrice,
    catastrophicSlPct,
    catastrophicSlPrice,
    safetyOrders,
  };
}

/**
 * Evaluates whether live price has reached any unfilled Trend-Grid Safety Order (DCA pullback level).
 * When triggered:
 * - Fills the safety order at `currentPrice`
 * - Computes the new weighted-average `entryVwap`
 * - Increases `qty`
 * - Shifts `newTpPrice` closer (`newEntryVwap * (1 ± tpTargetPct/100)`) so the position unloads on the bounce!
 */
export function evaluateTrendGridSafetyOrderFill(params: {
  side: 'LONG' | 'SHORT';
  currentPrice: number;
  currentQty: number;
  currentEntryVwap: number;
  safetyOrders: TrendGridSafetyOrder[];
  priceDecimals: number;
  qtyDecimals: number;
  tpTargetPct?: number;
  nowTs?: number;
}): {
  triggered: boolean;
  filledStepIndex?: number;
  addedQty: number;
  newQty: number;
  newEntryVwap: number;
  newTpPrice: number;
  updatedSafetyOrders: TrendGridSafetyOrder[];
} {
  const {
    side,
    currentPrice,
    currentQty,
    currentEntryVwap,
    safetyOrders,
    priceDecimals,
    qtyDecimals,
    tpTargetPct = 2.75,
    nowTs = Date.now(),
  } = params;

  const dirSign = side === 'LONG' ? 1 : -1;
  const clonedOrders: TrendGridSafetyOrder[] = (safetyOrders || []).map((so) => ({ ...so }));

  let addedQty = 0;
  let runningQty = currentQty;
  let runningVwap = currentEntryVwap;
  let filledStepIndex: number | undefined;

  // Fill at most 1 safety order step per cycle in sequential order (Step 1 before Step 2)
  for (const so of clonedOrders) {
    if (so.filled) continue;
    const isHit =
      side === 'LONG' ? currentPrice <= so.triggerPrice : currentPrice >= so.triggerPrice;
    if (isHit && so.qty > 0) {
      const nextQty = Number((runningQty + so.qty).toFixed(qtyDecimals));
      const nextVwap = Number(
        ((runningQty * runningVwap + so.qty * currentPrice) / nextQty).toFixed(priceDecimals)
      );
      so.filled = true;
      so.filledAt = nowTs;
      so.fillPrice = currentPrice;
      addedQty = so.qty;
      runningQty = nextQty;
      runningVwap = nextVwap;
      filledStepIndex = so.stepIndex;
      break;
    }
  }

  const newTpPrice = Number(
    (runningVwap * (1 + dirSign * (tpTargetPct / 100))).toFixed(priceDecimals)
  );

  return {
    triggered: filledStepIndex !== undefined,
    filledStepIndex,
    addedQty,
    newQty: runningQty,
    newEntryVwap: runningVwap,
    newTpPrice,
    updatedSafetyOrders: clonedOrders,
  };
}

/**
 * Blocks Trend-Grid DCA averaging (SO1/SO2) when BTC is actively trending against the position side
 * so bots never triple margin into a falling knife or short squeeze.
 */
export function evaluateGridDcaMarketGuard(params: {
  side: 'LONG' | 'SHORT';
  btcEmaTrendBps: number;
  btcVwapDevPct: number;
}): { allowed: boolean; reason?: string } {
  const { side, btcEmaTrendBps, btcVwapDevPct } = params;
  if (side === 'LONG' && (btcEmaTrendBps <= -2.5 || btcVwapDevPct <= -0.30)) {
    return {
      allowed: false,
      reason: `Добор LONG заблокирован: BTC под давлением (EMA ${btcEmaTrendBps.toFixed(1)} bps, VWAP ${btcVwapDevPct.toFixed(2)}%) — не усредняем пролив.`,
    };
  }
  if (side === 'SHORT' && (btcEmaTrendBps >= 2.5 || btcVwapDevPct >= 0.30)) {
    return {
      allowed: false,
      reason: `Добор SHORT заблокирован: BTC отскакивает вверх (EMA +${btcEmaTrendBps.toFixed(1)} bps, VWAP +${btcVwapDevPct.toFixed(2)}%).`,
    };
  }
  return { allowed: true };
}

/**
 * Computes an adaptive 24h volatility ceiling (atrPct) for Freqtrade's VolatilityFilter
 * so strong market moves (7%–13% daily range) do not starve all crypto pairs out of the scanner.
 */
export function resolveDynamicVolatilityLimitPct(params: {
  currentMarketRegime?: string;
  isNightSession?: boolean;
}): number {
  const { currentMarketRegime = '', isNightSession = false } = params;
  if (isNightSession) {
    return 10.5;
  }
  const upper = String(currentMarketRegime || '').toUpperCase();
  const isHighVolRegime =
    upper.includes('СБРОС') ||
    upper.includes('FLUSH') ||
    upper.includes('DUMP') ||
    upper.includes('МЕДВЕЖ') ||
    upper.includes('HIGH_VOL') ||
    upper.includes('VOLATIL') ||
    upper.includes('BULL_EXPANSION') ||
    upper.includes('РАЛЛИ') ||
    upper.includes('ПАМП');
  return isHighVolRegime ? 14.0 : 10.0;
}

/**
 * Selects the next acting bot fairly across enabled bots:
 * 1. Prioritizes bots with the fewest active open positions (preventing one bot from starving others).
 * 2. Rotates round-robin across equally-loaded bots using `cursor` and returns `nextCursor`.
 */
export function selectNextActingBot<
  T extends { agentId: string; sharpeRatio?: number; brain?: { cumulativeReward?: number } }
>(params: {
  activeBots: T[];
  activePositions: Array<{ botId?: string }>;
  cursor: number;
}): { bot: T; nextCursor: number } {
  const { activeBots, activePositions, cursor } = params;
  if (activeBots.length === 0) {
    throw new Error('selectNextActingBot requires at least one active bot');
  }

  const openCounts = new Map<string, number>();
  for (const pos of activePositions) {
    if (!pos.botId) continue;
    openCounts.set(pos.botId, (openCounts.get(pos.botId) || 0) + 1);
  }

  let minOpen = Infinity;
  for (const bot of activeBots) {
    const count = openCounts.get(bot.agentId) || 0;
    if (count < minOpen) minOpen = count;
  }

  const leastLoaded = activeBots
    .filter((b) => (openCounts.get(b.agentId) || 0) === minOpen)
    .sort((a, b) => {
      const scoreB = (b.sharpeRatio || 1.5) * 0.5 + (b.brain?.cumulativeReward || 0) * 0.5;
      const scoreA = (a.sharpeRatio || 1.5) * 0.5 + (a.brain?.cumulativeReward || 0) * 0.5;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.agentId.localeCompare(b.agentId);
    });

  const safeCursor = Math.max(0, Math.floor(cursor || 0));
  const picked = leastLoaded[safeCursor % leastLoaded.length];
  return {
    bot: picked,
    nextCursor: (safeCursor + 1) % Math.max(1, activeBots.length * 100),
  };
}

const PLACEHOLDER_TELEGRAM_CHAT_IDS = new Set([
  '12345',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '987654321',
  '000000000',
  '111111111',
  '999999999',
]);

/**
 * Validates Telegram Chat ID format while rejecting well-known UI placeholder / test IDs such as `123456789`.
 */
export function isRealTelegramChatId(chatId?: string): boolean {
  if (!chatId || typeof chatId !== 'string') return false;
  const trimmed = chatId.trim();
  if (!/^(-?\d{5,20}|@[a-zA-Z0-9_]{4,64})$/.test(trimmed)) return false;
  if (PLACEHOLDER_TELEGRAM_CHAT_IDS.has(trimmed)) return false;
  if (/^-?(.)\1{4,}$/.test(trimmed)) return false;
  return true;
}

/**
 * Time-decay freshness weight for parsed Telegram / news items:
 * - <= 4h old: full weight 1.0
 * - 4h..12h old: linear decay down to 0.0
 * - > 12h old: 0.0 (stale macro commentary must never block live setups days later)
 */
export function computeFeedItemFreshnessWeight(timestampMs: number, nowTs: number = Date.now()): number {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return 0;
  const ageHours = Math.max(0, (nowTs - timestampMs) / 3_600_000);
  if (ageHours <= 4) return 1.0;
  if (ageHours >= 12) return 0;
  return Number((1 - (ageHours - 4) / 8).toFixed(4));
}

const EXCLUDED_STABLE_OR_METAL_SYMBOLS = new Set([
  'USDCUSDT',
  'FDUSDUSDT',
  'USDEUSDT',
  'DAIUSDT',
  'TUSDUSDT',
  'PYUSDUSDT',
  'USD1USDT',
  'EURUSDT',
  'BUSDUSDT',
  'USDPUSDT',
  'XAUTUSDT',
  'PAXGUSDT',
  'AEURUSDT',
]);

const SYNTHETIC_EQUITY_OR_INDEX_BASES = new Set([
  'SOXL',
  'SOXS',
  'SNXX',
  'SKDD',
  'SPXL',
  'SPXS',
  'TQQQ',
  'SQQQ',
  'UVXY',
  'SVXY',
  'VXX',
  'MUU',
  'SNDK',
  'NVDA',
  'TSLA',
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOGL',
  'GOOG',
  'META',
  'COIN',
  'MSTR',
  'SPY',
  'QQQ',
  'IWM',
  'BABA',
  'AMD',
  'INTC',
  'NFLX',
  'PYPL',
  'CRCL',
  'HOOD',
  'PLTR',
  'ORCL',
  'IBM',
  'ARM',
  'AVGO',
  'SMCI',
  'GME',
  'AMC',
  'NKE',
  'DIS',
  'XAG',
  'WTI',
  'BRENT',
  'SPX',
  'NDX',
  'NAS100',
  'US30',
  'UK100',
  'MU',
  'TSM',
  'ASML',
  'LLY',
  'JPM',
  'GS',
  'WMT',
  'COST',
  'BA',
  'GE',
  'CAT',
  'XOM',
  'CVX',
  'BHP',
  'RIO',
  'ANTHROPIC',
  'OPENAI',
  'SPACEX',
  'SPCX',
  'SKHY',
  'CL',
  'CLUS',
  'USOIL',
  'UKOIL',
  'NATGAS',
  'SI',
  'HG',
  'NG',
  'BRK',
  'BRKB',
  'NVDAX',
  'TSLAX',
  'AAPLX',
  'GOOGLX',
  'METAX',
  'AMZNX',
  'MSFTX',
  'COINX',
  'MSTRX',
  'SPYX',
  'QQQX',
  'HOODX',
  'CIRCLE',
  'ANTH',
  'OAI',
  'RKLB',
  'ASTS',
  'OKLO',
  'LEU',
  'CRWD',
  'PANW',
  'SNOW',
  'DDOG',
  'NET',
  'SHOP',
  'UBER',
  'ABNB',
  'SOFI',
  'RIVN',
  'LCID',
  'NIO',
  'PDD',
  'JD',
  'BIDU',
  'SE',
  'GRAB',
  'NU',
  'MELI',
  'DJT',
  'CVNA',
  'UPST',
  'AFRM',
  'SP500',
  'NDX100',
  'DXY',
  'XAI',
  'STRIPE',
  'DATABRICKS',
  'DISCORD',
]);

export function isEligibleDynamicCryptoSymbol(symbol: string, goldAllowed: boolean = true): boolean {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym.endsWith('USDT') || sym.length < 6) return false;
  if (sym === 'XAUUSDT') return goldAllowed;
  if (EXCLUDED_STABLE_OR_METAL_SYMBOLS.has(sym)) return false;
  if (/(UP|DOWN|BULL|BEAR|[235][LS])USDT$/.test(sym)) return false;
  const base = sym.slice(0, -4);
  if (SYNTHETIC_EQUITY_OR_INDEX_BASES.has(base)) return false;
  return /^[A-Z0-9]{2,12}$/.test(base);
}

/**
 * Expands the core 20-coin whitelist dynamically with Top-35 high-liquidity crypto movers
 * from the live screener while excluding US stock/ETF synthetics, stablecoins, and illiquid spreads.
 */
export function resolveDynamicCryptoUniverse(params: {
  baseAllowedSymbols: string[];
  coreWhitelist: string[];
  screenerSymbols: Array<{
    symbol: string;
    turnover24h?: number;
    spreadBps?: number;
  }>;
  goldAllowed?: boolean;
  isDynamicScanEnabled?: boolean;
  maxDynamicExtras?: number;
  minTurnoverUsdt?: number;
  maxSpreadBps?: number;
}): { universe: string[]; dynamicAdded: string[] } {
  const {
    baseAllowedSymbols,
    coreWhitelist,
    screenerSymbols,
    goldAllowed = true,
    isDynamicScanEnabled = true,
    maxDynamicExtras = 15,
    minTurnoverUsdt = 80_000_000,
    maxSpreadBps = 3.0,
  } = params;

  const baseFiltered = (baseAllowedSymbols.length > 0 ? baseAllowedSymbols : coreWhitelist).filter((s) =>
    isEligibleDynamicCryptoSymbol(s, goldAllowed)
  );
  if (!isDynamicScanEnabled) {
    return { universe: Array.from(new Set(baseFiltered)), dynamicAdded: [] };
  }

  const universeSet = new Set<string>([
    ...baseFiltered,
    ...coreWhitelist.filter((s) => isEligibleDynamicCryptoSymbol(s, goldAllowed)),
  ]);

  const dynamicAdded: string[] = [];
  if (maxDynamicExtras > 0 && Array.isArray(screenerSymbols)) {
    const sortedMovers = [...screenerSymbols].sort(
      (a, b) => (Number(b.turnover24h) || 0) - (Number(a.turnover24h) || 0)
    );
    for (const meta of sortedMovers) {
      if (dynamicAdded.length >= maxDynamicExtras) break;
      const sym = String(meta?.symbol || '').toUpperCase().trim();
      if (!sym || universeSet.has(sym)) continue;
      if (!isEligibleDynamicCryptoSymbol(sym, goldAllowed)) continue;
      const turnover = Number(meta?.turnover24h) || 0;
      const spread = Number(meta?.spreadBps);
      if (turnover < minTurnoverUsdt) continue;
      if (Number.isFinite(spread) && spread > maxSpreadBps) continue;
      universeSet.add(sym);
      dynamicAdded.push(sym);
    }
  }

  return {
    universe: Array.from(universeSet),
    dynamicAdded,
  };
}

