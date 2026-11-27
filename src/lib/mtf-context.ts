import type { KlineBar } from './bot-learning-math.ts';

export type MtfTimeframeKey = '1D' | '4H' | '1H' | '15m' | '5m' | '1m';
export type MtfTrendBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MtfTimeframeState {
  tf: MtfTimeframeKey;
  trend: MtfTrendBias;
  emaSlopeBps: number;
  rsi14: number;
  atrPct: number;
  barsCount: number;
  lastClosedBarTs: number;
  isClosedConfirmed: boolean;
  isFresh: boolean;
}

export interface MtfContextSnapshot {
  symbol: string;
  timestamp: number;
  timeframes: Record<MtfTimeframeKey, MtfTimeframeState>;
  globalMacroBias: MtfTrendBias;
  primaryTrend4h: MtfTrendBias;
  structure1h: MtfTrendBias;
  setup15m: MtfTrendBias;
  confirm5m: MtfTrendBias;
  micro1m: MtfTrendBias;
  alignmentScore: number; // -1.0 .. +1.0
  dataSufficiencyOk: boolean;
  allowCounterTrendMeanReversion: boolean;
  rejectReason?: string;
}

const TF_MAX_STALE_MS: Record<MtfTimeframeKey, number> = {
  '1m': 5 * 60 * 1000,
  '5m': 20 * 60 * 1000,
  '15m': 45 * 60 * 1000,
  '1H': 3 * 60 * 60 * 1000,
  '4H': 12 * 60 * 60 * 1000,
  '1D': 48 * 60 * 60 * 1000,
};

const TF_INTERVAL_MS: Record<MtfTimeframeKey, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1H': 60 * 60 * 1000,
  '4H': 4 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
};

function computeClosedEmaSlopeAndRsi(bars: KlineBar[]): {
  emaSlopeBps: number;
  rsi14: number;
  atrPct: number;
  trend: MtfTrendBias;
} {
  if (bars.length < 5) {
    return { emaSlopeBps: 0, rsi14: 50, atrPct: 0, trend: 'NEUTRAL' };
  }

  const closes = bars.map((b) => b.close);
  let emaFast = closes[0];
  let emaSlow = closes[0];
  const kFast = 2 / (9 + 1);
  const kSlow = 2 / (21 + 1);

  for (const c of closes) {
    emaFast = c * kFast + emaFast * (1 - kFast);
    emaSlow = c * kSlow + emaSlow * (1 - kSlow);
  }

  const emaSlopeBps = emaSlow > 0 ? Number((((emaFast - emaSlow) / emaSlow) * 10000).toFixed(2)) : 0;

  let gains = 0;
  let losses = 0;
  const rsiLookback = Math.min(14, closes.length - 1);
  for (let i = closes.length - rsiLookback; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = losses === 0 ? (gains > 0 ? 100 : 1) : gains / losses;
  const rsi14 = Number((100 - 100 / (1 + rs)).toFixed(1));

  const atrSlice = bars.slice(-Math.min(14, bars.length));
  const lastClose = closes[closes.length - 1] || 1;
  const avgRange = atrSlice.reduce((acc, b) => acc + Math.max(0, b.high - b.low), 0) / Math.max(1, atrSlice.length);
  const atrPct = Number(((avgRange / lastClose) * 100).toFixed(2));

  const trend: MtfTrendBias =
    emaSlopeBps >= 6 ? 'BULLISH' : emaSlopeBps <= -6 ? 'BEARISH' : 'NEUTRAL';

  return { emaSlopeBps, rsi14, atrPct, trend };
}

function areTimestampsMonotonic(bars: KlineBar[]): boolean {
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].timestamp <= bars[i - 1].timestamp) return false;
  }
  return true;
}

export function evaluateTimeframeBars(params: {
  tf: MtfTimeframeKey;
  bars: KlineBar[];
  nowTs: number;
  minBars?: number;
}): MtfTimeframeState {
  const minBars = params.minBars ?? 14;
  const sorted = [...(params.bars || [])].sort((a, b) => a.timestamp - b.timestamp);

  // Drop last bar if its interval has not finished closing relative to nowTs
  const intervalMs = TF_INTERVAL_MS[params.tf];
  const closedBars = sorted.filter((b) => b.timestamp + intervalMs <= params.nowTs);

  if (closedBars.length < minBars || !areTimestampsMonotonic(closedBars)) {
    const fallbackTs = closedBars[closedBars.length - 1]?.timestamp || 0;
    return {
      tf: params.tf,
      trend: 'NEUTRAL',
      emaSlopeBps: 0,
      rsi14: 50,
      atrPct: 0,
      barsCount: closedBars.length,
      lastClosedBarTs: fallbackTs,
      isClosedConfirmed: false,
      isFresh: false,
    };
  }

  const lastClosedBarTs = closedBars[closedBars.length - 1].timestamp;
  const ageMs = Math.max(0, params.nowTs - (lastClosedBarTs + intervalMs));
  const isFresh = ageMs <= TF_MAX_STALE_MS[params.tf];
  const metrics = computeClosedEmaSlopeAndRsi(closedBars);

  return {
    tf: params.tf,
    trend: metrics.trend,
    emaSlopeBps: metrics.emaSlopeBps,
    rsi14: metrics.rsi14,
    atrPct: metrics.atrPct,
    barsCount: closedBars.length,
    lastClosedBarTs,
    isClosedConfirmed: true,
    isFresh,
  };
}

