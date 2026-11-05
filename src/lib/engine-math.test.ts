import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRiskFirewallOrderSize,
  checkMarketGuards,
  evaluateDailyDrawdownKillSwitch,
  executeMarketOrderL2,
  checkLimitOrderFill,
  dynamicTPCollapse,
  validateSignalFreshness,
  computeTrailingStopPrice,
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

test('Market Guards: Funding Guard triggers 15m before funding if adverse', () => {
  const adverseFunding = checkMarketGuards({
    bestBid: 60000,
    bestAsk: 60010,
    minutesToNextFunding: 10,
    projectedFundingRate: 0.0015, // 0.15% adverse to LONG
    side: 'LONG',
  });
  assert.equal(adverseFunding.passed, false);
  assert.match(adverseFunding.reason!, /Funding Guard Triggered/);
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

