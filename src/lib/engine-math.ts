/**
 * ZimaTrade AI - Core Math Engine & Procedural Risk Firewall
 * Strict implementation of matching, slippage, queue, TP collapse, and risk rules.
 */

export interface OrderbookLevel {
  price: number;
  qty: number;
}

export interface OrderbookL2 {
  bids: OrderbookLevel[]; // sorted descending by price
  asks: OrderbookLevel[]; // sorted ascending by price
  timestamp: number;
  seqId: number;
}

export interface InstrumentRules {
  exchange: string;
  symbol: string;
  tickSize: number;
  qtyStep: number;
  minQty: number;
  minNotional: number; // e.g. 5.0 USDT
  maxLeverage: number; // e.g. 10
}

export interface PositionRiskParams {
  capital: number; // e.g. 10,000 USDT
  entryPrice: number;
  stopLossPrice: number;
  side: 'LONG' | 'SHORT';
  requestedLeverage: number;
  instrument: InstrumentRules;
  riskPctLimit?: number; // default 0.015 (1.5%)
}

export interface CalculatedOrderSize {
  allowed: boolean;
  rejectReason?: string;
  qty: number;
  notional: number;
  maxLossUsdt: number;
  effectiveLeverage: number;
  marginRequired: number;
}

/**
 * 1. Calculate order size strictly adhering to the 1.5% max risk rule
 */
export function calculateRiskFirewallOrderSize(params: PositionRiskParams): CalculatedOrderSize {
  const { capital, entryPrice, stopLossPrice, side, requestedLeverage, instrument, riskPctLimit = 0.015 } = params;

  if (side === 'LONG' && stopLossPrice >= entryPrice) {
    return {
      allowed: false,
      rejectReason: 'LONG Stop Loss must be strictly below Entry Price',
      qty: 0,
      notional: 0,
      maxLossUsdt: 0,
      effectiveLeverage: 1,
      marginRequired: 0,
    };
  }

  if (side === 'SHORT' && stopLossPrice <= entryPrice) {
    return {
      allowed: false,
      rejectReason: 'SHORT Stop Loss must be strictly above Entry Price',
      qty: 0,
      notional: 0,
      maxLossUsdt: 0,
      effectiveLeverage: 1,
      marginRequired: 0,
    };
  }

  const maxLossUsdt = capital * riskPctLimit;
  const slDistance = Math.abs(entryPrice - stopLossPrice);
  if (slDistance <= 0) {
    return {
      allowed: false,
      rejectReason: 'Stop loss distance cannot be zero',
      qty: 0,
      notional: 0,
      maxLossUsdt: 0,
      effectiveLeverage: 1,
      marginRequired: 0,
    };
  }

  const effectiveLeverage = Math.min(requestedLeverage, instrument.maxLeverage, 20);
  // Include round-trip Bybit Taker fee (2 * 0.055% = 0.11%) in per-unit risk so net loss at SL never breaches maxLossUsdt
  const roundTripFeePerUnit = entryPrice * 0.0011;
  const effectiveSlDistance = slDistance + roundTripFeePerUnit;

  // Max quantity based on risk limit at SL hit (including fees) AND max 35% account margin per single position
  const riskBasedQty = maxLossUsdt / effectiveSlDistance;
  const maxMarginUsdt = capital * 0.35;
  const marginBasedQty = (maxMarginUsdt * effectiveLeverage) / entryPrice;
  const rawQty = Math.min(riskBasedQty, marginBasedQty);

  // Floor to qtyStep
  const step = instrument.qtyStep;
  const precision = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const steppedQty = Number((Math.floor(rawQty / step) * step).toFixed(precision));

  if (steppedQty < instrument.minQty) {
    return {
      allowed: false,
      rejectReason: `Calculated qty ${steppedQty} is below instrument minQty ${instrument.minQty}`,
      qty: 0,
      notional: 0,
      maxLossUsdt: 0,
      effectiveLeverage: 1,
      marginRequired: 0,
    };
  }

  const notional = steppedQty * entryPrice;
  if (notional < instrument.minNotional) {
    return {
      allowed: false,
      rejectReason: `Calculated notional ${notional.toFixed(2)} is below minNotional ${instrument.minNotional}`,
      qty: 0,
      notional: 0,
      maxLossUsdt: 0,
      effectiveLeverage: 1,
      marginRequired: 0,
    };
  }

  const marginRequired = notional / effectiveLeverage;

  return {
    allowed: true,
    qty: steppedQty,
    notional,
    maxLossUsdt: Number((steppedQty * effectiveSlDistance).toFixed(2)),
    effectiveLeverage,
    marginRequired: Number(marginRequired.toFixed(2)),
  };
}

