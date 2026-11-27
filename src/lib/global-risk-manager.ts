import type { ExecutionMode } from '../types.ts';
import type { RuntimeSafetyConfig } from './runtime-config.ts';
import type { SystemRuntimePhase } from './trade-reconciliation.ts';
import type { VirtualPortfolio } from './virtual-portfolio.ts';

export type KillSwitchPolicyMode = 'BLOCK_NEW_ENTRIES_ONLY' | 'EMERGENCY_CLOSE_AND_BLOCK';

export interface OpenPositionRiskSnapshot {
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryVwap: number;
  slPrice: number;
  leverage: number;
  virtualPortfolioId?: string;
}

export interface GlobalRiskEvaluationInput {
  mode: ExecutionMode;
  runtimePhase: SystemRuntimePhase;
  runtimeSafetyConfig: RuntimeSafetyConfig;
  isKillSwitchActive: boolean;
  killSwitchReason?: string | null;
  totalAccountCapitalUsdt: number;
  rolling24hDrawdownPct: number;
  portfolio: VirtualPortfolio;
  activePositions: OpenPositionRiskSnapshot[];
  candidate: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLossPrice: number;
    qty: number;
    requestedLeverage: number;
    estimatedSlippagePct?: number;
    isDcaAddOrder?: boolean;
  };
  okxTakerRoundTripPct?: number;
}

export interface GlobalRiskVerdict {
  allowed: boolean;
  rejectCode?: string;
  reason?: string;
  effectiveLeverage: number;
  requiredMarginUsdt: number;
  candidateStopRiskUsdt: number;
  candidateStopRiskPctOfAccount: number;
  existingOpenStopRiskPctOfAccount: number;
  projectedTotalOpenStopRiskPct: number;
}

export function computePositionStopRiskUsdt(params: {
  entryPrice: number;
  stopLossPrice: number;
  qty: number;
  roundTripFeeRate?: number;
  estimatedSlippageRate?: number;
}): number {
  const entry = Math.max(0, Number(params.entryPrice) || 0);
  const sl = Math.max(0, Number(params.stopLossPrice) || 0);
  const qty = Math.max(0, Number(params.qty) || 0);
  if (entry <= 0 || qty <= 0) return 0;

  const slDistance = Math.abs(entry - sl);
  const feeRate = params.roundTripFeeRate ?? 0.001; // OKX 2 * 0.05%
  const slipRate = params.estimatedSlippageRate ?? 0.0004;
  const perUnitBuffer = entry * (feeRate + slipRate);
  return Number(((slDistance + perUnitBuffer) * qty).toFixed(4));
}

