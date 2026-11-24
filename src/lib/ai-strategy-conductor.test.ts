import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRATEGY_CATALOG_14,
  detectActiveMarketEvents,
  evaluateBtcBounceShortVeto,
  evaluateSameDirectionCorrelationCap,
  evaluateStrategyDirectionBias,
  evaluateStalePositionExit,
  evaluateUnifiedTradePolicy,
  evaluateCounterTrendDefenseExit,
  rankStrategiesForSnapshot,
  resolveCorrelationCapBySlots,
  buildAiConductorPrompt,
  parseAiConductorResponse,
  applyDeterministicEvolutionFallback,
  applyConductorDecisionToAgents,
  type MarketSnapshotForAi,
  type StrategyPerformanceInput,
} from './ai-strategy-conductor.ts';
import { createDefaultBotBrain } from './bot-learning-math.ts';

test('STRATEGY_CATALOG_14 defines 14 distinct strategies with disciplined risk and realistic TP', () => {
  assert.equal(STRATEGY_CATALOG_14.length, 14);
  const ids = new Set(STRATEGY_CATALOG_14.map((s) => s.agentId));
  assert.equal(ids.size, 14);

  for (const s of STRATEGY_CATALOG_14) {
    assert.ok(s.riskPerTradePct >= 0.8 && s.riskPerTradePct <= 1.5, `${s.agentId} risk must stay <= 1.5%`);
    assert.ok(s.targetTpPct >= 2.2 && s.targetTpPct <= 3.3, `${s.agentId} TP must target 2.2–3.3% (+8.8%..+13.2% ROE at 4x)`);
    assert.ok(s.preferredEvents.length >= 1);
  }
});

test('detectActiveMarketEvents accurately classifies BTC bounce, market flush, macro defense, and range', () => {
  const bounce = detectActiveMarketEvents({
    btcChange24hPct: -3.2,
    btcEmaTrendBps: 8.5,
    btcVwapDevPct: 0.42,
    marketBreadthPct: 42,
    avgAtrPct: 5.1,
    maxCrowdSharePct: 72,
    isMacroBlocked: false,
    isNightSession: false,
  });
  assert.equal(bounce.primaryEvent, 'BTC_BOUNCE_REVERSAL');

  const flush = detectActiveMarketEvents({
    btcChange24hPct: -5.5,
    btcEmaTrendBps: -12,
    btcVwapDevPct: -0.65,
    marketBreadthPct: 18,
    avgAtrPct: 7.4,
    maxCrowdSharePct: 73,
    isMacroBlocked: false,
    isNightSession: false,
  });
  assert.equal(flush.primaryEvent, 'MARKET_FLUSH_SHORT');

  const macro = detectActiveMarketEvents({
    btcChange24hPct: 0.5,
    btcEmaTrendBps: 1.0,
    btcVwapDevPct: 0.05,
    marketBreadthPct: 52,
    avgAtrPct: 3.1,
    maxCrowdSharePct: 68,
    isMacroBlocked: true,
    isNightSession: false,
  });
  assert.equal(macro.primaryEvent, 'MACRO_DEFENSE');

  // Even if 24h change is still green (+2.8%), intraday BTC rollover must NOT stay locked in BULL_EXPANSION
  const intradayRollover = detectActiveMarketEvents({
    btcChange24hPct: 2.8,
    btcEmaTrendBps: -5.4,
    btcVwapDevPct: -0.48,
    marketBreadthPct: 48,
    avgAtrPct: 4.9,
    maxCrowdSharePct: 74,
    isMacroBlocked: false,
    isNightSession: false,
  });
  assert.equal(intradayRollover.primaryEvent, 'MARKET_FLUSH_SHORT');
});

test('evaluateBtcBounceShortVeto blocks altcoin SHORT during BTC recovery while permitting LONG and XAU', () => {
  const vetoSui = evaluateBtcBounceShortVeto({
    symbol: 'SUIUSDT',
    side: 'SHORT',
    btcEmaTrendBps: 6.2,
    btcVwapDevPct: 0.45,
  });
  assert.equal(vetoSui.allowed, false);
  assert.match(vetoSui.reason!, /BTC Bounce Veto/);

  const allowLong = evaluateBtcBounceShortVeto({
    symbol: 'SUIUSDT',
    side: 'LONG',
    btcEmaTrendBps: 6.2,
    btcVwapDevPct: 0.45,
  });
  assert.equal(allowLong.allowed, true);

  const allowGold = evaluateBtcBounceShortVeto({
    symbol: 'XAUUSDT',
    side: 'SHORT',
    btcEmaTrendBps: 6.2,
    btcVwapDevPct: 0.45,
  });
  assert.equal(allowGold.allowed, true);
});