export function aggregateBarsToTimeframe(bars1m: KlineBar[], factorMinutes: number): KlineBar[] {
  if (!Array.isArray(bars1m) || bars1m.length === 0) return [];
  const intervalMs = factorMinutes * 60 * 1000;
  const buckets = new Map<number, KlineBar>();

  for (const bar of [...bars1m].sort((a, b) => a.timestamp - b.timestamp)) {
    const bucketTs = Math.floor(bar.timestamp / intervalMs) * intervalMs;
    const prev = buckets.get(bucketTs);
    if (!prev) {
      buckets.set(bucketTs, {
        timestamp: bucketTs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        turnover: Number.isFinite(bar.turnover) ? bar.turnover : bar.volume * bar.close,
      });
    } else {
      prev.high = Math.max(prev.high, bar.high);
      prev.low = Math.min(prev.low, bar.low);
      prev.close = bar.close;
      prev.volume += bar.volume;
      prev.turnover += Number.isFinite(bar.turnover) ? bar.turnover : bar.volume * bar.close;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function buildMtfContextSnapshot(params: {
  symbol: string;
  barsByTf: Partial<Record<MtfTimeframeKey, KlineBar[]>>;
  nowTs?: number;
}): MtfContextSnapshot {
  const nowTs = params.nowTs ?? Date.now();
  const s1m = evaluateTimeframeBars({ tf: '1m', bars: params.barsByTf['1m'] || [], nowTs, minBars: 15 });
  const s5m = evaluateTimeframeBars({ tf: '5m', bars: params.barsByTf['5m'] || [], nowTs, minBars: 14 });
  const s15m = evaluateTimeframeBars({ tf: '15m', bars: params.barsByTf['15m'] || [], nowTs, minBars: 12 });
  const s1h = evaluateTimeframeBars({ tf: '1H', bars: params.barsByTf['1H'] || [], nowTs, minBars: 10 });
  const s4h = evaluateTimeframeBars({ tf: '4H', bars: params.barsByTf['4H'] || [], nowTs, minBars: 6 });
  const s1d = evaluateTimeframeBars({ tf: '1D', bars: params.barsByTf['1D'] || [], nowTs, minBars: 4 });

  const timeframes: Record<MtfTimeframeKey, MtfTimeframeState> = {
    '1D': s1d,
    '4H': s4h,
    '1H': s1h,
    '15m': s15m,
    '5m': s5m,
    '1m': s1m,
  };

  const executionTfsValid = s15m.isClosedConfirmed && s15m.isFresh && s5m.isClosedConfirmed && s5m.isFresh;
  const rejectReason = !executionTfsValid
    ? 'INSUFFICIENT_OR_STALE_CLOSED_MTF_BARS'
    : undefined;

  const weightMap: Record<MtfTimeframeKey, number> = {
    '1D': 0.25,
    '4H': 0.25,
    '1H': 0.2,
    '15m': 0.15,
    '5m': 0.1,
    '1m': 0.05,
  };

  let score = 0;
  for (const tf of Object.keys(timeframes) as MtfTimeframeKey[]) {
    const st = timeframes[tf];
    if (!st.isClosedConfirmed) continue;
    const sign = st.trend === 'BULLISH' ? 1 : st.trend === 'BEARISH' ? -1 : 0;
    score += sign * weightMap[tf];
  }

  const extremeFlushOrPump =
    s1d.trend !== 'NEUTRAL' &&
    s1d.trend === s4h.trend &&
    Math.abs(s4h.emaSlopeBps) > 45;

  return {
    symbol: params.symbol,
    timestamp: nowTs,
    timeframes,
    globalMacroBias: s1d.trend,
    primaryTrend4h: s4h.trend,
    structure1h: s1h.trend,
    setup15m: s15m.trend,
    confirm5m: s5m.trend,
    micro1m: s1m.trend,
    alignmentScore: Number(score.toFixed(3)),
    dataSufficiencyOk: executionTfsValid,
    allowCounterTrendMeanReversion: !extremeFlushOrPump,
    rejectReason,
  };
}

export function canStrategyTradeUnderMtf(params: {
  mtf: MtfContextSnapshot;
  side: 'LONG' | 'SHORT';
  isMeanReversionStrategy: boolean;
}): { allowed: boolean; reason?: string } {
  if (!params.mtf.dataSufficiencyOk) {
    return { allowed: false, reason: params.mtf.rejectReason || 'MTF_DATA_INSUFFICIENT' };
  }

  if (params.isMeanReversionStrategy) {
    if (!params.mtf.allowCounterTrendMeanReversion) {
      return {
        allowed: false,
        reason: 'MTF_EXTREME_TREND_BLOCKS_MEAN_REVERSION',
      };
    }
    return { allowed: true };
  }

  const alignedWith4h =
    params.mtf.primaryTrend4h === 'NEUTRAL' ||
    (params.side === 'LONG' && params.mtf.primaryTrend4h === 'BULLISH') ||
    (params.side === 'SHORT' && params.mtf.primaryTrend4h === 'BEARISH');

  const alignedWith1h =
    params.mtf.structure1h === 'NEUTRAL' ||
    (params.side === 'LONG' && params.mtf.structure1h === 'BULLISH') ||
    (params.side === 'SHORT' && params.mtf.structure1h === 'BEARISH');

  if (!alignedWith4h && !alignedWith1h) {
    return {
      allowed: false,
      reason: `MTF_TREND_CONFLICT:4H=${params.mtf.primaryTrend4h},1H=${params.mtf.structure1h},req=${params.side}`,
    };
  }

  return { allowed: true };
}
