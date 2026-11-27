import type { ExchangeId, ExecutionMode } from '../types.ts';

export type AccountAllocationMode = 'SINGLE_OKX_VIRTUAL_PORTFOLIOS';
export type LearningIsolationMode = 'SHADOW_ONLY';

export interface RuntimeSafetyConfig {
  activeExchange: ExchangeId;
  mode: ExecutionMode;
  accountMode: AccountAllocationMode;
  learningMode: LearningIsolationMode;
  dcaEnabled: false;
  shadowLearningMutatesActiveParams: false;
  allowBybitFallbackInOkxLive: false;
  allowSyntheticDataInLive: false;
  allowPythonLiveExecution: false;
  trialRiskLimits: {
    maxRiskPerTradePct: number;
    maxTotalOpenStopRiskPct: number;
    maxDailyDrawdownPct: number;
    maxLeverage: number;
  };
}

export const DEFAULT_TRIAL_RISK_LIMITS = {
  maxRiskPerTradePct: 1.5,
  maxTotalOpenStopRiskPct: 4.5,
  maxDailyDrawdownPct: 5.0,
  maxLeverage: 5,
} as const;

export function buildRuntimeSafetyConfig(params: {
  activeExchange?: ExchangeId;
  mode?: ExecutionMode;
  okxDemoTrading?: boolean;
}): RuntimeSafetyConfig {
  const activeExchange: ExchangeId = params.activeExchange === 'BYBIT' ? 'BYBIT' : 'OKX';
  const mode: ExecutionMode = params.mode === 'LIVE' ? 'LIVE' : 'SHADOW';
  const isRealLive = mode === 'LIVE' && params.okxDemoTrading === false;

  return {
    activeExchange,
    mode,
    accountMode: 'SINGLE_OKX_VIRTUAL_PORTFOLIOS',
    learningMode: 'SHADOW_ONLY',
    dcaEnabled: false,
    shadowLearningMutatesActiveParams: false,
    allowBybitFallbackInOkxLive: false,
    allowSyntheticDataInLive: false,
    allowPythonLiveExecution: false,
    trialRiskLimits: {
      maxRiskPerTradePct: isRealLive ? 0.5 : DEFAULT_TRIAL_RISK_LIMITS.maxRiskPerTradePct,
      maxTotalOpenStopRiskPct: isRealLive ? 2.0 : DEFAULT_TRIAL_RISK_LIMITS.maxTotalOpenStopRiskPct,
      maxDailyDrawdownPct: isRealLive ? 2.0 : DEFAULT_TRIAL_RISK_LIMITS.maxDailyDrawdownPct,
      maxLeverage: DEFAULT_TRIAL_RISK_LIMITS.maxLeverage,
    },
  };
}

export function validateRuntimeSafetyConfig(params: {
  activeExchange: ExchangeId;
  mode: ExecutionMode;
  requestedDcaEnabled?: boolean;
  requestedAllowPythonLive?: boolean;
  requestedShadowAutoApply?: boolean;
}): {
  valid: boolean;
  errors: string[];
  enforcedConfig: {
    dcaEnabled: false;
    allowPythonLiveExecution: false;
    shadowLearningMutatesActiveParams: false;
  };
} {
  const errors: string[] = [];

  if (params.mode === 'LIVE' && params.activeExchange !== 'OKX') {
    errors.push('LIVE_REQUIRES_ACTIVE_EXCHANGE_OKX');
  }
  if (params.requestedDcaEnabled === true) {
    errors.push('DCA_LOCKED_OFF_CANNOT_BE_ENABLED');
  }
  if (params.requestedAllowPythonLive === true) {
    errors.push('PYTHON_LIVE_EXECUTION_FORBIDDEN');
  }
  if (params.requestedShadowAutoApply === true) {
    errors.push('SHADOW_LEARNING_CANNOT_MUTATE_PRODUCTION_PARAMS');
  }

  return {
    valid: errors.length === 0,
    errors,
    enforcedConfig: {
      dcaEnabled: false,
      allowPythonLiveExecution: false,
      shadowLearningMutatesActiveParams: false,
    },
  };
}

export function enforceDcaDisabledPatch<T extends Record<string, any>>(patch: T): {
  sanitized: Omit<T, 'dcaEnabled' | 'enableDca' | 'safetyOrdersEnabled'> & { dcaEnabled: false };
  rejectedDcaAttempt: boolean;
} {
  const rejectedDcaAttempt =
    patch?.dcaEnabled === true ||
    patch?.enableDca === true ||
    patch?.safetyOrdersEnabled === true;

  const { dcaEnabled: _a, enableDca: _b, safetyOrdersEnabled: _c, ...rest } = patch || {};
  return {
    sanitized: {
      ...rest,
      dcaEnabled: false,
    } as Omit<T, 'dcaEnabled' | 'enableDca' | 'safetyOrdersEnabled'> & { dcaEnabled: false },
    rejectedDcaAttempt,
  };
}
