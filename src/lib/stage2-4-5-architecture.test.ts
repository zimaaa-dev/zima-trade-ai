import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultVirtualPortfolios,
  validatePortfolioAllocations,
  syncPortfoliosWithAccount,
  applyVirtualPortfolioTradeClose,
  resolvePortfolioIdForStrategy,
} from './virtual-portfolio.ts';
import {
  createPortfolioLedgerEntry,
  verifyPortfoliosReconcileWithAccount,
} from './portfolio-ledger.ts';
import {
  checkOwnershipForEntry,
  acquirePositionOwnership,
  authorizePositionClose,
  releasePositionOwnership,
  type PositionOwnershipRecord,
} from './position-ownership.ts';
import {
  evaluateGlobalRiskGate,
  resolveKillSwitchPolicyAction,
} from './global-risk-manager.ts';
import { buildRuntimeSafetyConfig } from './runtime-config.ts';
import {
  buildMtfContextSnapshot,
  canStrategyTradeUnderMtf,
  aggregateBarsToTimeframe,
} from './mtf-context.ts';
import {
  validateAiCoordinatorContractV1,
  selectConflictWinnerCandidate,
  type StrategySignalCandidate,
} from './strategy-contracts.ts';
import {
  createDefaultShadowCandidates,
  simulateShadowTradeResult,
  evaluateShadowCandidate,
  type ShadowTradeRecord,
} from './shadow-learning.ts';
import type { KlineBar } from './bot-learning-math.ts';

function makeClosedBars(count: number, stepMs: number, endTs: number, startPrice = 60000, driftPerBar = 25): KlineBar[] {
  const bars: KlineBar[] = [];
  const startTs = endTs - (count + 1) * stepMs;
  for (let i = 0; i < count; i++) {
    const open = startPrice + i * driftPerBar;
    const close = open + driftPerBar;
    bars.push({
      timestamp: startTs + i * stepMs,
      open,
      high: Math.max(open, close) + 40,
      low: Math.min(open, close) - 40,
      close,
      volume: 100 + i,
      turnover: (100 + i) * close,
    });
  }
  return bars;
}

test('Stage 2: Virtual Portfolios allocate 100% of single OKX account without inflating capital and reconcile with ledger', () => {
  const portfolios = createDefaultVirtualPortfolios(1000, 1000000);
  const val = validatePortfolioAllocations(portfolios.map((p) => ({ id: p.id, allocationPct: p.allocationPct })));
  assert.equal(val.valid, true);
  assert.equal(val.totalPct, 100);

  const over = validatePortfolioAllocations([
    { id: 'a', allocationPct: 60 },
    { id: 'b', allocationPct: 50 },
  ]);
  assert.equal(over.valid, false);

  assert.equal(resolvePortfolioIdForStrategy('agent-onnx-ppo-v2'), 'vp-order-flow');
  assert.equal(resolvePortfolioIdForStrategy('strat-btc-bounce-hunter'), 'vp-mean-reversion');

  const synced = syncPortfoliosWithAccount({
    portfolios,
    totalAccountCapitalUsdt: 1000,
    activePositions: [
      {
        symbol: 'BTCUSDT',
        botId: 'agent-onnx-ppo-v2',
        virtualPortfolioId: 'vp-order-flow',
        qty: 0.01,
        entryVwap: 60000,
        leverage: 4,
        unrealizedPnl: 12.5,
      },
    ],
  });

  const orderFlow = synced.find((p) => p.id === 'vp-order-flow')!;
  assert.equal(orderFlow.allocatedCapitalUsdt, 150);
  assert.equal(orderFlow.reservedMarginUsdt, 150);
  assert.equal(orderFlow.freeCapitalUsdt, 0);
  assert.equal(orderFlow.unrealizedPnlUsdt, 12.5);

  const afterClose = applyVirtualPortfolioTradeClose({
    portfolios: synced,
    portfolioId: 'vp-order-flow',
    strategyId: 'agent-onnx-ppo-v2',
    symbol: 'BTCUSDT',
    realizedNetPnlUsdt: 18.0,
    feeUsdt: 0.6,
    fundingUsdt: 0,
  });

  const resynced = syncPortfoliosWithAccount({
    portfolios: afterClose,
    totalAccountCapitalUsdt: 1000,
    activePositions: [],
  });

  const recon = verifyPortfoliosReconcileWithAccount({
    portfolios: resynced,
    totalAccountCapitalUsdt: 1000,
  });
  assert.equal(recon.reconciled, true);
  assert.equal(recon.sumRealizedPnlUsdt, 18);

  const led = createPortfolioLedgerEntry({
    virtualPortfolioId: 'vp-order-flow',
    strategyId: 'agent-onnx-ppo-v2',
    symbol: 'BTCUSDT',
    eventType: 'REALIZED_PNL',
    amountUsdt: 18,
    balanceAfterUsdt: 168,
    description: 'Closed BTCUSDT TP',
  });
  assert.equal(led.amountUsdt, 18);
});

