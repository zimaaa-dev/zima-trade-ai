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
  computeAdaptiveMarketProfile,
  adaptBotBrainToMarketRegime,
  calculateFreqaiDissimilarityIndex,
  checkFreqtradeMinimalRoi,
  evaluateFreqtradeShouldExit,
  evaluateLowProfitPairsProtection,
  applyFreqtradePairlistPipeline,
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

test('computeAdaptiveMarketProfile derives institutional parameters per market regime', () => {
  const altSeason = computeAdaptiveMarketProfile({
    regime: 'ALT_SEASON_EXPANSION',
    avgAtrPct: 3.8,
    marketBreadthPct: 72,
    btcChange24hPct: 3.5,
  });
  assert.equal(altSeason.allowedSides, 'LONG_ONLY');
  assert.ok(altSeason.weightBiases.momentumWeight > altSeason.weightBiases.vwapWeight);
  assert.ok(altSeason.dynamicAtrMultiplier >= 1.4 && altSeason.dynamicAtrMultiplier <= 1.85);

  const dump = computeAdaptiveMarketProfile({
    regime: 'MARKET_WIDE_DUMP',
    avgAtrPct: 4.5,
    marketBreadthPct: 15,
    btcChange24hPct: -6.2,
  });
  assert.equal(dump.allowedSides, 'SHORT_ONLY');
  assert.ok(dump.dynamicConfidenceThreshold >= 0.24);

  const chop = computeAdaptiveMarketProfile({
    regime: 'RANGE_CHOP',
    avgAtrPct: 1.8,
    marketBreadthPct: 50,
    btcChange24hPct: 0.1,
  });
  assert.equal(chop.allowedSides, 'LONG_AND_SHORT');
  assert.ok(chop.weightBiases.vwapWeight >= 0.25);
});

test('adaptBotBrainToMarketRegime smoothly blends weights and keeps sum exactly 1.0', () => {
  const initialBrain = createDefaultBotBrain('ONNX_RL', 'test-agent');
  const marketStats = {
    regime: 'ALT_SEASON_EXPANSION' as const,
    avgAtrPct: 3.2,
    marketBreadthPct: 68,
    btcChange24hPct: 2.8,
  };

  const { adaptedBrain, profile, adjustments } = adaptBotBrainToMarketRegime(
    initialBrain,
    marketStats,
    'ONNX_RL'
  );

  const sumWeights =
    adaptedBrain.weights.obiWeight +
    adaptedBrain.weights.momentumWeight +
    adaptedBrain.weights.vwapWeight +
    adaptedBrain.weights.sentimentWeight;

  assert.ok(Math.abs(sumWeights - 1.0) < 0.001, `Adapted weights must sum to 1.0, got ${sumWeights}`);
  assert.ok(adaptedBrain.lastTrainedAt > 0);
  assert.ok(adaptedBrain.atrMultiplier >= 1.2 && adaptedBrain.atrMultiplier <= 2.2);
  assert.ok(adaptedBrain.confidenceThreshold >= 0.15 && adaptedBrain.confidenceThreshold <= 0.35);
  assert.ok(profile.regime === 'ALT_SEASON_EXPANSION');
  assert.ok(adjustments.regimeTitle.length > 0);
});

test('evaluateBotSignal blocks entry when L2 Orderbook (OBI) opposes momentum or price is overextended', () => {
  const brain = createDefaultBotBrain('TG_CHANNEL', 'agent-tg-crypto-alpha');

  // Case 1: Positive momentum & sentiment, but negative L2 orderbook (sellers dominating) -> MUST SKIP
  const opposingObiDecision = evaluateBotSignal(brain, {
    obi: -0.12,
    spreadBps: 1.5,
    rsi14: 58.0,
    emaTrendBps: 15.0,
    momentumSignal: 0.45,
    vwapDeviationPct: 0.35,
    vwapSignal: 0.42,
    atrPct: 0.85,
    sentimentSignal: 0.80,
  });
  assert.equal(opposingObiDecision.action, 'SKIP');

  // Case 2: Overextended above VWAP (+0.83% like UNIUSDT) and RSI 67 without extreme L2 absorption -> MUST SKIP
  const overextendedTopDecision = evaluateBotSignal(brain, {
    obi: 0.25,
    spreadBps: 1.2,
    rsi14: 67.4,
    emaTrendBps: 20.0,
    momentumSignal: 0.65,
    vwapDeviationPct: 0.83,
    vwapSignal: 0.30,
    atrPct: 0.85,
    sentimentSignal: 0.50,
  });
  assert.equal(overextendedTopDecision.action, 'SKIP');
  assert.match(overextendedTopDecision.reasonSummary, /RSI Exhaustion/);
});