/**
 * 2. Spread Guard & Funding Guard
 */
export function checkMarketGuards(params: {
  bestBid: number;
  bestAsk: number;
  minutesToNextFunding: number;
  projectedFundingRate: number;
  side: 'LONG' | 'SHORT';
  maxSpreadPct?: number; // 0.0025 (0.25%)
  maxAdverseFundingRate?: number; // 0.0005 (0.05%)
}): { passed: boolean; reason?: string } {
  const {
    bestBid,
    bestAsk,
    minutesToNextFunding,
    projectedFundingRate,
    side,
    maxSpreadPct = 0.0025,
    maxAdverseFundingRate = 0.0005,
  } = params;

  // Spread guard
  const spreadPct = (bestAsk - bestBid) / bestBid;
  if (spreadPct > maxSpreadPct) {
    return {
      passed: false,
      reason: `Spread Guard Triggered: Spread ${(spreadPct * 100).toFixed(3)}% exceeds max ${(maxSpreadPct * 100).toFixed(2)}%`,
    };
  }

  // Funding guard: 15 min before funding if funding rate against position >= 0.05% (0.0005)
  // LONG pays funding if funding rate > 0
  // SHORT pays funding if funding rate < 0
  const isPayingFunding =
    (side === 'LONG' && projectedFundingRate >= maxAdverseFundingRate) ||
    (side === 'SHORT' && projectedFundingRate <= -maxAdverseFundingRate);

  if (minutesToNextFunding <= 15 && isPayingFunding) {
    return {
      passed: false,
      reason: `Funding Guard Triggered: ${minutesToNextFunding}m to settlement with adverse funding ${(projectedFundingRate * 100).toFixed(4)}%`,
    };
  }

  return { passed: true };
}

/**
 * 3. Daily Drawdown Kill-Switch (Max 5.0% over rolling 24h)
 */
export function evaluateDailyDrawdownKillSwitch(initialCapital: number, rollingPnLUsdt: number): {
  isKillSwitchActive: boolean;
  drawdownPct: number;
} {
  const drawdownPct = (rollingPnLUsdt / initialCapital) * 100;
  return {
    isKillSwitchActive: drawdownPct <= -5.0,
    drawdownPct,
  };
}

/**
 * 4. Virtual VWAP Slippage Simulation through L2-50 Orderbook
 */
export interface ExecutionResult {
  filled: boolean;
  executedQty: number;
  vwapPrice: number;
  slippagePct: number;
  feeUsdt: number; // Bybit Taker 0.055%
  levelsWalked: number;
  unfilledQty: number;
}

export function executeMarketOrderL2(
  orderbook: OrderbookL2,
  side: 'BUY' | 'SELL',
  targetQty: number,
  takerFeeRate = 0.00055 // 0.055%
): ExecutionResult {
  const levels = side === 'BUY' ? orderbook.asks : orderbook.bids;
  if (!levels || levels.length === 0) {
    return {
      filled: false,
      executedQty: 0,
      vwapPrice: 0,
      slippagePct: 0,
      feeUsdt: 0,
      levelsWalked: 0,
      unfilledQty: targetQty,
    };
  }

  const topPrice = levels[0].price;
  let remainingQty = targetQty;
  let totalCost = 0;
  let totalExecuted = 0;
  let levelsWalked = 0;

  for (const lvl of levels) {
    if (remainingQty <= 0) break;
    levelsWalked++;
    const take = Math.min(remainingQty, lvl.qty);
    totalCost += take * lvl.price;
    totalExecuted += take;
    remainingQty -= take;
  }

  if (totalExecuted === 0) {
    return {
      filled: false,
      executedQty: 0,
      vwapPrice: topPrice,
      slippagePct: 0,
      feeUsdt: 0,
      levelsWalked: 0,
      unfilledQty: targetQty,
    };
  }

  const vwapPrice = totalCost / totalExecuted;
  const slippagePct = Math.abs((vwapPrice - topPrice) / topPrice);
  const feeUsdt = totalCost * takerFeeRate;

  return {
    filled: remainingQty <= 1e-9,
    executedQty: totalExecuted,
    vwapPrice,
    slippagePct,
    feeUsdt,
    levelsWalked,
    unfilledQty: Math.max(0, remainingQty),
  };
}

