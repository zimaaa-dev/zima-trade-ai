import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRiskFirewallOrderSize,
  checkMarketGuards,
  evaluateDailyDrawdownKillSwitch,
  evaluateAutoKillSwitchRecovery,
  executeMarketOrderL2,
  checkLimitOrderFill,
  dynamicTPCollapse,
  validateSignalFreshness,
  computeTrailingStopPrice,
  getMskSessionRiskProfile,
  evaluateMacroNewsWindow,
  evaluateCrowdLongShortGuard,
  type OrderbookL2,
  type InstrumentRules,
} from './engine-math.ts';

const mockInstrument: InstrumentRules = {
  exchange: 'bybit',
  symbol: 'BTCUSDT',
  tickSize: 0.1,
  qtyStep: 0.001,
  minQty: 0.001,
  minNotional: 5.0,
  maxLeverage: 10,
};

test('Risk Firewall: 1.5% max risk strictly limits loss including round-trip taker fees', () => {
  const result = calculateRiskFirewallOrderSize({
    capital: 10000,
    entryPrice: 60000,
    stopLossPrice: 59000, // Distance = 1000 + 66 round-trip fee = 1066
    side: 'LONG',
    requestedLeverage: 20, // Must be clamped to max 10
    instrument: mockInstrument,
    riskPctLimit: 0.015, // 150 USDT max loss
  });

  assert.equal(result.allowed, true);
  // Max loss = 150 USDT. Effective SL distance with 0.11% round-trip fee = 1066 USDT.
  // Qty = floor(150 / 1066, 0.001) = 0.14 BTC, Net maxLossUsdt = 149.24 <= 150 USDT
  assert.equal(result.qty, 0.14);
  assert.ok(result.maxLossUsdt <= 150);
  assert.equal(result.maxLossUsdt, 149.24);
  assert.equal(result.effectiveLeverage, 10);
});

test('Risk Firewall: Rejects invalid SL where SL is on wrong side', () => {
  const resultLong = calculateRiskFirewallOrderSize({
    capital: 10000,
    entryPrice: 60000,
    stopLossPrice: 61000, // Invalid for LONG
    side: 'LONG',
    requestedLeverage: 5,
    instrument: mockInstrument,
  });
  assert.equal(resultLong.allowed, false);

  const resultShort = calculateRiskFirewallOrderSize({
    capital: 10000,
    entryPrice: 60000,
    stopLossPrice: 59000, // Invalid for SHORT
    side: 'SHORT',
    requestedLeverage: 5,
    instrument: mockInstrument,
  });
  assert.equal(resultShort.allowed, false);
});

test('Risk Firewall: Daily Drawdown Kill-Switch triggers at -5.0%', () => {
  const safe = evaluateDailyDrawdownKillSwitch(10000, -450); // -4.5%
  assert.equal(safe.isKillSwitchActive, false);
  assert.equal(safe.drawdownPct, -4.5);

  const breached = evaluateDailyDrawdownKillSwitch(10000, -500); // -5.0%
  assert.equal(breached.isKillSwitchActive, true);

  const heavyBreach = evaluateDailyDrawdownKillSwitch(10000, -750); // -7.5%
  assert.equal(heavyBreach.isKillSwitchActive, true);
});

test('Market Guards: Spread Guard triggers when spread > 0.25%', () => {
  const normal = checkMarketGuards({
    bestBid: 60000,
    bestAsk: 60050, // 0.083% spread
    minutesToNextFunding: 30,
    projectedFundingRate: 0.0001,
    side: 'LONG',
  });
  assert.equal(normal.passed, true);

  const blownSpread = checkMarketGuards({
    bestBid: 60000,
    bestAsk: 60200, // 0.33% spread > 0.25%
    minutesToNextFunding: 30,
    projectedFundingRate: 0.0001,
    side: 'LONG',
  });
  assert.equal(blownSpread.passed, false);
  assert.match(blownSpread.reason!, /Spread Guard Triggered/);
});