test('[Freqtrade Port] checkFreqtradeMinimalRoi and evaluateFreqtradeShouldExit harvest time-decayed ROI and EXIT_SIGNAL reversals', () => {
  const now = 1794025000000;

  // 1. Live UNIUSDT scenario: entry 6.969, current 7.047 (+1.12% move), held 45 minutes -> hits 35m minimal_roi bucket (0.0072)!
  const uniExit = evaluateFreqtradeShouldExit({
    side: 'LONG',
    entryPrice: 6.969,
    currentPrice: 7.047,
    slPrice: 6.8889,
    openedAt: now - 45 * 60 * 1000,
    nowTs: now,
  });
  assert.equal(uniExit.shouldExit, true);
  assert.equal(uniExit.exitType, 'ROI');
  assert.match(uniExit.exitReasonTag, /minimal_roi_35m/);

  // 2. Live BCHUSDT scenario: SHORT entry 263.15, current 261.74 (+0.535% move, net +0.425%), held 140 minutes -> hits 120m minimal_roi bucket (0.0028)!
  const bchExit = evaluateFreqtradeShouldExit({
    side: 'SHORT',
    entryPrice: 263.15,
    currentPrice: 261.74,
    slPrice: 266.18,
    openedAt: now - 140 * 60 * 1000,
    nowTs: now,
  });
  assert.equal(bchExit.shouldExit, true);
  assert.equal(bchExit.exitType, 'ROI');
  assert.match(bchExit.exitReasonTag, /minimal_roi_120m/);

  // 3. EXIT_SIGNAL (`exit_profit_only`): trade held 8 minutes, in +0.55% net profit, but L2 OBI flips to -0.25 and RSI hits 69
  const signalExit = evaluateFreqtradeShouldExit({
    side: 'LONG',
    entryPrice: 100.0,
    currentPrice: 100.7,
    slPrice: 98.8,
    openedAt: now - 8 * 60 * 1000,
    nowTs: now,
    liveFeatures: { obi: -0.25, rsi14: 69.2, momentumSignal: -0.1 },
  });
  assert.equal(signalExit.shouldExit, true);
  assert.equal(signalExit.exitType, 'EXIT_SIGNAL');

  // 4. checkFreqtradeMinimalRoi unit check
  const roiAt20m = checkFreqtradeMinimalRoi(20, 0.011);
  assert.equal(roiAt20m.roiReached, true);
  assert.equal(roiAt20m.matchedBucketMinutes, 15);
});

test('[Freqtrade Port] evaluateLowProfitPairsProtection, applyFreqtradePairlistPipeline, and FreqAI DI_values work accurately', () => {
  const now = 1794025000000;
  const closedTrades = [
    { symbol: 'OPUSDT', netPnlUsdt: -0.16, closedAt: now - 20 * 60 * 1000 },
    { symbol: 'SOLUSDT', netPnlUsdt: 0.24, closedAt: now - 50 * 60 * 1000 },
  ];

  // LowProfitPairs locks OPUSDT because it lost -$0.16 20 minutes ago
  const opLock = evaluateLowProfitPairsProtection({
    symbol: 'OPUSDT',
    closedTrades,
    nowTs: now,
    lookbackMinutes: 360,
    stopDurationMinutes: 90,
  });
  assert.equal(opLock.allowed, false);
  assert.match(opLock.reason!, /LowProfitPairs/);

  // SOLUSDT is allowed (profitable)
  const solLock = evaluateLowProfitPairsProtection({
    symbol: 'SOLUSDT',
    closedTrades,
    nowTs: now,
  });
  assert.equal(solLock.allowed, true);

  // PerformanceFilter ranks SOLUSDT (profitable) first, BTCUSDT (0 trades) second, OPUSDT (losing) last
  const ranked = applyFreqtradePairlistPipeline({
    candidates: ['OPUSDT', 'BTCUSDT', 'SOLUSDT'],
    screenerMeta: [
      { symbol: 'OPUSDT', spreadBps: 1.5, atrPct: 2.1, priceChangePct: 3.0 },
      { symbol: 'BTCUSDT', spreadBps: 0.5, atrPct: 1.8, priceChangePct: 1.5 },
      { symbol: 'SOLUSDT', spreadBps: 1.0, atrPct: 2.4, priceChangePct: 2.2 },
    ],
    closedTrades,
  });
  assert.equal(ranked[0], 'SOLUSDT');
  assert.equal(ranked[1], 'BTCUSDT');
  assert.equal(ranked[2], 'OPUSDT');

  // FreqAI DissimilarityIndex detects extreme feature outlier
  const normalDi = calculateFreqaiDissimilarityIndex({
    obi: 0.28,
    spreadBps: 1.0,
    rsi14: 48,
    emaTrendBps: 12,
    momentumSignal: 0.32,
    vwapDeviationPct: -0.12,
    vwapSignal: -0.15,
    atrPct: 1.8,
    sentimentSignal: 0.25,
  });
  assert.equal(normalDi.doPredict, true);

  const outlierDi = calculateFreqaiDissimilarityIndex({
    obi: -0.85,
    spreadBps: 4.0,
    rsi14: 88,
    emaTrendBps: 45,
    momentumSignal: 0.9,
    vwapDeviationPct: 2.8,
    vwapSignal: 0.9,
    atrPct: 7.5,
    sentimentSignal: 0.1,
  });
  assert.equal(outlierDi.doPredict, false);
});