/**
 * 5. Limit Order Queue Simulation
 */
export function checkLimitOrderFill(params: {
  side: 'BUY' | 'SELL';
  limitPrice: number;
  orderQty: number;
  queueAheadQty: number;
  currentBestAsk: number;
  currentBestBid: number;
  volumeTradedAtPriceSincePlacement: number;
}): { isFilled: boolean; reason?: string } {
  const { side, limitPrice, orderQty, queueAheadQty, currentBestAsk, currentBestBid, volumeTradedAtPriceSincePlacement } = params;

  // Condition 1: Penetrated price level
  if (side === 'BUY' && currentBestAsk < limitPrice) {
    return { isFilled: true, reason: 'Price penetrated level (BestAsk < LimitPrice)' };
  }
  if (side === 'SELL' && currentBestBid > limitPrice) {
    return { isFilled: true, reason: 'Price penetrated level (BestBid > LimitPrice)' };
  }

  // Condition 2: Queue filled by cumulative volume
  if (volumeTradedAtPriceSincePlacement >= queueAheadQty + orderQty) {
    return {
      isFilled: true,
      reason: `Queue cleared: ${volumeTradedAtPriceSincePlacement} >= ${queueAheadQty} + ${orderQty}`,
    };
  }

  return { isFilled: false };
}

/**
 * 6. Dynamic TP Collapse
 * Ensures each TP part is >= minNotional * 1.1 (~5.5 USDT) and rounded to qtyStep.
 * Collapses sub-threshold shares into larger / previous target.
 */
export interface TPGridItem {
  price: number;
  share: number; // e.g. 0.5 for 50%
}

export interface CollapsedTP {
  price: number;
  qty: number;
  notional: number;
}

export function dynamicTPCollapse(
  totalQty: number,
  tpGrid: TPGridItem[],
  instrument: InstrumentRules
): CollapsedTP[] {
  const thresholdNotional = instrument.minNotional * 1.1; // ~5.5 USDT
  const step = instrument.qtyStep;
  const precision = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

  // Ensure totalQty is a clean multiple of step
  const totalSteps = Math.round(totalQty / step);
  if (totalSteps <= 0 || tpGrid.length === 0) {
    return [];
  }

  // Allocate step units proportionally using largest remainder method
  const unrounded = tpGrid.map((tp) => tp.share * totalSteps);
  const floors = unrounded.map((u) => Math.floor(u));
  let allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = totalSteps - allocated;

  const remainders = unrounded
    .map((u, i) => ({ index: i, rem: u - floors[i] }))
    .sort((a, b) => b.rem - a.rem);

  for (let i = 0; i < remainder; i++) {
    floors[remainders[i].index]++;
  }

  // Build candidate items
  const candidateList = tpGrid.map((tp, idx) => {
    const qty = Number((floors[idx] * step).toFixed(precision));
    return {
      price: tp.price,
      qty,
      notional: qty * tp.price,
    };
  });

  const result: CollapsedTP[] = [];
  let carryOverQty = 0;

  for (let i = candidateList.length - 1; i >= 0; i--) {
    const item = candidateList[i];
    item.qty = Number((item.qty + carryOverQty).toFixed(precision));
    item.notional = item.qty * item.price;
    carryOverQty = 0;

    // If below threshold and not the first level, merge into previous level
    if (item.notional < thresholdNotional && i > 0) {
      carryOverQty = item.qty;
    } else if (item.qty > 0) {
      result.unshift(item);
    }
  }

  if (carryOverQty > 0 && result.length > 0) {
    result[0].qty = Number((result[0].qty + carryOverQty).toFixed(precision));
    result[0].notional = result[0].qty * result[0].price;
  }

  return result;
}

/**
 * 7. Stale Signal & Risk/Reward Filter
 */