test('evaluateSameDirectionCorrelationCap prevents >2 correlated altcoin positions in one direction', () => {
  const open = [
    { symbol: 'NEARUSDT', side: 'SHORT' as const },
    { symbol: 'SUIUSDT', side: 'SHORT' as const },
    { symbol: 'XAUUSDT', side: 'SHORT' as const },
  ];

  const thirdAltShort = evaluateSameDirectionCorrelationCap({
    symbol: 'SOLUSDT',
    side: 'SHORT',
    activePositions: open,
    maxSameDirectionCrypto: 2,
  });
  assert.equal(thirdAltShort.allowed, false);

  const oppositeLong = evaluateSameDirectionCorrelationCap({
    symbol: 'SOLUSDT',
    side: 'LONG',
    activePositions: open,
    maxSameDirectionCrypto: 2,
  });
  assert.equal(oppositeLong.allowed, true);

  assert.equal(evaluateStrategyDirectionBias('LONG_ONLY', 'SHORT').allowed, false);
  assert.equal(evaluateStrategyDirectionBias('SHORT_ONLY', 'LONG').allowed, false);
  assert.equal(evaluateStrategyDirectionBias('LONG_ONLY', 'LONG').allowed, true);
});

test('parseAiConductorResponse validates Ollama JSON, strips fences, filters unknown IDs, and clamps mutations', () => {
  const snapshot: MarketSnapshotForAi = {
    regimeLabel: 'Отскок BTC',
    primaryEvent: 'BTC_BOUNCE_REVERSAL',
    secondaryEvents: [],
    eventLabelRu: 'Отскок / разворот BTC вверх',
    btcPrice: 59400,
    btcChange24hPct: -2.5,
    btcEmaTrendBps: 7.2,
    btcVwapDevPct: 0.41,
    marketBreadthPct: 48,
    avgAtrPct: 4.8,
    maxCrowdSharePct: 78.2,
    crowdedSymbols: ['DOGEUSDT (78.2% LONG)'],
    isMacroBlocked: false,
    isNightSession: false,
    openPositionsCount: 1,
    workingCapitalUsdt: 300,
  };

  const perfList: StrategyPerformanceInput[] = STRATEGY_CATALOG_14.map((s) => ({
    agentId: s.agentId,
    name: s.name,
    strategyFamily: s.strategyFamily,
    preferredEvents: s.preferredEvents,
    directionBias: s.directionBias,
    isEnabled: s.defaultEnabled,
    tradesCount: 2,
    winRatePct: s.agentId === 'agent-tg-crypto-alpha' ? 50 : 70,
    profitFactor: s.agentId === 'agent-tg-crypto-alpha' ? 0.6 : 1.8,
    realizedPnlUsdt: s.agentId === 'agent-tg-crypto-alpha' ? -1.4 : 0.9,
    riskPerTradePct: s.riskPerTradePct,
    targetTpPct: s.targetTpPct,
    confidenceThreshold: s.confidenceThreshold,
    atrMultiplier: s.atrMultiplier,
    weights: s.weights,
  }));

  const prompt = buildAiConductorPrompt(snapshot, perfList);
  assert.ok(prompt.includes('BTC_BOUNCE_REVERSAL'));
  assert.ok(prompt.includes('strat-btc-bounce-hunter'));

  const rawOllamaOutput = [
    '```json',
    JSON.stringify({
      summary: 'BTC развернулся вверх (+0.41% к VWAP), поэтому переключаемся на отскоковую связку и урезаем риск по шорт-сетке.',
      activeComboIds: [
        'strat-btc-bounce-hunter',
        'agent-lgbm-nightly',
        'strat-crowd-contrarian',
        'strat-gold-safe-haven',
        'non-existent-id',
      ],
      mutations: [
        {
          agentId: 'agent-tg-crypto-alpha',
          reason: 'Повышаем порог после стопа на SUI',
          confidenceThresholdDelta: 0.99,
          riskPerTradePct: 0.1,
          targetTpPct: 4.8,
        },
      ],
    }),
    '```',
  ].join('\n');

  const parsed = parseAiConductorResponse(rawOllamaOutput, perfList, snapshot, {
    modelUsed: 'nemotron-3-nano:30b',
    latencyMs: 640,
    nowTs: 1795270000000,
  });
  assert.ok(parsed);
  assert.equal(parsed.source, 'OLLAMA_AI');
  assert.deepEqual(parsed.activeComboIds, [
    'strat-btc-bounce-hunter',
    'agent-lgbm-nightly',
    'strat-crowd-contrarian',
    'strat-gold-safe-haven',
  ]);
  assert.equal(parsed.mutations.length, 1);
  // Clamped safely inside [ -0.03, 0.03 ], [ 0.8, 1.5 ], and [ 2.2, 3.5 ]
  assert.equal(parsed.mutations[0].confidenceThresholdDelta, 0.03);
  assert.equal(parsed.mutations[0].riskPerTradePct, 0.8);
  assert.equal(parsed.mutations[0].targetTpPct, 3.5);
});