test('Market Guards: Funding Guard triggers 15m before funding if adverse (>= 0.05%)', () => {
  const adverseFunding = checkMarketGuards({
    bestBid: 60000,
    bestAsk: 60010,
    minutesToNextFunding: 10,
    projectedFundingRate: 0.0005, // 0.05% adverse to LONG
    side: 'LONG',
  });
  assert.equal(adverseFunding.passed, false);
  assert.match(adverseFunding.reason!, /Funding Guard Triggered/);

  const mildFunding = checkMarketGuards({
    bestBid: 60000,
    bestAsk: 60010,
    minutesToNextFunding: 10,
    projectedFundingRate: 0.0002, // 0.02% < 0.05% threshold -> allowed
    side: 'LONG',
  });
  assert.equal(mildFunding.passed, true);
});

test('Matching Engine: VWAP Slippage through L2-50 orderbook and taker fee', () => {
  const mockBook: OrderbookL2 = {
    timestamp: Date.now(),
    seqId: 1001,
    bids: [{ price: 59990, qty: 1.0 }],
    asks: [
      { price: 60000, qty: 0.5 },
      { price: 60010, qty: 0.5 },
      { price: 60050, qty: 1.0 },
    ],
  };

  // Buy 1.0 BTC: 0.5 at 60000 and 0.5 at 60010 -> total 60005 VWAP
  const exec = executeMarketOrderL2(mockBook, 'BUY', 1.0, 0.00055);
  assert.equal(exec.filled, true);
  assert.equal(exec.executedQty, 1.0);
  assert.equal(exec.vwapPrice, 60005);
  assert.equal(exec.levelsWalked, 2);
  // Fee = 60005 * 0.00055 = 33.00275 USDT
  assert.ok(Math.abs(exec.feeUsdt - 33.00275) < 0.01);
});

test('Matching Engine: Limit Order Queue Fill logic', () => {
  // Penetration fill
  const penetration = checkLimitOrderFill({
    side: 'BUY',
    limitPrice: 60000,
    orderQty: 0.1,
    queueAheadQty: 2.0,
    currentBestAsk: 59999, // Best ask breached below limit
    currentBestBid: 59998,
    volumeTradedAtPriceSincePlacement: 0.5,
  });
  assert.equal(penetration.isFilled, true);

  // Queue volume fill
  const queueCleared = checkLimitOrderFill({
    side: 'BUY',
    limitPrice: 60000,
    orderQty: 0.1,
    queueAheadQty: 2.0,
    currentBestAsk: 60000,
    currentBestBid: 59999,
    volumeTradedAtPriceSincePlacement: 2.15, // > 2.0 + 0.1
  });
  assert.equal(queueCleared.isFilled, true);

  // Not filled yet
  const notFilled = checkLimitOrderFill({
    side: 'BUY',
    limitPrice: 60000,
    orderQty: 0.1,
    queueAheadQty: 2.0,
    currentBestAsk: 60000,
    currentBestBid: 59999,
    volumeTradedAtPriceSincePlacement: 1.5,
  });
  assert.equal(notFilled.isFilled, false);
});

test('Dynamic TP Collapse: merges dust shares < minNotional * 1.1 into previous target', () => {
  // Total 0.0001 BTC (~6 USDT). TP grid: [50%, 30%, 20%]
  // 20% of 60000 * 0.0001 = ~1.2 USDT < 5.5 USDT -> must collapse
  const totalQty = 0.001; // Notional ~60 USDT
  const tpGrid = [
    { price: 62000, share: 0.7 },
    { price: 65000, share: 0.3 },
  ];

  const collapsed = dynamicTPCollapse(totalQty, tpGrid, mockInstrument);
  assert.ok(collapsed.length >= 1);
  const totalCollapsedQty = collapsed.reduce((sum, c) => sum + c.qty, 0);
  assert.equal(totalCollapsedQty.toFixed(3), totalQty.toFixed(3));
});