export interface SignalValidation {
  valid: boolean;
  status: 'ACCEPTED' | 'STALE_SIGNAL' | 'BAD_RR' | 'INVALID_STRUCTURE';
  reason?: string;
  riskRewardRatio: number;
  pathProgressionPct: number;
}

export function validateSignalFreshness(params: {
  side: 'LONG' | 'SHORT';
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  tp1: number;
  liveBestAsk: number; // For LONG check
  liveBestBid: number; // For SHORT check
}): SignalValidation {
  const { side, entryLow, entryHigh, stopLoss, tp1, liveBestAsk, liveBestBid } = params;

  // Structural sanity
  if (side === 'LONG') {
    if (entryLow <= stopLoss || tp1 <= entryHigh) {
      return {
        valid: false,
        status: 'INVALID_STRUCTURE',
        reason: 'LONG structure error: entryLow must be > stopLoss, tp1 must be > entryHigh',
        riskRewardRatio: 0,
        pathProgressionPct: 0,
      };
    }
  } else {
    if (entryHigh >= stopLoss || tp1 >= entryLow) {
      return {
        valid: false,
        status: 'INVALID_STRUCTURE',
        reason: 'SHORT structure error: entryHigh must be < stopLoss, tp1 must be < entryLow',
        riskRewardRatio: 0,
        pathProgressionPct: 0,
      };
    }
  }

  const avgEntry = (entryLow + entryHigh) / 2;
  const reward = Math.abs(tp1 - avgEntry);
  const risk = Math.abs(avgEntry - stopLoss);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;

  if (riskRewardRatio < 1.2) {
    return {
      valid: false,
      status: 'BAD_RR',
      reason: `Risk/Reward ratio ${riskRewardRatio.toFixed(2)} is lower than minimum required 1.2`,
      riskRewardRatio,
      pathProgressionPct: 0,
    };
  }

  // Check live price against Best Ask (LONG) or Best Bid (SHORT)
  const currentLivePrice = side === 'LONG' ? liveBestAsk : liveBestBid;
  const totalPathToTP1 = Math.abs(tp1 - avgEntry);

  let pathProgressionPct = 0;
  if (side === 'LONG') {
    if (currentLivePrice > avgEntry) {
      pathProgressionPct = (currentLivePrice - avgEntry) / totalPathToTP1;
    }
  } else {
    if (currentLivePrice < avgEntry) {
      pathProgressionPct = (avgEntry - currentLivePrice) / totalPathToTP1;
    }
  }

  if (pathProgressionPct > 0.30) {
    return {
      valid: false,
      status: 'STALE_SIGNAL',
      reason: `Price already progressed ${(pathProgressionPct * 100).toFixed(1)}% towards TP1 (threshold > 30%)`,
      riskRewardRatio,
      pathProgressionPct,
    };
  }

  return {
    valid: true,
    status: 'ACCEPTED',
    riskRewardRatio,
    pathProgressionPct,
  };
}

/**
 * 8. High-Water-Mark (HWM) Dynamic ATR Trailing Stop & Fee-Safe Break-Even
 * Inspired by Hummingbot V2 Triple-Barrier Executor & Jesse custom_stoploss:
 * - Tracks `peakPrice` (highest mark price for LONG, lowest for SHORT).
 * - Once favorable excursion from entry >= `activationPct` (default 0.65%), activates trailing stop.
 * - Guarantees a minimum fee-safe Break-Even floor (`entryVwap * (1 ± 0.0018)`) covering round-trip taker fees (0.11%) + 0.07% net profit cushion.
 * - Trails behind `peakPrice` by `trailingCallbackPct` (or locks 60% of peak excursion), and strictly ratchets only in the favorable direction.
 */
export interface TrailingStopUpdate {
  newSlPrice: number;
  newPeakPrice: number;
  updated: boolean;
  isBreakEven: boolean;
  isTrailing: boolean;
}