test('applyDeterministicEvolutionFallback and applyConductorDecisionToAgents update active combo and mutate weak bots', () => {
  const snapshot: MarketSnapshotForAi = {
    regimeLabel: 'Отскок BTC',
    primaryEvent: 'BTC_BOUNCE_REVERSAL',
    secondaryEvents: ['CROWD_EUPHORIA_COUNTER'],
    eventLabelRu: 'Отскок / разворот BTC вверх',
    btcPrice: 59500,
    btcChange24hPct: -1.8,
    btcEmaTrendBps: 9.0,
    btcVwapDevPct: 0.55,
    marketBreadthPct: 50,
    avgAtrPct: 4.5,
    maxCrowdSharePct: 79.0,
    crowdedSymbols: ['DOGEUSDT (79.0% LONG)'],
    isMacroBlocked: false,
    isNightSession: false,
    openPositionsCount: 1,
    workingCapitalUsdt: 300,
  };

  const agents = STRATEGY_CATALOG_14.map((s) => ({
    ...s,
    isEnabled: s.defaultEnabled,
    mutationCount: 0,
    lastMutatedReason: undefined as string | undefined,
    lastMutatedAt: undefined as number | undefined,
    brain: createDefaultBotBrain('ONNX_RL', s.agentId),
  }));

  const perfList: StrategyPerformanceInput[] = agents.map((a) => ({
    agentId: a.agentId,
    name: a.name,
    strategyFamily: a.strategyFamily,
    preferredEvents: a.preferredEvents,
    directionBias: a.directionBias,
    isEnabled: Boolean(a.isEnabled),
    tradesCount: a.agentId === 'agent-onnx-ppo-v2' ? 3 : 0,
    winRatePct: a.agentId === 'agent-onnx-ppo-v2' ? 33 : 0,
    profitFactor: a.agentId === 'agent-onnx-ppo-v2' ? 0.45 : 0,
    realizedPnlUsdt: a.agentId === 'agent-onnx-ppo-v2' ? -1.89 : 0,
    riskPerTradePct: a.riskPerTradePct,
    targetTpPct: a.targetTpPct,
    confidenceThreshold: a.brain.confidenceThreshold,
    atrMultiplier: a.brain.atrMultiplier,
    weights: a.brain.weights,
  }));

  const fallback = applyDeterministicEvolutionFallback(snapshot, perfList, { nowTs: 1795271000000 });
  assert.equal(fallback.source, 'QUANT_FALLBACK');
  assert.equal(fallback.activeComboIds.length, 4);
  assert.ok(fallback.activeComboIds.includes('strat-btc-bounce-hunter'));
  assert.ok(!fallback.activeComboIds.includes('strat-trend-flush-rider'));

  const applied = applyConductorDecisionToAgents(agents, fallback);
  assert.ok(applied.updatedCount > 0);
  assert.ok(applied.mutatedIds.includes('agent-onnx-ppo-v2'));

  const mutatedBot = agents.find((a) => a.agentId === 'agent-onnx-ppo-v2')!;
  assert.equal(mutatedBot.mutationCount, 1);
  assert.ok(mutatedBot.riskPerTradePct < 1.4);
  assert.ok(mutatedBot.brain.confidenceThreshold > 0.2);
  assert.ok(mutatedBot.lastMutatedReason);

  const enabledCount = agents.filter((a) => a.isEnabled).length;
  assert.equal(enabledCount, 4);

  // Repeated fallback cycle WITHOUT any new closed trade must NOT mutate again
  const perfAfterMutation: StrategyPerformanceInput[] = agents.map((a) => ({
    agentId: a.agentId,
    name: a.name,
    strategyFamily: a.strategyFamily,
    preferredEvents: a.preferredEvents,
    directionBias: a.directionBias,
    isEnabled: Boolean(a.isEnabled),
    tradesCount: a.agentId === 'agent-onnx-ppo-v2' ? 3 : 0,
    winRatePct: a.agentId === 'agent-onnx-ppo-v2' ? 33 : 0,
    profitFactor: a.agentId === 'agent-onnx-ppo-v2' ? 0.45 : 0,
    realizedPnlUsdt: a.agentId === 'agent-onnx-ppo-v2' ? -1.89 : 0,
    riskPerTradePct: a.riskPerTradePct,
    targetTpPct: a.targetTpPct,
    confidenceThreshold: a.brain.confidenceThreshold,
    atrMultiplier: a.brain.atrMultiplier,
    weights: a.brain.weights,
    lastMutatedAt: a.lastMutatedAt,
    latestTradeClosedAt: a.agentId === 'agent-onnx-ppo-v2' ? 1795270500000 : undefined,
  }));
  const repeatFallback = applyDeterministicEvolutionFallback(snapshot, perfAfterMutation, {
    nowTs: 1795272200000,
  });
  assert.equal(repeatFallback.mutations.length, 0);
});