test('Signal Freshness: Stale filter rejects signal when price has progressed > 30% towards TP1', () => {
  // LONG from 60000 to TP1 61000, SL 59500
  // Path to TP1 is 1000
  // If price is 60400 (progress 40% > 30%), it must be rejected as STALE_SIGNAL
  const stale = validateSignalFreshness({
    side: 'LONG',
    entryLow: 60000,
    entryHigh: 60000,
    stopLoss: 59500,
    tp1: 61000,
    liveBestAsk: 60400,
    liveBestBid: 60395,
  });
  assert.equal(stale.valid, false);
  assert.equal(stale.status, 'STALE_SIGNAL');

  // Fresh signal
  const fresh = validateSignalFreshness({
    side: 'LONG',
    entryLow: 60000,
    entryHigh: 60000,
    stopLoss: 59500,
    tp1: 61000,
    liveBestAsk: 60050, // 5% progress
    liveBestBid: 60045,
  });
  assert.equal(fresh.valid, true);
  assert.equal(fresh.status, 'ACCEPTED');
  assert.equal(fresh.riskRewardRatio, 2.0); // Reward 1000 / Risk 500 = 2.0
});

test('High-Water-Mark Trailing Stop: ratchets monotonically and preserves peak on pullback', () => {
  // LONG entry at 100.0, initial SL at 98.5
  const step1 = computeTrailingStopPrice({
    side: 'LONG',
    entryPrice: 100.0,
    currentPrice: 101.0, // +1.0% >= 0.65% activation
    currentSlPrice: 98.5,
    priceDecimals: 2,
  });
  assert.equal(step1.updated, true);
  assert.equal(step1.newPeakPrice, 101.0);
  assert.equal(step1.newSlPrice, 100.6); // 60% of +1.0 move locked above entry

  // Price pulls back to 100.7 — peakPrice must remain 101.0 and SL must NOT move down
  const step2 = computeTrailingStopPrice({
    side: 'LONG',
    entryPrice: 100.0,
    currentPrice: 100.7,
    currentSlPrice: step1.newSlPrice,
    previousPeakPrice: step1.newPeakPrice,
    priceDecimals: 2,
  });
  assert.equal(step2.updated, false);
  assert.equal(step2.newPeakPrice, 101.0);
  assert.equal(step2.newSlPrice, 100.6);
});

test('High-Water-Mark Trailing Stop: never fires instant SL when DCA averaging shifts entryVwap while price is in drawdown', () => {
  // Simulates ETHUSDT SHORT: SO2 filled at $1845.50 shifting entryVwap to $1815.96 while stale peakPrice was $1775
  const dcaTick = computeTrailingStopPrice({
    side: 'SHORT',
    entryPrice: 1815.96,
    currentPrice: 1845.50,
    currentSlPrice: 1862.10,
    previousPeakPrice: 1775.0,
    priceDecimals: 2,
    activationPct: 1.05,
    feeBufferPct: 0.25,
    lockFraction: 0.70,
  });
  assert.equal(dcaTick.updated, false);
  assert.equal(dcaTick.newSlPrice, 1862.10);
  assert.equal(dcaTick.isTrailing, false);
});

