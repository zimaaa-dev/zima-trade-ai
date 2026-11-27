export interface ShadowPromotionThresholds {
  minTrades: number;
  minProfitFactor: number;
  maxDrawdownPct: number;
  minExpectancyUsdt: number;
  minRegimesCovered: number;
  requireOutOfSamplePass: boolean;
}

export const DEFAULT_SHADOW_THRESHOLDS: ShadowPromotionThresholds = {
  minTrades: 30,
  minProfitFactor: 1.25,
  maxDrawdownPct: 6.0,
  minExpectancyUsdt: 0,
  minRegimesCovered: 2,
  requireOutOfSamplePass: true,
};

export interface ShadowCandidate {
  id: string;
  baseStrategyId: string;
  baseStrategyName: string;
  versionLabel: string;
  params: {
    confidenceThreshold: number;
    atrMultiplier: number;
    targetTpPct: number;
    leverage: number;
    dcaEnabled: false;
  };
  status: 'TESTING' | 'RECOMMEND_KEEP' | 'RECOMMEND_REJECT' | 'NEEDS_MORE_DATA';
  autoApplyAllowed: false;
  createdAt: number;
  updatedAt: number;
}

export interface ShadowTradeRecord {
  id: string;
  candidateId: string;
  baseStrategyId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  regime: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  feeUsdt: number;
  fundingUsdt: number;
  slippagePct: number;
  simulatedLatencyMs: number;
  netPnlUsdt: number;
  isOutOfSample: boolean;
  openedAt: number;
  closedAt: number;
}

export interface ShadowEvaluationReport {
  id: string;
  candidateId: string;
  baseStrategyId: string;
  evaluatedAt: number;
  tradesCount: number;
  outOfSampleTradesCount: number;
  regimesCovered: string[];
  netPnlUsdt: number;
  netPnlAfterFeesAndFundingUsdt: number;
  maxDrawdownPct: number;
  profitFactor: number;
  expectancyUsdt: number;
  regimeStabilityScore: number;
  outOfSamplePassed: boolean;
  promotionEligible: boolean;
  autoAppliedToProduction: false;
  recommendation: 'KEEP' | 'REJECT' | 'EXTEND_TEST';
  blockingReasons: string[];
}

export function createDefaultShadowCandidates(nowTs: number = Date.now()): ShadowCandidate[] {
  return [
    {
      id: 'cand-delta-l2-v3',
      baseStrategyId: 'agent-onnx-ppo-v2',
      baseStrategyName: 'Delta-L2 · Стакан и Объемы',
      versionLabel: 'v3-tight-obi-shadow',
      params: {
        confidenceThreshold: 0.24,
        atrMultiplier: 1.35,
        targetTpPct: 2.6,
        leverage: 4,
        dcaEnabled: false,
      },
      status: 'TESTING',
      autoApplyAllowed: false,
      createdAt: nowTs,
      updatedAt: nowTs,
    },
    {
      id: 'cand-momentum-v3',
      baseStrategyId: 'agent-lgbm-nightly',
      baseStrategyName: 'Momentum · Импульсный Скальпер',
      versionLabel: 'v3-mtf-aligned-shadow',
      params: {
        confidenceThreshold: 0.25,
        atrMultiplier: 1.4,
        targetTpPct: 3.0,
        leverage: 4,
        dcaEnabled: false,
      },
      status: 'TESTING',
      autoApplyAllowed: false,
      createdAt: nowTs,
      updatedAt: nowTs,
    },
  ];
}

export function simulateShadowTradeResult(params: {
  candidate: ShadowCandidate;
  symbol: string;
  side: 'LONG' | 'SHORT';
  regime: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  slippagePct?: number;
  fundingUsdt?: number;
  simulatedLatencyMs?: number;
  isOutOfSample?: boolean;
  openedAt?: number;
  closedAt?: number;
}): ShadowTradeRecord {
  const nowTs = params.closedAt ?? Date.now();
  const openedAt = params.openedAt ?? nowTs - 600000;
  const slip = Math.max(0, params.slippagePct ?? 0.0003);
  const dir = params.side === 'LONG' ? 1 : -1;
  const effectiveEntry = params.entryPrice * (1 + dir * slip);
  const effectiveExit = params.exitPrice * (1 - dir * slip);
  const gross = (effectiveExit - effectiveEntry) * params.qty * dir;
  // OKX taker 0.05% each side = 0.10% round-trip
  const feeUsdt = Number(((effectiveEntry * params.qty + effectiveExit * params.qty) * 0.0005).toFixed(4));
  const fundingUsdt = Number((params.fundingUsdt ?? 0).toFixed(4));
  const netPnlUsdt = Number((gross - feeUsdt + fundingUsdt).toFixed(4));

  return {
    id: `sht-${nowTs}-${Math.random().toString(36).slice(2, 7)}`,
    candidateId: params.candidate.id,
    baseStrategyId: params.candidate.baseStrategyId,
    symbol: params.symbol,
    side: params.side,
    regime: params.regime,
    qty: params.qty,
    entryPrice: Number(effectiveEntry.toFixed(6)),
    exitPrice: Number(effectiveExit.toFixed(6)),
    feeUsdt,
    fundingUsdt,
    slippagePct: slip,
    simulatedLatencyMs: params.simulatedLatencyMs ?? 35,
    netPnlUsdt,
    isOutOfSample: params.isOutOfSample ?? true,
    openedAt,
    closedAt: nowTs,
  };
}

