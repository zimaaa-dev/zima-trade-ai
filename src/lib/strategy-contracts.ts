import type { AiAllowedDirectionMode, MarketEventKey } from './ai-strategy-conductor.ts';
import type { MtfContextSnapshot } from './mtf-context.ts';

export interface StrategySignalCandidate {
  strategyId: string;
  strategyName: string;
  strategyFamily: string;
  virtualPortfolioId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  confidence: number;
  entryPrice: number;
  stopLossPrice: number;
  tpPrices: number[];
  expectedStopRiskPct: number;
  mtfSummary: Pick<
    MtfContextSnapshot,
    'globalMacroBias' | 'primaryTrend4h' | 'structure1h' | 'setup15m' | 'confirm5m' | 'alignmentScore'
  >;
  reasonSummary: string;
  generatedAt: number;
}

export interface AiCoordinatorMutationContract {
  agentId: string;
  reason: string;
  confidenceThresholdDelta?: number;
  targetTpPct?: number;
  atrMultiplier?: number;
}

export interface AiCoordinatorContractV1 {
  schemaVersion: '1.0';
  timestamp: number;
  primaryEvent: MarketEventKey;
  allowedDirectionMode: AiAllowedDirectionMode;
  blockedSymbols: string[];
  selectedComboIds: string[];
  conflictResolutionNote: string;
  summary: string;
  mutations: AiCoordinatorMutationContract[];
}

export function validateAiCoordinatorContractV1(raw: any): {
  valid: boolean;
  contract?: AiCoordinatorContractV1;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['AI_CONTRACT_NOT_OBJECT'] };
  }

  if (raw.dcaEnabled === true || raw.enableDca === true) {
    errors.push('DCA_FORBIDDEN_IN_AI_CONTRACT');
  }
  if (raw.disableKillSwitch === true || raw.bypassRiskFirewall === true) {
    errors.push('RISK_BYPASS_FORBIDDEN_IN_AI_CONTRACT');
  }

  const mutations: AiCoordinatorMutationContract[] = [];
  if (Array.isArray(raw.mutations)) {
    for (const m of raw.mutations) {
      if (!m || typeof m !== 'object' || !m.agentId) continue;
      if (typeof m.riskPerTradePct === 'number' && m.riskPerTradePct > 1.5) {
        errors.push(`RISK_LIMIT_ESCALATION_FORBIDDEN:${m.agentId}`);
        continue;
      }
      if (typeof m.leverage === 'number' && m.leverage > 5) {
        errors.push(`LEVERAGE_ESCALATION_FORBIDDEN:${m.agentId}`);
        continue;
      }
      mutations.push({
        agentId: String(m.agentId),
        reason: String(m.reason || 'AI regime adjustment').slice(0, 200),
        confidenceThresholdDelta:
          typeof m.confidenceThresholdDelta === 'number'
            ? Math.max(-0.04, Math.min(0.04, m.confidenceThresholdDelta))
            : undefined,
        targetTpPct:
          typeof m.targetTpPct === 'number'
            ? Math.max(1.5, Math.min(4.0, m.targetTpPct))
            : undefined,
        atrMultiplier:
          typeof m.atrMultiplier === 'number'
            ? Math.max(1.0, Math.min(2.2, m.atrMultiplier))
            : undefined,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const allowedDir: AiAllowedDirectionMode =
    raw.allowedDirectionMode === 'SHORT_PREFERRED' ||
    raw.allowedDirectionMode === 'LONG_PREFERRED' ||
    raw.allowedDirectionMode === 'DEFENSE_ONLY'
      ? raw.allowedDirectionMode
      : 'BOTH';

  const contract: AiCoordinatorContractV1 = {
    schemaVersion: '1.0',
    timestamp: Number(raw.timestamp) || Date.now(),
    primaryEvent: (raw.primaryEvent || 'LOW_VOL_RANGE') as MarketEventKey,
    allowedDirectionMode: allowedDir,
    blockedSymbols: Array.isArray(raw.blockedSymbols) ? raw.blockedSymbols.map(String) : [],
    selectedComboIds: Array.isArray(raw.selectedComboIds || raw.activeComboIds)
      ? (raw.selectedComboIds || raw.activeComboIds).map(String)
      : [],
    conflictResolutionNote: String(
      raw.conflictResolutionNote || 'Single symbol owner selected by confidence & portfolio risk budget'
    ),
    summary: String(raw.summary || 'AI Coordinator contract validated'),
    mutations,
  };

  return { valid: true, contract, errors: [] };
}

export function selectConflictWinnerCandidate(candidates: StrategySignalCandidate[]): {
  winner: StrategySignalCandidate | null;
  rejected: Array<{ candidate: StrategySignalCandidate; reason: string }>;
} {
  if (!candidates || candidates.length === 0) {
    return { winner: null, rejected: [] };
  }
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = a.confidence - a.expectedStopRiskPct * 0.05;
    const scoreB = b.confidence - b.expectedStopRiskPct * 0.05;
    return scoreB - scoreA;
  });
  const winner = sorted[0];
  const rejected = sorted.slice(1).map((c) => ({
    candidate: c,
    reason: `CONFLICT_LOSER_TO:${winner.strategyId}(conf=${winner.confidence.toFixed(2)})`,
  }));
  return { winner, rejected };
}
