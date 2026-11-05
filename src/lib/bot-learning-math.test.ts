import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDeepObi,
  calculateRsi14,
  calculateVwapDeviation,
  calculateAtr14Pct,
  createDefaultBotBrain,
  extractMarketFeatures,
  evaluateBotSignal,
  updateBotBrainOnline,
  runHistoricalKlineEpoch,
  evaluateSymbolCooldownGuard,
  type SymbolCooldownEntry,
  type KlineBar,
} from './bot-learning-math.ts';

function generateSampleKlines(count: number, startPrice: number = 68000): KlineBar[] {
  const bars: KlineBar[] = [];
  let p = startPrice;
  for (let i = 0; i < count; i++) {
    const delta = (i % 3 === 0 ? -1 : 1) * (p * 0.0025);
    const open = p;
    const close = p + delta;
    const high = Math.max(open, close) + p * 0.0018;
    const low = Math.min(open, close) - p * 0.0015;
    bars.push({
      timestamp: Date.now() - (count - i) * 300000,
      open,
      high,
      low,
      close,
      volume: 120 + i * 5,
      turnover: (120 + i * 5) * close,
    });
    p = close;
  }
  return bars;
}

test('calculateDeepObi returns positive imbalance when bids outweigh asks', () => {
  const bids = [
    { price: 68500, qty: 4.5 },
    { price: 68490, qty: 3.2 },
  ];
  const asks = [
    { price: 68505, qty: 1.0 },
    { price: 68515, qty: 0.8 },
  ];
  const res = calculateDeepObi(bids, asks, 10);
  assert.ok(res.obi > 0.4, `Expected strong positive OBI, got ${res.obi}`);
  assert.ok(res.spreadBps > 0 && res.spreadBps < 5, `Expected narrow spreadBps, got ${res.spreadBps}`);
});

test('calculateRsi14 and calculateAtr14Pct compute valid bounded technical metrics', () => {
  const klines = generateSampleKlines(30, 68000);
  const closes = klines.map((k) => k.close);
  const rsi = calculateRsi14(closes, 14);
  const atrPct = calculateAtr14Pct(klines, 14);
  const vwap = calculateVwapDeviation(klines);

  assert.ok(rsi >= 5 && rsi <= 95, `RSI out of bounds: ${rsi}`);
  assert.ok(atrPct >= 0.25 && atrPct <= 8.0, `ATR% out of bounds: ${atrPct}`);
  assert.ok(vwap.vwap > 60000, `VWAP should be near price: ${vwap.vwap}`);
});

test('evaluateBotSignal produces LONG/SHORT or SKIP based on threshold and spread guard', () => {
  const brain = createDefaultBotBrain('ONNX_RL', 'agent-onnx-ppo-v2');
  const klines = generateSampleKlines(35, 68000);
  const bids = [{ price: 69000, qty: 12.0 }, { price: 68990, qty: 8.0 }];
  const asks = [{ price: 69005, qty: 1.5 }, { price: 69010, qty: 1.0 }];

  const features = extractMarketFeatures({
    bids,
    asks,
    klines,
    sentimentScore: 0.65,
  });

  const decision = evaluateBotSignal(brain, features);
  assert.equal(decision.action, 'LONG');
  assert.ok(decision.compositeScore >= brain.confidenceThreshold);
  assert.ok(decision.slDistancePct >= 0.35 && decision.slDistancePct <= 3.8);
});

test('updateBotBrainOnline reinforces aligned weights after winning trade and normalizes to 1.0', () => {
  const brain = createDefaultBotBrain('ONNX_RL', 'agent-onnx-ppo-v2');
  const prevObiWeight = brain.weights.obiWeight;

  const { updatedBrain, reward, weightDelta } = updateBotBrainOnline({
    agentId: 'agent-onnx-ppo-v2',
    brain,
    entryFeatures: { obi: 0.75, momentum: 0.4, vwap: 0.1, sentiment: -0.2 },
    side: 'LONG',
    netPnlUsdt: 185.0,
    riskBudgetUsdt: 150.0,
    symbol: 'BTCUSDT',
  });

  assert.ok(reward > 1.0);
  assert.ok(updatedBrain.weights.obiWeight > prevObiWeight, 'Winning LONG with strong +OBI should boost obiWeight');
  assert.ok(weightDelta.obiWeight > 0);

  const sumWeights =
    updatedBrain.weights.obiWeight +
    updatedBrain.weights.momentumWeight +
    updatedBrain.weights.vwapWeight +
    updatedBrain.weights.sentimentWeight;
  assert.ok(Math.abs(sumWeights - 1.0) < 0.002, `Weights must sum to 1.0, got ${sumWeights}`);
});

test('runHistoricalKlineEpoch replays candles and updates epochsTrained and rewardHistory', () => {
  const brain = createDefaultBotBrain('LIGHTGBM', 'agent-lgbm-nightly');
  const klinesBySymbol = {
    BTCUSDT: generateSampleKlines(60, 68000),
    SOLUSDT: generateSampleKlines(60, 175),
  };

  const res = runHistoricalKlineEpoch({
    agentId: 'agent-lgbm-nightly',
    brain,
    klinesBySymbol,
    tpSlRatio: 1.8,
  });

  assert.equal(res.updatedBrain.epochsTrained, brain.epochsTrained + 1);
  assert.ok(res.simulatedTrades > 0, 'Should simulate trades across historical klines');
  assert.ok(res.newSha256.length === 64, 'Should generate valid SHA256 hash');
});

test('evaluateSymbolCooldownGuard enforces Freqtrade-style StoplossGuard and CooldownPeriod', () => {
  const now = 1700000000000;
  const map: Record<string, SymbolCooldownEntry> = {
    DOGEUSDT: {
      symbol: 'DOGEUSDT',
      untilTs: now + 600000, // 10 min active cooldown
      lastExitReason: 'SL_HIT',
      consecutiveSlCount: 2,
      lastClosedAt: now - 5000,
    },
  };

  const blocked = evaluateSymbolCooldownGuard(map, 'DOGEUSDT', now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remainingSec, 600);
  assert.match(blocked.reason!, /StoplossGuard/);

  const expired = evaluateSymbolCooldownGuard(map, 'DOGEUSDT', now + 601000);
  assert.equal(expired.allowed, true);
  assert.equal(expired.remainingSec, 0);
});