export function computeTrailingStopPrice(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  currentSlPrice: number;
  previousPeakPrice?: number;
  priceDecimals?: number;
  activationPct?: number; // default 0.65%
  feeBufferPct?: number; // default 0.18% (0.11% round-trip fee + 0.07% net lock)
  lockFraction?: number; // default 0.60 (locks 60% of peak excursion)
}): TrailingStopUpdate {
  const {
    side,
    entryPrice,
    currentPrice,
    currentSlPrice,
    previousPeakPrice,
    priceDecimals = 4,
    activationPct = 0.65,
    feeBufferPct = 0.18,
    lockFraction = 0.60,
  } = params;

  const dirSign = side === 'LONG' ? 1 : -1;
  const prevPeak =
    typeof previousPeakPrice === 'number' && previousPeakPrice > 0
      ? previousPeakPrice
      : entryPrice;

  const newPeakPrice =
    side === 'LONG'
      ? Math.max(prevPeak, currentPrice)
      : Math.min(prevPeak, currentPrice);

  const peakExcursionPct = ((newPeakPrice - entryPrice) / Math.max(1e-9, entryPrice)) * dirSign * 100;
  const currentExcursionPct = ((currentPrice - entryPrice) / Math.max(1e-9, entryPrice)) * dirSign * 100;

  if (peakExcursionPct < activationPct) {
    return {
      newSlPrice: currentSlPrice,
      newPeakPrice,
      updated: false,
      isBreakEven: false,
      isTrailing: false,
    };
  }

  const minFeeCushion = entryPrice * (feeBufferPct / 100) * dirSign;
  const rawTrailPrice = entryPrice + (newPeakPrice - entryPrice) * lockFraction;

  const candidateSl =
    side === 'LONG'
      ? Math.max(entryPrice + minFeeCushion, rawTrailPrice)
      : Math.min(entryPrice + minFeeCushion, rawTrailPrice);

  const roundedSl = Number(candidateSl.toFixed(priceDecimals));
  const isBetterSl =
    side === 'LONG' ? roundedSl > currentSlPrice : roundedSl < currentSlPrice;
  const slNotAlreadyBreached =
    side === 'LONG' ? roundedSl < currentPrice : roundedSl > currentPrice;
  const alreadyLockedProfit =
    side === 'LONG' ? currentSlPrice > entryPrice : currentSlPrice < entryPrice;
  const isCurrentlyInSafeProfit = alreadyLockedProfit || currentExcursionPct >= Math.max(feeBufferPct + 0.1, activationPct * 0.5);

  if (isBetterSl && slNotAlreadyBreached && isCurrentlyInSafeProfit) {
    return {
      newSlPrice: roundedSl,
      newPeakPrice,
      updated: true,
      isBreakEven: true,
      isTrailing: true,
    };
  }

  return {
    newSlPrice: currentSlPrice,
    newPeakPrice,
    updated: false,
    isBreakEven: alreadyLockedProfit,
    isTrailing: alreadyLockedProfit,
  };
}

export interface MskSessionRiskProfile {
  mskHour: number;
  mskMinute: number;
  mskTimeLabel: string;
  sessionKey: 'UTC_ROLLOVER_WINDOW' | 'NIGHT_ASIA' | 'DAY_EU_US';
  sessionLabel: string;
  isNightSession: boolean;
  isRolloverWindow: boolean;
  nightModeEnabled: boolean;
  maxSpreadBpsLimit: number;
  riskMultiplier: number;
  maxConcurrentPositionsCap: number | null;
}

/**
 * 7. MSK Session-Aware Night Mode Profile (UTC+3)
 * - 02:50..03:15 MSK (00:00 UTC daily candle close + 8h funding): tightest spread/risk (0.5x risk, <=4.5 bps)
 * - 00:00..08:59 MSK (Asian night session): thinner altcoin orderbooks -> 0.75x risk, <=6.0 bps spread, max 2 concurrent
 * - 09:00..23:59 MSK (EU/US liquid session): full profile (1.0x risk, baseMaxSpreadBps)
 */