test('Stage 2: Position Ownership enforces single owner per symbol in net_mode and blocks cross-bot close', () => {
  let ownership: PositionOwnershipRecord[] = [];
  const check1 = checkOwnershipForEntry({
    ownershipRecords: ownership,
    symbol: 'BTCUSDT',
    side: 'LONG',
    strategyId: 'bot-a',
    portfolioId: 'vp-trend-momentum',
    okxPosMode: 'net_mode',
  });
  assert.equal(check1.allowed, true);

  ownership = acquirePositionOwnership(ownership, {
    symbol: 'BTCUSDT',
    side: 'LONG',
    ownerStrategyId: 'bot-a',
    ownerPortfolioId: 'vp-trend-momentum',
    clientOrderId: 'cl-1',
  });

  // Bot B cannot open same or opposite side on BTCUSDT in net_mode
  const check2 = checkOwnershipForEntry({
    ownershipRecords: ownership,
    symbol: 'BTCUSDT',
    side: 'SHORT',
    strategyId: 'bot-b',
    portfolioId: 'vp-mean-reversion',
    okxPosMode: 'net_mode',
  });
  assert.equal(check2.allowed, false);
  assert.match(check2.reason!, /SYMBOL_OWNED_IN_NET_MODE/);

  // Bot B cannot close Bot A's position
  const closeBlocked = authorizePositionClose({
    ownershipRecords: ownership,
    symbol: 'BTCUSDT',
    side: 'LONG',
    requesterStrategyId: 'bot-b',
  });
  assert.equal(closeBlocked.allowed, false);
  assert.match(closeBlocked.reason!, /OWNERSHIP_MISMATCH_CLOSE_BLOCKED/);

  // Owner or Risk/Operator override can close
  assert.equal(
    authorizePositionClose({
      ownershipRecords: ownership,
      symbol: 'BTCUSDT',
      side: 'LONG',
      requesterStrategyId: 'bot-a',
    }).allowed,
    true
  );
  assert.equal(
    authorizePositionClose({
      ownershipRecords: ownership,
      symbol: 'BTCUSDT',
      side: 'LONG',
      requesterStrategyId: 'kill-switch',
      isRiskOrOperatorOverride: true,
    }).allowed,
    true
  );

  ownership = releasePositionOwnership(ownership, 'BTCUSDT', 'LONG');
  assert.equal(ownership.length, 0);
});