test('resolveCorrelationCapBySlots and evaluateStalePositionExit prevent multi-day slot lockups', () => {
  assert.equal(resolveCorrelationCapBySlots(5, false), 3);
  assert.equal(resolveCorrelationCapBySlots(4, false), 3);
  assert.equal(resolveCorrelationCapBySlots(4, true), 2);
  assert.equal(resolveCorrelationCapBySlots(3, true), 2);
  assert.equal(resolveCorrelationCapBySlots(2, false), 2);

  const now = 1795341600000;
  // 18h held near-flat ETHUSDT (+0.28%) should rotate out to free slot
  const ethFlatStale = evaluateStalePositionExit({
    symbol: 'ETHUSDT',
    side: 'LONG',
    entryPrice: 1681.2,
    currentPrice: 1686.0,
    openedAt: now - 18 * 3600 * 1000,
    nowTs: now,
    primaryEvent: 'BULL_EXPANSION',
  });
  assert.equal(ethFlatStale.shouldExit, true);

  // 40h held XAUUSDT SHORT during BULL_EXPANSION (-0.54%) should rotate out
  const xauCounterStale = evaluateStalePositionExit({
    symbol: 'XAUUSDT',
    side: 'SHORT',
    entryPrice: 3544.9,
    currentPrice: 3564.0,
    openedAt: now - 40 * 3600 * 1000,
    nowTs: now,
    primaryEvent: 'BULL_EXPANSION',
  });
  assert.equal(xauCounterStale.shouldExit, true);

  // Fresh 2h trade must stay open
  const freshTrade = evaluateStalePositionExit({
    symbol: 'SOLUSDT',
    side: 'LONG',
    entryPrice: 100,
    currentPrice: 100.2,
    openedAt: now - 2 * 3600 * 1000,
    nowTs: now,
    primaryEvent: 'BULL_EXPANSION',
  });
  assert.equal(freshTrade.shouldExit, false);
});