export function evaluateShadowCandidate(params: {
  candidate: ShadowCandidate;
  trades: ShadowTradeRecord[];
  thresholds?: ShadowPromotionThresholds;
  baselineCapitalUsdt?: number;
  nowTs?: number;
}): ShadowEvaluationReport {
  const thresholds = params.thresholds ?? DEFAULT_SHADOW_THRESHOLDS;
  const nowTs = params.nowTs ?? Date.now();
  const baseCap = Math.max(10, params.baselineCapitalUsdt ?? 100);
  const candTrades = [...params.trades]
    .filter((t) => t.candidateId === params.candidate.id)
    .sort((a, b) => a.closedAt - b.closedAt);

  const tradesCount = candTrades.length;
  const oosTrades = candTrades.filter((t) => t.isOutOfSample);
  const regimesSet = new Set(candTrades.map((t) => t.regime).filter(Boolean));
  const regimesCovered = Array.from(regimesSet);

  let grossWin = 0;
  let grossLoss = 0;
  let equity = baseCap;
  let peak = baseCap;
  let maxDrawdownPct = 0;
  let netTotal = 0;

  for (const t of candTrades) {
    netTotal += t.netPnlUsdt;
    if (t.netPnlUsdt > 0) grossWin += t.netPnlUsdt;
    else grossLoss += Math.abs(t.netPnlUsdt);

    equity += t.netPnlUsdt;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  const profitFactor =
    grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 9.99 : 0;
  const expectancyUsdt = tradesCount > 0 ? Number((netTotal / tradesCount).toFixed(4)) : 0;
  const oosNetPnl = oosTrades.reduce((acc, t) => acc + t.netPnlUsdt, 0);
  const outOfSamplePassed = oosTrades.length >= Math.min(10, thresholds.minTrades) && oosNetPnl > 0;
  const regimeStabilityScore = Number(
    Math.min(1, regimesCovered.length / Math.max(1, thresholds.minRegimesCovered)).toFixed(2)
  );

  const blockingReasons: string[] = [];
  if (tradesCount < thresholds.minTrades) {
    blockingReasons.push(`MIN_TRADES_NOT_MET (${tradesCount}/${thresholds.minTrades})`);
  }
  if (netTotal <= 0) {
    blockingReasons.push(`NEGATIVE_OR_ZERO_NET_PNL (${netTotal.toFixed(2)} USDT)`);
  }
  if (profitFactor < thresholds.minProfitFactor) {
    blockingReasons.push(`LOW_PROFIT_FACTOR (${profitFactor} < ${thresholds.minProfitFactor})`);
  }
  if (maxDrawdownPct > thresholds.maxDrawdownPct) {
    blockingReasons.push(`EXCESS_DRAWDOWN (${maxDrawdownPct.toFixed(2)}% > ${thresholds.maxDrawdownPct}%)`);
  }
  if (expectancyUsdt <= thresholds.minExpectancyUsdt) {
    blockingReasons.push(`LOW_EXPECTANCY (${expectancyUsdt.toFixed(4)})`);
  }
  if (regimesCovered.length < thresholds.minRegimesCovered) {
    blockingReasons.push(`INSUFFICIENT_REGIME_COVERAGE (${regimesCovered.length}/${thresholds.minRegimesCovered})`);
  }
  if (thresholds.requireOutOfSamplePass && !outOfSamplePassed) {
    blockingReasons.push('OUT_OF_SAMPLE_VALIDATION_NOT_PASSED');
  }

  const promotionEligible = blockingReasons.length === 0;
  let recommendation: ShadowEvaluationReport['recommendation'] = 'EXTEND_TEST';
  if (promotionEligible) {
    recommendation = 'KEEP';
  } else if (
    tradesCount >= thresholds.minTrades &&
    (netTotal <= 0 || maxDrawdownPct > thresholds.maxDrawdownPct || profitFactor < 1.0)
  ) {
    recommendation = 'REJECT';
  }

  return {
    id: `eval-${params.candidate.id}-${nowTs}`,
    candidateId: params.candidate.id,
    baseStrategyId: params.candidate.baseStrategyId,
    evaluatedAt: nowTs,
    tradesCount,
    outOfSampleTradesCount: oosTrades.length,
    regimesCovered,
    netPnlUsdt: Number(netTotal.toFixed(2)),
    netPnlAfterFeesAndFundingUsdt: Number(netTotal.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    profitFactor,
    expectancyUsdt,
    regimeStabilityScore,
    outOfSamplePassed,
    promotionEligible,
    autoAppliedToProduction: false,
    recommendation,
    blockingReasons,
  };
}