test('Stage 2: Global Risk Manager enforces trial limits, portfolio margin, and Kill-Switch mode separation', () => {
  const cfg = buildRuntimeSafetyConfig({ activeExchange: 'OKX', mode: 'LIVE', okxDemoTrading: false });
  const portfolios = createDefaultVirtualPortfolios(1000);
  const trendVp = portfolios.find((p) => p.id === 'vp-trend-momentum')!; // $250 free

  // Reject DCA
  const dcaReject = evaluateGlobalRiskGate({
    mode: 'LIVE',
    runtimePhase: 'READY',
    runtimeSafetyConfig: cfg,
    isKillSwitchActive: false,
    totalAccountCapitalUsdt: 1000,
    rolling24hDrawdownPct: 0,
    portfolio: trendVp,
    activePositions: [],
    candidate: {
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryPrice: 60000,
      stopLossPrice: 59000,
      qty: 0.004,
      requestedLeverage: 4,
      isDcaAddOrder: true,
    },
  });
  assert.equal(dcaReject.allowed, false);
  assert.equal(dcaReject.rejectCode, 'DCA_DISABLED_BY_SYSTEM_POLICY');

  // Reject when cumulative open stop-risk > 2.0% in real LIVE
  const riskCapReject = evaluateGlobalRiskGate({
    mode: 'LIVE',
    runtimePhase: 'READY',
    runtimeSafetyConfig: cfg,
    isKillSwitchActive: false,
    totalAccountCapitalUsdt: 1000,
    rolling24hDrawdownPct: 0,
    portfolio: trendVp,
    activePositions: [
      { symbol: 'ETHUSDT', side: 'LONG', qty: 0.25, entryVwap: 2000, slPrice: 1930, leverage: 4 }, // ~1.8% risk
    ],
    candidate: {
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryPrice: 60000,
      stopLossPrice: 59000,
      qty: 0.004, // ~$4.3 risk = 0.43% -> total > 2.0%
      requestedLeverage: 4,
    },
  });
  assert.equal(riskCapReject.allowed, false);
  assert.equal(riskCapReject.rejectCode, 'TOTAL_OPEN_STOP_RISK_LIMIT_EXCEEDED');

  const ksBlock = resolveKillSwitchPolicyAction('BLOCK_NEW_ENTRIES_ONLY');
  assert.equal(ksBlock.blockNewEntries, true);
  assert.equal(ksBlock.emergencyCloseOpenPositions, false);
});

test('Stage 4: MTF Context Service checks closed bars 1m-1D and allows Mean Reversion unless extreme trend', () => {
  const nowTs = Date.UTC(2026, 10, 25, 12, 0, 0);
  const bars1m = makeClosedBars(120, 60 * 1000, nowTs, 60000, 0.5);
  const mtfModerate = buildMtfContextSnapshot({
    symbol: 'BTCUSDT',
    nowTs,
    barsByTf: {
      '1m': bars1m,
      '5m': aggregateBarsToTimeframe(bars1m, 5),
      '15m': makeClosedBars(20, 15 * 60 * 1000, nowTs, 59800, 10),
      '1H': makeClosedBars(16, 60 * 60 * 1000, nowTs, 59500, 22),
      '4H': makeClosedBars(10, 4 * 60 * 60 * 1000, nowTs, 59000, 35),
      '1D': makeClosedBars(6, 24 * 60 * 60 * 1000, nowTs, 58000, 90),
    },
  });

  assert.equal(mtfModerate.dataSufficiencyOk, true);
  assert.equal(mtfModerate.primaryTrend4h, 'BULLISH');
  assert.equal(
    canStrategyTradeUnderMtf({ mtf: mtfModerate, side: 'SHORT', isMeanReversionStrategy: false }).allowed,
    false
  );
  assert.equal(
    canStrategyTradeUnderMtf({ mtf: mtfModerate, side: 'SHORT', isMeanReversionStrategy: true }).allowed,
    true
  );

  // Extreme trend blocks Mean Reversion counter-trend
  const mtfExtreme = buildMtfContextSnapshot({
    symbol: 'BTCUSDT',
    nowTs,
    barsByTf: {
      '1m': bars1m,
      '5m': aggregateBarsToTimeframe(bars1m, 5),
      '15m': makeClosedBars(20, 15 * 60 * 1000, nowTs, 59500, 25),
      '1H': makeClosedBars(16, 60 * 60 * 1000, nowTs, 59000, 80),
      '4H': makeClosedBars(10, 4 * 60 * 60 * 1000, nowTs, 58000, 220),
      '1D': makeClosedBars(6, 24 * 60 * 60 * 1000, nowTs, 55000, 450),
    },
  });
  assert.equal(mtfExtreme.allowCounterTrendMeanReversion, false);
  assert.equal(
    canStrategyTradeUnderMtf({ mtf: mtfExtreme, side: 'SHORT', isMeanReversionStrategy: true }).allowed,
    false
  );

  // Insufficient bars rejected
  const badMtf = buildMtfContextSnapshot({ symbol: 'BTCUSDT', nowTs, barsByTf: { '1m': bars1m.slice(0, 3) } });
  assert.equal(badMtf.dataSufficiencyOk, false);
});