test('parseAiConductorResponse guarantees at least 3 strategies when LLM returns only 2', () => {
  const snapshot: MarketSnapshotForAi = {
    regimeLabel: 'Бычий тренд',
    primaryEvent: 'BULL_EXPANSION',
    secondaryEvents: [],
    eventLabelRu: 'Устойчивый бычий тренд / альт-ралли',
    btcPrice: 68500,
    btcChange24hPct: 2.1,
    btcEmaTrendBps: 9.0,
    btcVwapDevPct: 0.45,
    marketBreadthPct: 68,
    avgAtrPct: 4.5,
    maxCrowdSharePct: 74,
    crowdedSymbols: [],
    isMacroBlocked: false,
    isNightSession: false,
    openPositionsCount: 4,
    workingCapitalUsdt: 300,
  };

  const perfList: StrategyPerformanceInput[] = STRATEGY_CATALOG_14.map((s) => ({
    agentId: s.agentId,
    name: s.name,
    strategyFamily: s.strategyFamily,
    preferredEvents: s.preferredEvents,
    directionBias: s.directionBias,
    isEnabled: s.defaultEnabled,
    tradesCount: 0,
    winRatePct: 0,
    profitFactor: 1.5,
    realizedPnlUsdt: 0,
    riskPerTradePct: s.riskPerTradePct,
    targetTpPct: s.targetTpPct,
    confidenceThreshold: s.confidenceThreshold,
    atrMultiplier: s.atrMultiplier,
    weights: s.weights,
  }));

  const twoOnlyJson = JSON.stringify({
    summary: 'Выбраны две трендовые стратегии.',
    activeComboIds: ['strat-bull-breakout-pro', 'strat-alt-rotation-alpha'],
    mutations: [],
  });

  const parsed = parseAiConductorResponse(twoOnlyJson, perfList, snapshot, {
    modelUsed: 'GigaChat-2:2.0.28.2',
    latencyMs: 1650,
    source: 'GIGACHAT_AI',
  });
  assert.ok(parsed);
  assert.equal(parsed.activeComboIds.length, 3);
  assert.equal(parsed.activeComboIds[0], 'strat-bull-breakout-pro');
  assert.equal(parsed.activeComboIds[1], 'strat-alt-rotation-alpha');
  assert.equal(new Set(parsed.activeComboIds).size, 3);
});