export function getMskSessionRiskProfile(params?: {
  nowTs?: number;
  nightModeEnabled?: boolean;
  baseMaxSpreadBps?: number;
}): MskSessionRiskProfile {
  const {
    nowTs = Date.now(),
    nightModeEnabled = true,
    baseMaxSpreadBps = 8.0,
  } = params || {};

  const MSK_OFFSET_MS = 3 * 3600 * 1000;
  const mskDate = new Date(nowTs + MSK_OFFSET_MS);
  const mskHour = mskDate.getUTCHours();
  const mskMinute = mskDate.getUTCMinutes();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const mskTimeLabel = `${pad2(mskHour)}:${pad2(mskMinute)} МСК`;

  const totalMskMinutes = mskHour * 60 + mskMinute;
  const isRolloverWindow = totalMskMinutes >= 170 && totalMskMinutes <= 195; // 02:50..03:15 МСК (00:00 UTC)
  const isNightSession = mskHour >= 0 && mskHour < 9; // 00:00..08:59 МСК

  let sessionKey: MskSessionRiskProfile['sessionKey'] = 'DAY_EU_US';
  let sessionLabel = 'День · Европа / США (ликвидная сессия)';
  if (isRolloverWindow) {
    sessionKey = 'UTC_ROLLOVER_WINDOW';
    sessionLabel = 'Свеча 00:00 UTC / Фандинг (02:50–03:15 МСК)';
  } else if (isNightSession) {
    sessionKey = 'NIGHT_ASIA';
    sessionLabel = 'Ночь · Азия (пониженная ликвидность 00:00–09:00 МСК)';
  }

  const safeBaseSpread = Math.max(2.0, Number(baseMaxSpreadBps) || 8.0);
  if (!nightModeEnabled || !isNightSession) {
    return {
      mskHour,
      mskMinute,
      mskTimeLabel,
      sessionKey,
      sessionLabel,
      isNightSession,
      isRolloverWindow,
      nightModeEnabled,
      maxSpreadBpsLimit: Number(safeBaseSpread.toFixed(1)),
      riskMultiplier: 1.0,
      maxConcurrentPositionsCap: null,
    };
  }

  if (isRolloverWindow) {
    return {
      mskHour,
      mskMinute,
      mskTimeLabel,
      sessionKey,
      sessionLabel,
      isNightSession: true,
      isRolloverWindow: true,
      nightModeEnabled: true,
      maxSpreadBpsLimit: Number(Math.min(safeBaseSpread, 4.5).toFixed(1)),
      riskMultiplier: 0.5,
      maxConcurrentPositionsCap: 2,
    };
  }

  return {
    mskHour,
    mskMinute,
    mskTimeLabel,
    sessionKey,
    sessionLabel,
    isNightSession: true,
    isRolloverWindow: false,
    nightModeEnabled: true,
    maxSpreadBpsLimit: Number(Math.min(safeBaseSpread, 6.0).toFixed(1)),
    riskMultiplier: 0.75,
    maxConcurrentPositionsCap: 2,
  };
}

export interface MacroNewsWindowStatus {
  macroGuardEnabled: boolean;
  isBlocked: boolean;
  activeEventTitle: string | null;
  activeWindowLabel: string | null;
  minutesRemaining: number;
  etTimeLabel: string;
  mskTimeLabel: string;
  nextScheduledLabel: string;
}

const FOMC_DATES_ET = new Set<string>([
  // 2026
  '2026-12-16',
  // 2027
  '2027-01-27',
  '2027-03-17',
  '2027-04-28',
  '2027-06-16',
  '2027-07-28',
  '2027-09-15',
  '2027-11-03',
  '2027-12-15',
]);

const US_CPI_DATES_ET = new Set<string>([
  // Late 2026 & 2027 typical BLS CPI release days (08:30 ET)
  '2026-12-10',
  '2027-01-13',
  '2027-02-10',
  '2027-03-10',
  '2027-04-13',
  '2027-05-12',
  '2027-06-10',
  '2027-07-14',
  '2027-08-11',
  '2027-09-14',
  '2027-10-13',
  '2027-11-10',
  '2027-12-14',
]);

function getZonedDateTimeParts(ts: number, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun .. 6 = Sat
  dateKey: string;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ts));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(map.year || 2026);
  const month = Number(map.month || 1);
  const day = Number(map.day || 1);
  const rawHour = Number(map.hour || 0);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(map.minute || 0);
  const weekday = weekdayMap[map.weekday || 'Mon'] ?? 1;
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, hour, minute, weekday, dateKey };
}

/**
 * 8. US Macro News Blackout Window (@ne_investor volatile release protection)
 * Pauses NEW bot entries around high-volatility US macroeconomic releases:
 * - First Friday of every month at 08:30 ET (Non-Farm Payrolls / NFP): -30m .. +15m
 * - US CPI release dates at 08:30 ET: -30m .. +15m
 * - Federal Reserve FOMC Rate Decision days at 14:00 ET: -30m .. +20m
 * - Live breaking FOMC / CPI / Fed macro headline detected within the last 15 minutes
 */