test('Stage 4: AI Coordinator Contract V1 rejects DCA/risk-limit escalation and picks conflict winner', () => {
  const badContract = validateAiCoordinatorContractV1({
    dcaEnabled: true,
    mutations: [{ agentId: 'bot-a', riskPerTradePct: 3.5 }],
  });
  assert.equal(badContract.valid, false);
  assert.ok(badContract.errors.includes('DCA_FORBIDDEN_IN_AI_CONTRACT'));

  const goodContract = validateAiCoordinatorContractV1({
    primaryEvent: 'LOW_VOL_RANGE',
    allowedDirectionMode: 'BOTH',
    selectedComboIds: ['agent-onnx-ppo-v2'],
    mutations: [{ agentId: 'agent-onnx-ppo-v2', reason: 'Tighten threshold', confidenceThresholdDelta: 0.02 }],
  });
  assert.equal(goodContract.valid, true);
  assert.equal(goodContract.contract?.schemaVersion, '1.0');

  const c1: StrategySignalCandidate = {
    strategyId: 'bot-a',
    strategyName: 'Bot A',
    strategyFamily: 'L2',
    virtualPortfolioId: 'vp-order-flow',
    symbol: 'BTCUSDT',
    side: 'LONG',
    confidence: 0.72,
    entryPrice: 60000,
    stopLossPrice: 59000,
    tpPrices: [61500],
    expectedStopRiskPct: 0.4,
    mtfSummary: {
      globalMacroBias: 'BULLISH',
      primaryTrend4h: 'BULLISH',
      structure1h: 'BULLISH',
      setup15m: 'BULLISH',
      confirm5m: 'BULLISH',
      alignmentScore: 0.9,
    },
    reasonSummary: 'Strong L2 bid',
    generatedAt: Date.now(),
  };
  const c2: StrategySignalCandidate = { ...c1, strategyId: 'bot-b', confidence: 0.58 };
  const winnerRes = selectConflictWinnerCandidate([c2, c1]);
  assert.equal(winnerRes.winner?.strategyId, 'bot-a');
  assert.equal(winnerRes.rejected.length, 1);
});

test('Stage 5: Shadow Learning separates candidate evaluation and never auto-mutates Production', () => {
  const candidates = createDefaultShadowCandidates(1000000);
  const cand = candidates[0];
  const trades: ShadowTradeRecord[] = [];
  for (let i = 0; i < 32; i++) {
    const isWin = i % 3 !== 0;
    trades.push(
      simulateShadowTradeResult({
        candidate: cand,
        symbol: 'BTCUSDT',
        side: 'LONG',
        regime: i % 2 === 0 ? 'BULL_EXPANSION' : 'LOW_VOL_RANGE',
        entryPrice: 60000,
        exitPrice: isWin ? 60900 : 59600,
        qty: 0.01,
        isOutOfSample: i >= 16,
        closedAt: 1000000 + i * 60000,
      })
    );
  }

  const report = evaluateShadowCandidate({ candidate: cand, trades });
  assert.equal(report.tradesCount, 32);
  assert.equal(report.promotionEligible, true);
  assert.equal(report.recommendation, 'KEEP');
  assert.equal(report.autoAppliedToProduction, false);
});