test('evaluateUnifiedTradePolicy & evaluateCounterTrendDefenseExit enforce Rules + Settings + News + AI Policy', () => {
  // 1. During MARKET_FLUSH_SHORT, counter-trend LONG crypto entries must be blocked (unless strong BTC recovery or XAU)
  const blockKnifeLong = evaluateUnifiedTradePolicy({
    symbol: 'SUIUSDT',
    side: 'LONG',
    strategyId: 'agent-lgbm-nightly',
    strategyName: 'Momentum',
    directionBias: 'BOTH',
    primaryEvent: 'MARKET_FLUSH_SHORT',
    aiAllowedDirectionMode: 'SHORT_PREFERRED',
    btcEmaTrendBps: -4.2,
    btcVwapDevPct: -0.35,
    macroBlocked: false,
    goldAllowed: true,
  });
  assert.equal(blockKnifeLong.allowed, false);
  assert.equal(blockKnifeLong.vetoSource, 'AI_POLICY');

  // 2. Same flush allows SHORT and defensive XAUUSDT
  const allowFlushShort = evaluateUnifiedTradePolicy({
    symbol: 'SUIUSDT',
    side: 'SHORT',
    strategyId: 'strat-trend-flush-rider',
    strategyName: 'Flush-Rider',
    directionBias: 'SHORT_ONLY',
    primaryEvent: 'MARKET_FLUSH_SHORT',
    aiAllowedDirectionMode: 'SHORT_PREFERRED',
    btcEmaTrendBps: -4.2,
    btcVwapDevPct: -0.35,
    macroBlocked: false,
    goldAllowed: true,
  });
  assert.equal(allowFlushShort.allowed, true);

  const allowGoldInFlush = evaluateUnifiedTradePolicy({
    symbol: 'XAUUSDT',
    side: 'LONG',
    strategyId: 'strat-gold-safe-haven',
    strategyName: 'Aurum-Shield',
    directionBias: 'BOTH',
    primaryEvent: 'MARKET_FLUSH_SHORT',
    aiAllowedDirectionMode: 'SHORT_PREFERRED',
    btcEmaTrendBps: -4.2,
    btcVwapDevPct: -0.35,
    macroBlocked: false,
    goldAllowed: true,
  });
  assert.equal(allowGoldInFlush.allowed, true);

  // 3. Respects user settings (goldAllowed: false) and critical symbol news
  const blockedGoldSetting = evaluateUnifiedTradePolicy({
    symbol: 'XAUUSDT',
    side: 'LONG',
    strategyId: 'strat-gold-safe-haven',
    strategyName: 'Aurum-Shield',
    primaryEvent: 'LOW_VOL_RANGE',
    btcEmaTrendBps: 0,
    btcVwapDevPct: 0,
    macroBlocked: false,
    goldAllowed: false,
  });
  assert.equal(blockedGoldSetting.allowed, false);
  assert.equal(blockedGoldSetting.vetoSource, 'SETTINGS');

  const blockedCriticalNews = evaluateUnifiedTradePolicy({
    symbol: 'LINKUSDT',
    side: 'LONG',
    strategyId: 'agent-onnx-ppo-v2',
    strategyName: 'Delta-L2',
    primaryEvent: 'LOW_VOL_RANGE',
    btcEmaTrendBps: 1.0,
    btcVwapDevPct: 0.1,
    macroBlocked: false,
    goldAllowed: true,
    hasCriticalRiskNewsOnSymbol: true,
    criticalRiskTag: 'CRITICAL_SECURITY_OR_DELIST_RISK',
  });
  assert.equal(blockedCriticalNews.allowed, false);
  assert.equal(blockedCriticalNews.vetoSource, 'NEWS');

  // 4. Open counter-trend LONG in MARKET_FLUSH_SHORT blocks DCA and exits gracefully near breakeven after >=20m
  const now = 1795456989000;
  const softExitDefense = evaluateCounterTrendDefenseExit({
    symbol: 'DOTUSDT',
    side: 'LONG',
    entryPrice: 1.0,
    currentPrice: 1.003,
    openedAt: now - 35 * 60000,
    nowTs: now,
    primaryEvent: 'MARKET_FLUSH_SHORT',
  });
  assert.equal(softExitDefense.blockDca, true);
  assert.equal(softExitDefense.shouldExit, true);

  // Deep loss (-1.5%) does NOT panic-close and keeps DCA blocked while letting hard SL handle risk
  const deepHoldDefense = evaluateCounterTrendDefenseExit({
    symbol: 'DOTUSDT',
    side: 'LONG',
    entryPrice: 1.0,
    currentPrice: 0.985,
    openedAt: now - 35 * 60000,
    nowTs: now,
    primaryEvent: 'MARKET_FLUSH_SHORT',
  });
  assert.equal(deepHoldDefense.blockDca, true);
  assert.equal(deepHoldDefense.shouldExit, false);

  // 5. rankStrategiesForSnapshot puts Flush-Rider ahead of Bounce-Hunter during MARKET_FLUSH_SHORT and injects news into prompt
  const flushSnap: MarketSnapshotForAi = {
    regimeLabel: 'Пролив',
    primaryEvent: 'MARKET_FLUSH_SHORT',
    secondaryEvents: [],
    eventLabelRu: 'Общерыночный пролив и давление продаж',
    btcPrice: 60100,
    btcChange24hPct: -4.2,
    btcEmaTrendBps: -7.5,
    btcVwapDevPct: -0.45,
    marketBreadthPct: 24,
    avgAtrPct: 5.5,
    maxCrowdSharePct: 72,
    crowdedSymbols: [],
    isMacroBlocked: false,
    isNightSession: false,
    openPositionsCount: 2,
    workingCapitalUsdt: 300,
    newsBiasScore: -0.75,
    recentNewsSummary: [
      { source: '@WatcherGuru', symbol: 'BTCUSDT', sentiment: 'BEARISH', headline: 'Crypto continues to crash' },
    ],
  };
  const perfAll: StrategyPerformanceInput[] = STRATEGY_CATALOG_14.map((s) => ({
    ...s,
    isEnabled: s.defaultEnabled,
    tradesCount: 0,
    winRatePct: 0,
    profitFactor: 1.5,
    realizedPnlUsdt: 0,
  }));
  const rankedFlush = rankStrategiesForSnapshot(flushSnap, perfAll);
  const topIds = rankedFlush.slice(0, 4).map((s) => s.agentId);
  assert.ok(topIds.includes('strat-trend-flush-rider'));
  assert.ok(!topIds.includes('strat-btc-bounce-hunter'));
  assert.ok(buildAiConductorPrompt(flushSnap, perfAll).includes('@WatcherGuru'));
});