export function evaluateMacroNewsWindow(params?: {
  nowTs?: number;
  macroGuardEnabled?: boolean;
  preWindowMinutes?: number;
  postWindowMinutes?: number;
  recentMacroHeadlineTs?: number | null;
  recentMacroHeadlineTitle?: string | null;
}): MacroNewsWindowStatus {
  const {
    nowTs = Date.now(),
    macroGuardEnabled = true,
    preWindowMinutes = 30,
    postWindowMinutes = 15,
    recentMacroHeadlineTs = null,
    recentMacroHeadlineTitle = null,
  } = params || {};

  const et = getZonedDateTimeParts(nowTs, 'America/New_York');
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const etTimeLabel = `${pad2(et.hour)}:${pad2(et.minute)} ET`;

  const mskDate = new Date(nowTs + 3 * 3600 * 1000);
  const mskTimeLabel = `${pad2(mskDate.getUTCHours())}:${pad2(mskDate.getUTCMinutes())} МСК`;

  const totalEtMinutes = et.hour * 60 + et.minute;
  const isFirstFridayOfMonth = et.weekday === 5 && et.day <= 7;
  const isCpiDay = US_CPI_DATES_ET.has(et.dateKey);
  const isFomcDay = FOMC_DATES_ET.has(et.dateKey);

  // Upcoming NFP/CPI/FOMC label for UI display
  const nextScheduledLabel = isFomcDay
    ? 'Сегодня решение ФРС (FOMC 14:00 ET)'
    : isCpiDay
    ? 'Сегодня публикация инфляции США (CPI 08:30 ET)'
    : isFirstFridayOfMonth
    ? 'Сегодня рынок труда США (NFP 08:30 ET)'
    : 'NFP (1-я пт 08:30 ET) · CPI (08:30 ET) · ФРС (14:00 ET)';

  if (!macroGuardEnabled) {
    return {
      macroGuardEnabled: false,
      isBlocked: false,
      activeEventTitle: null,
      activeWindowLabel: null,
      minutesRemaining: 0,
      etTimeLabel,
      mskTimeLabel,
      nextScheduledLabel,
    };
  }

  // Check 08:30 ET window (510 min) for NFP / CPI
  const release0830Min = 8 * 60 + 30;
  if ((isFirstFridayOfMonth || isCpiDay) && totalEtMinutes >= release0830Min - preWindowMinutes && totalEtMinutes <= release0830Min + postWindowMinutes) {
    const title = isCpiDay ? 'Публикация US CPI (08:30 ET)' : 'Отчет рынка труда США NFP (08:30 ET)';
    const minsLeft = Math.max(1, release0830Min + postWindowMinutes - totalEtMinutes);
    return {
      macroGuardEnabled: true,
      isBlocked: true,
      activeEventTitle: title,
      activeWindowLabel: `${title} · пауза входов еще ~${minsLeft} мин`,
      minutesRemaining: minsLeft,
      etTimeLabel,
      mskTimeLabel,
      nextScheduledLabel,
    };
  }

  // Check 14:00 ET window (840 min) for FOMC
  const fomcPostMinutes = Math.max(postWindowMinutes, 20);
  const release1400Min = 14 * 60;
  if (isFomcDay && totalEtMinutes >= release1400Min - preWindowMinutes && totalEtMinutes <= release1400Min + fomcPostMinutes) {
    const title = 'Ставка ФРС США (FOMC 14:00 ET)';
    const minsLeft = Math.max(1, release1400Min + fomcPostMinutes - totalEtMinutes);
    return {
      macroGuardEnabled: true,
      isBlocked: true,
      activeEventTitle: title,
      activeWindowLabel: `${title} · пауза входов еще ~${minsLeft} мин`,
      minutesRemaining: minsLeft,
      etTimeLabel,
      mskTimeLabel,
      nextScheduledLabel,
    };
  }

  // Live macro flash headline cooldown (15 min)
  if (
    typeof recentMacroHeadlineTs === 'number' &&
    recentMacroHeadlineTs > 0 &&
    nowTs >= recentMacroHeadlineTs &&
    nowTs - recentMacroHeadlineTs <= 15 * 60 * 1000
  ) {
    const minsLeft = Math.max(1, Math.ceil((15 * 60 * 1000 - (nowTs - recentMacroHeadlineTs)) / 60000));
    const title = recentMacroHeadlineTitle ? `Макро-новость: ${recentMacroHeadlineTitle}` : 'Экстренная макро-новость (CPI / ФРС)';
    return {
      macroGuardEnabled: true,
      isBlocked: true,
      activeEventTitle: title,
      activeWindowLabel: `${title} · пауза еще ~${minsLeft} мин`,
      minutesRemaining: minsLeft,
      etTimeLabel,
      mskTimeLabel,
      nextScheduledLabel,
    };
  }

  return {
    macroGuardEnabled: true,
    isBlocked: false,
    activeEventTitle: null,
    activeWindowLabel: null,
    minutesRemaining: 0,
    etTimeLabel,
    mskTimeLabel,
    nextScheduledLabel,
  };
}