test('MSK Night Mode: applies stricter spread, 0.75x risk in Asia night, 0.5x around 03:00 MSK rollover, and 1.0x in daytime or when disabled', () => {
  // Daytime 14:30 MSK = 11:30 UTC
  const day = getMskSessionRiskProfile({
    nowTs: Date.UTC(2026, 10, 20, 11, 30, 0),
    nightModeEnabled: true,
    baseMaxSpreadBps: 8.0,
  });
  assert.equal(day.mskHour, 14);
  assert.equal(day.isNightSession, false);
  assert.equal(day.riskMultiplier, 1.0);
  assert.equal(day.maxSpreadBpsLimit, 8.0);
  assert.equal(day.maxConcurrentPositionsCap, null);

  // Asian Night 05:30 MSK = 02:30 UTC
  const night = getMskSessionRiskProfile({
    nowTs: Date.UTC(2026, 10, 20, 2, 30, 0),
    nightModeEnabled: true,
    baseMaxSpreadBps: 8.0,
  });
  assert.equal(night.mskHour, 5);
  assert.equal(night.isNightSession, true);
  assert.equal(night.isRolloverWindow, false);
  assert.equal(night.sessionKey, 'NIGHT_ASIA');
  assert.equal(night.riskMultiplier, 0.75);
  assert.equal(night.maxSpreadBpsLimit, 6.0);
  assert.equal(night.maxConcurrentPositionsCap, 2);

  // UTC Daily Rollover 03:02 MSK = 00:02 UTC
  const rollover = getMskSessionRiskProfile({
    nowTs: Date.UTC(2026, 10, 20, 0, 2, 0),
    nightModeEnabled: true,
    baseMaxSpreadBps: 8.0,
  });
  assert.equal(rollover.mskHour, 3);
  assert.equal(rollover.isRolloverWindow, true);
  assert.equal(rollover.sessionKey, 'UTC_ROLLOVER_WINDOW');
  assert.equal(rollover.riskMultiplier, 0.5);
  assert.equal(rollover.maxSpreadBpsLimit, 4.5);
  assert.equal(rollover.maxConcurrentPositionsCap, 2);

  // Night Mode explicitly disabled -> full daytime parameters even at 05:30 MSK
  const disabled = getMskSessionRiskProfile({
    nowTs: Date.UTC(2026, 10, 20, 2, 30, 0),
    nightModeEnabled: false,
    baseMaxSpreadBps: 8.0,
  });
  assert.equal(disabled.riskMultiplier, 1.0);
  assert.equal(disabled.maxSpreadBpsLimit, 8.0);
  assert.equal(disabled.maxConcurrentPositionsCap, null);
});

test('Macro News Window Guard: blocks NFP first Friday, FOMC decision, CPI & live macro flash headlines', () => {
  // Normal Friday (2026-11-20 is 3rd Friday, not 1st Friday) at 09:00 ET (14:00 UTC)
  const normalDay = evaluateMacroNewsWindow({
    nowTs: Date.UTC(2026, 10, 20, 14, 0, 0),
    macroGuardEnabled: true,
  });
  assert.equal(normalDay.isBlocked, false);

  // First Friday of Dec 2026 (2026-12-04, NFP 08:30 ET = 13:30 UTC; check 13:15 UTC = 08:15 ET)
  const nfpWindow = evaluateMacroNewsWindow({
    nowTs: Date.UTC(2026, 11, 4, 13, 15, 0),
    macroGuardEnabled: true,
  });
  assert.equal(nfpWindow.isBlocked, true);
  assert.match(nfpWindow.activeEventTitle || '', /NFP/i);

  // FOMC Dec 16, 2026 at 14:00 ET = 19:00 UTC (EST); check 18:45 UTC = 13:45 ET
  const fomcWindow = evaluateMacroNewsWindow({
    nowTs: Date.UTC(2026, 11, 16, 18, 45, 0),
    macroGuardEnabled: true,
  });
  assert.equal(fomcWindow.isBlocked, true);
  assert.match(fomcWindow.activeEventTitle || '', /ФРС|FOMC/i);

  // Live macro flash headline detected 5 minutes ago
  const baseNow = Date.UTC(2026, 10, 20, 15, 0, 0);
  const flashWindow = evaluateMacroNewsWindow({
    nowTs: baseNow,
    macroGuardEnabled: true,
    recentMacroHeadlineTs: baseNow - 5 * 60 * 1000,
    recentMacroHeadlineTitle: 'US CPI YoY 2.8%',
  });
  assert.equal(flashWindow.isBlocked, true);
  assert.ok(flashWindow.minutesRemaining >= 9);

  // Disabled guard bypasses blocks cleanly
  const disabled = evaluateMacroNewsWindow({
    nowTs: Date.UTC(2026, 11, 16, 18, 45, 0),
    macroGuardEnabled: false,
  });
  assert.equal(disabled.isBlocked, false);
});

