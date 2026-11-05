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
}): { passed: boolean; reason?: string } {
  const { bestBid, bestAsk, minutesToNextFunding, projectedFundingRate, side, maxSpreadPct = 0.0025 } = params;

  // Spread guard
  const spreadPct = (bestAsk - bestBid) / bestBid;
  if (spreadPct > maxSpreadPct) {
    return {
      passed: false,
      reason: `Spread Guard Triggered: Spread ${(spreadPct * 100).toFixed(3)}% exceeds max ${(maxSpreadPct * 100).toFixed(2)}%`,
    };
  }

  // Funding guard: 15 min before funding if funding rate against position > 0.10%
  // LONG pays funding if funding rate > 0
  // SHORT pays funding if funding rate < 0
  const isPayingFunding = (side === 'LONG' && projectedFundingRate > 0.001) || (side === 'SHORT' && projectedFundingRate < -0.001);

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

  if (isBetterSl) {
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
    isBreakEven: side === 'LONG' ? currentSlPrice > entryPrice : currentSlPrice < entryPrice,
    isTrailing: true,
  };
}