export function evaluateGlobalRiskGate(input: GlobalRiskEvaluationInput): GlobalRiskVerdict {
  const limits = input.runtimeSafetyConfig.trialRiskLimits;
  const maxLev = Math.max(1, Math.min(limits.maxLeverage, input.candidate.requestedLeverage || 1));
  const roundTripFeeRate = (input.okxTakerRoundTripPct ?? 0.1) / 100;
  const slipRate = input.candidate.estimatedSlippagePct ?? 0.0004;

  const accountCap = Math.max(1, Number(input.totalAccountCapitalUsdt) || 1);
  const notional = Math.max(0, input.candidate.entryPrice * input.candidate.qty);
  const requiredMarginUsdt = Number((notional / maxLev).toFixed(2));
  const candidateStopRiskUsdt = computePositionStopRiskUsdt({
    entryPrice: input.candidate.entryPrice,
    stopLossPrice: input.candidate.stopLossPrice,
    qty: input.candidate.qty,
    roundTripFeeRate,
    estimatedSlippageRate: slipRate,
  });

  const existingOpenStopRiskUsdt = input.activePositions.reduce((acc, pos) => {
    return (
      acc +
      computePositionStopRiskUsdt({
        entryPrice: pos.entryVwap,
        stopLossPrice: pos.slPrice,
        qty: pos.qty,
        roundTripFeeRate,
      })
    );
  }, 0);

  const existingOpenStopRiskPctOfAccount = Number(((existingOpenStopRiskUsdt / accountCap) * 100).toFixed(2));
  const candidateStopRiskPctOfAccount = Number(((candidateStopRiskUsdt / accountCap) * 100).toFixed(2));
  const projectedTotalOpenStopRiskPct = Number(
    (existingOpenStopRiskPctOfAccount + candidateStopRiskPctOfAccount).toFixed(2)
  );

  const reject = (rejectCode: string, reason: string): GlobalRiskVerdict => ({
    allowed: false,
    rejectCode,
    reason,
    effectiveLeverage: maxLev,
    requiredMarginUsdt,
    candidateStopRiskUsdt,
    candidateStopRiskPctOfAccount,
    existingOpenStopRiskPctOfAccount,
    projectedTotalOpenStopRiskPct,
  });

  if (input.candidate.isDcaAddOrder) {
    return reject('DCA_DISABLED_BY_SYSTEM_POLICY', 'Усреднение (DCA) запрещено политикой системы');
  }

  if (input.isKillSwitchActive) {
    return reject(
      'KILL_SWITCH_ACTIVE',
      input.killSwitchReason || 'Глобальный Kill-Switch активен — новые входы запрещены'
    );
  }

  if (input.mode === 'LIVE' && input.runtimePhase !== 'READY') {
    return reject(
      `RUNTIME_PHASE_${input.runtimePhase}`,
      `Фаза контура ${input.runtimePhase}: новые LIVE-сделки заблокированы до завершения сверки`
    );
  }

  if (input.rolling24hDrawdownPct <= -limits.maxDailyDrawdownPct) {
    return reject(
      'DAILY_DRAWDOWN_LIMIT_REACHED',
      `Дневная просадка ${input.rolling24hDrawdownPct.toFixed(2)}% превысила лимит -${limits.maxDailyDrawdownPct.toFixed(2)}%`
    );
  }

  if (!input.portfolio.isTradingEnabled) {
    return reject('PORTFOLIO_TRADING_DISABLED', `Портфель ${input.portfolio.label} находится в резерве/паузе`);
  }

  if (requiredMarginUsdt > input.portfolio.freeCapitalUsdt + 0.05) {
    return reject(
      'PORTFOLIO_FREE_CAPITAL_EXCEEDED',
      `Недостаточно свободного капитала портфеля ${input.portfolio.label}: нужно $${requiredMarginUsdt.toFixed(2)}, доступно $${input.portfolio.freeCapitalUsdt.toFixed(2)}`
    );
  }

  if (candidateStopRiskPctOfAccount > limits.maxRiskPerTradePct + 0.05) {
    return reject(
      'TRADE_STOP_RISK_LIMIT_EXCEEDED',
      `Стоп-риск сделки ${candidateStopRiskPctOfAccount.toFixed(2)}% (с учётом комиссий) превышает лимит ${limits.maxRiskPerTradePct.toFixed(2)}%`
    );
  }

  if (projectedTotalOpenStopRiskPct > limits.maxTotalOpenStopRiskPct + 0.05) {
    return reject(
      'TOTAL_OPEN_STOP_RISK_LIMIT_EXCEEDED',
      `Совокупный открытый стоп-риск ${projectedTotalOpenStopRiskPct.toFixed(2)}% превышает предел ${limits.maxTotalOpenStopRiskPct.toFixed(2)}%`
    );
  }

  const sameSideCount = input.activePositions.filter((p) => p.side === input.candidate.side).length;
  if (sameSideCount >= 3) {
    return reject(
      'CORRELATED_EXPOSURE_CAP',
      `Достигнут лимит однонаправленных открытых позиций (${sameSideCount}/3 по ${input.candidate.side})`
    );
  }

  return {
    allowed: true,
    effectiveLeverage: maxLev,
    requiredMarginUsdt,
    candidateStopRiskUsdt,
    candidateStopRiskPctOfAccount,
    existingOpenStopRiskPctOfAccount,
    projectedTotalOpenStopRiskPct,
  };
}

export function resolveKillSwitchPolicyAction(policy: KillSwitchPolicyMode): {
  blockNewEntries: boolean;
  emergencyCloseOpenPositions: boolean;
} {
  return {
    blockNewEntries: true,
    emergencyCloseOpenPositions: policy === 'EMERGENCY_CLOSE_AND_BLOCK',
  };
}