test('OKX Crowd Long/Short Guard: blocks crowded side >= 78%, permits counter-crowd or missing data', () => {
  // BTC L/S = 3.05 -> 75.3% LONG -> below 78% threshold, both directions allowed
  const btcLong = evaluateCrowdLongShortGuard({ side: 'LONG', longShortRatio: 3.05, maxCrowdSharePct: 78 });
  assert.equal(btcLong.allowed, true);
  assert.equal(btcLong.longSharePct, 75.3);

  // DOGE L/S = 4.25 -> 81.0% LONG -> LONG blocked, SHORT allowed (counter-crowd)
  const dogeLong = evaluateCrowdLongShortGuard({ side: 'LONG', longShortRatio: 4.25, maxCrowdSharePct: 78 });
  assert.equal(dogeLong.allowed, false);
  assert.equal(dogeLong.crowdedSide, 'LONG');
  assert.match(dogeLong.reason || '', /81\.0%/);

  const dogeShort = evaluateCrowdLongShortGuard({ side: 'SHORT', longShortRatio: 4.25, maxCrowdSharePct: 78 });
  assert.equal(dogeShort.allowed, true);

  // Extreme SHORT crowd L/S = 0.20 -> 83.3% SHORT -> SHORT blocked
  const shortCrowd = evaluateCrowdLongShortGuard({ side: 'SHORT', longShortRatio: 0.20, maxCrowdSharePct: 78 });
  assert.equal(shortCrowd.allowed, false);
  assert.equal(shortCrowd.crowdedSide, 'SHORT');

  // Missing ratio (e.g. XAU) passes cleanly
  const xau = evaluateCrowdLongShortGuard({ side: 'LONG', longShortRatio: null, maxCrowdSharePct: 78 });
  assert.equal(xau.allowed, true);
  assert.equal(xau.crowdedSide, 'UNKNOWN');
});

test('Risk Firewall: Auto Kill-Switch recovers after cooldown/stabilization while manual Kill-Switch never auto-recovers', () => {
  const triggeredAt = 1795500000000;
  const hourMs = 60 * 60 * 1000;

  // 1. Manual emergency stop MUST NEVER auto-recover even after 24 hours
  const manualStop = evaluateAutoKillSwitchRecovery({
    isKillSwitchActive: true,
    isAutoTriggered: false,
    triggeredAt,
    nowTs: triggeredAt + 24 * hourMs,
    capitalUsdt: 300,
    rolling24hPnlUsdt: 0,
  });
  assert.equal(manualStop.shouldRecover, false);

  // 2. Auto stop does NOT recover before 3h cooldown even if PnL looks ok
  const tooEarly = evaluateAutoKillSwitchRecovery({
    isKillSwitchActive: true,
    isAutoTriggered: true,
    triggeredAt,
    nowTs: triggeredAt + 2 * hourMs,
    capitalUsdt: 300,
    rolling24hPnlUsdt: -1.13,
  });
  assert.equal(tooEarly.shouldRecover, false);

  // 3. Auto stop DOES recover after 3.5h when 24h drawdown stabilized above -2.5%
  const stabilized = evaluateAutoKillSwitchRecovery({
    isKillSwitchActive: true,
    isAutoTriggered: true,
    triggeredAt,
    nowTs: triggeredAt + 3.5 * hourMs,
    capitalUsdt: 300,
    rolling24hPnlUsdt: -1.13, // -0.38%
  });
  assert.equal(stabilized.shouldRecover, true);
  assert.match(stabilized.reason || '', /Авто-восстановление/);

  // 4. Auto stop stays paused at 4h if 24h drawdown is still deep (-4.5%)
  const stillDeep = evaluateAutoKillSwitchRecovery({
    isKillSwitchActive: true,
    isAutoTriggered: true,
    triggeredAt,
    nowTs: triggeredAt + 4 * hourMs,
    capitalUsdt: 300,
    rolling24hPnlUsdt: -13.5, // -4.5%
  });
  assert.equal(stillDeep.shouldRecover, false);

  // 5. Auto stop resets cleanly after 8h session cooldown
  const sessionReset = evaluateAutoKillSwitchRecovery({
    isKillSwitchActive: true,
    isAutoTriggered: true,
    triggeredAt,
    nowTs: triggeredAt + 8.1 * hourMs,
    capitalUsdt: 300,
    rolling24hPnlUsdt: -13.5,
  });
  assert.equal(sessionReset.shouldRecover, true);
});