export interface CrowdLongShortGuardResult {
  allowed: boolean;
  longShortRatio: number | null;
  longSharePct: number | null;
  shortSharePct: number | null;
  crowdedSide: 'LONG' | 'SHORT' | 'BALANCED' | 'UNKNOWN';
  reason?: string;
}

/**
 * 9. OKX Crowd Long/Short Ratio Anti-FOMO Guard
 * Prevents opening new positions WITH an overcrowded retail side (default >= 78% accounts on one side).
 * Counter-crowd entries (or when OKX L/S data is unavailable, e.g. XAU) are permitted.
 */
export function evaluateCrowdLongShortGuard(params: {
  side: 'LONG' | 'SHORT';
  longShortRatio: number | null | undefined;
  maxCrowdSharePct?: number;
  crowdGuardEnabled?: boolean;
}): CrowdLongShortGuardResult {
  const {
    side,
    longShortRatio,
    maxCrowdSharePct = 78.0,
    crowdGuardEnabled = true,
  } = params;

  if (typeof longShortRatio !== 'number' || !Number.isFinite(longShortRatio) || longShortRatio <= 0) {
    return {
      allowed: true,
      longShortRatio: null,
      longSharePct: null,
      shortSharePct: null,
      crowdedSide: 'UNKNOWN',
    };
  }

  const longSharePct = Number(((longShortRatio / (1 + longShortRatio)) * 100).toFixed(1));
  const shortSharePct = Number((100 - longSharePct).toFixed(1));
  const threshold = Math.max(60, Math.min(95, Number(maxCrowdSharePct) || 78));

  const crowdedSide: CrowdLongShortGuardResult['crowdedSide'] =
    longSharePct >= threshold
      ? 'LONG'
      : shortSharePct >= threshold
      ? 'SHORT'
      : 'BALANCED';

  if (!crowdGuardEnabled) {
    return {
      allowed: true,
      longShortRatio: Number(longShortRatio.toFixed(2)),
      longSharePct,
      shortSharePct,
      crowdedSide,
    };
  }

  if (side === 'LONG' && longSharePct >= threshold) {
    return {
      allowed: false,
      longShortRatio: Number(longShortRatio.toFixed(2)),
      longSharePct,
      shortSharePct,
      crowdedSide: 'LONG',
      reason: `Перекос толпы OKX: ${longSharePct.toFixed(1)}% счетов в LONG (L/S ${longShortRatio.toFixed(2)}, порог ${threshold}%) — вход по ходу толпы заблокирован`,
    };
  }

  if (side === 'SHORT' && shortSharePct >= threshold) {
    return {
      allowed: false,
      longShortRatio: Number(longShortRatio.toFixed(2)),
      longSharePct,
      shortSharePct,
      crowdedSide: 'SHORT',
      reason: `Перекос толпы OKX: ${shortSharePct.toFixed(1)}% счетов в SHORT (L/S ${longShortRatio.toFixed(2)}, порог ${threshold}%) — вход по ходу толпы заблокирован`,
    };
  }

  return {
    allowed: true,
    longShortRatio: Number(longShortRatio.toFixed(2)),
    longSharePct,
    shortSharePct,
    crowdedSide,
  };
}


