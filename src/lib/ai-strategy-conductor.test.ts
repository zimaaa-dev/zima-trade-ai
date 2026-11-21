import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRATEGY_CATALOG_14,
  detectActiveMarketEvents,
  evaluateBtcBounceShortVeto,
  evaluateSameDirectionCorrelationCap,
  evaluateStrategyDirectionBias,
  buildAiConductorPrompt,
  parseAiConductorResponse,
  applyDeterministicEvolutionFallback,
  applyConductorDecisionToAgents,
  type MarketSnapshotForAi,
  type StrategyPerformanceInput,
} from './ai-strategy-conductor.ts';
import { createDefaultBotBrain } from './bot-learning-math.ts';

test('STRATEGY_CATALOG_14 defines 14 distinct strategies with disciplined risk and balanced TP', () => {
  assert.equal(STRATEGY_CATALOG_14.length, 14);
  const ids = new Set(STRATEGY_CATALOG_14.map((s) => s.agentId));
  assert.equal(ids.size, 14);

  for (const s of STRATEGY_CATALOG_14) {
    assert.ok(s.riskPerTradePct >= 0.8 && s.riskPerTradePct <= 1.5, `${s.agentId} risk must stay <= 1.5%`);
    assert.ok(s.targetTpPct >= 1.8 && s.targetTpPct <= 2.4, `${s.agentId} TP must stay balanced 1.8–2.4%`);
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
          targetTpPct: 2.2,
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
  // Clamped safely inside [ -0.03, 0.03 ] and [ 0.8, 1.6 ]
  assert.equal(parsed.mutations[0].confidenceThresholdDelta, 0.03);
  assert.equal(parsed.mutations[0].riskPerTradePct, 0.8);
  assert.equal(parsed.mutations[0].targetTpPct, 2.2);
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
});
