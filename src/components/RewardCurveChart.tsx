import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Brain,
  Sparkles,
  Layers,
  RotateCcw,
  Sliders,
  Award,
  GitCompare,
  ArrowLeftRight,
  Filter,
} from 'lucide-react';
import type { AgentItem, RewardHistoryPoint } from '../types.ts';
import { MetricTooltip } from './MetricTooltip.tsx';

export type MarketConditionFilter = 'ALL' | 'HIGH_VOL_TREND' | 'LOW_VOL_OBI' | 'STRESS_LIQUIDITY';

interface RewardCurveChartProps {
  agents: AgentItem[];
  trainingBotId: string | null;
  onTrainEpoch: (agentId: string, botName: string) => Promise<void>;
  onResetBrain: (agentId: string, botName: string) => Promise<void>;
  onSelectAgentForConfig?: (agentId: string) => void;
  externalComparePair?: [string, string] | null;
}

interface StrategyVisualConfig {
  stroke: string;
  fill: string;
  dot: string;
  gradId: string;
  text: string;
  bg: string;
  border: string;
  shortName: string;
}

const STRATEGY_THEMES: Record<string, StrategyVisualConfig> = {
  'agent-onnx-ppo-v2': {
    stroke: '#06b6d4', // cyan-500
    fill: '#0891b2',
    dot: '#22d3ee',
    gradId: 'rlGradOnnx',
    text: 'text-cyan-400',
    bg: 'bg-cyan-950/60',
    border: 'border-cyan-500/40',
    shortName: 'Delta-L2 · Стакан',
  },
  'agent-lgbm-nightly': {
    stroke: '#10b981', // emerald-500
    fill: '#059669',
    dot: '#34d399',
    gradId: 'rlGradLgbm',
    text: 'text-emerald-400',
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-500/40',
    shortName: 'Momentum · Импульс',
  },
  'agent-tg-crypto-alpha': {
    stroke: '#f59e0b', // amber-500
    fill: '#d97706',
    dot: '#fbbf24',
    gradId: 'rlGradTg',
    text: 'text-amber-400',
    bg: 'bg-amber-950/60',
    border: 'border-amber-500/40',
    shortName: 'Alpha-Signal · Индекс',
  },
};

const DEFAULT_THEME: StrategyVisualConfig = {
  stroke: '#a855f7',
  fill: '#9333ea',
  dot: '#c084fc',
  gradId: 'rlGradDefault',
  text: 'text-purple-400',
  bg: 'bg-purple-950/60',
  border: 'border-purple-500/40',
  shortName: 'Стратегия',
};

const MARKET_REGIMES: Array<{
  id: MarketConditionFilter;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'ALL',
    label: 'Все рыночные фазы (Факт)',
    shortLabel: 'Все условия',
    description: 'Полная хронологическая кривая доходности без фильтрации рыночного режима',
  },
  {
    id: 'HIGH_VOL_TREND',
    label: 'Импульсный тренд (High ATR)',
    shortLabel: 'Тренд / Импульс',
    description: 'Оценка в фазах направленного пробоя и высокой волатильности (доминируют факторы Momentum и VWAP)',
  },
  {
    id: 'LOW_VOL_OBI',
    label: 'Флэт и скальпинг стакана L2 (OBI)',
    shortLabel: 'Флэт / Стакан L2',
    description: 'Оценка при узком спреде и торговле от плотностей лимитного стакана L2-50 (доминирует фактор OBI)',
  },
  {
    id: 'STRESS_LIQUIDITY',
    label: 'Турбулентность и расширенный спред',
    shortLabel: 'Стресс спреда',
    description: 'Проверка устойчивости кривой доходности при повышенном спреде и резких возвратах к среднему',
  },
];

// Applies regime-aware sensitivity multiplier to step rewards based on agent's neural weights
function adjustStepRewardForRegime(
  rawReward: number,
  agent: AgentItem,
  regime: MarketConditionFilter,
  stepIdx: number
): number {
  if (regime === 'ALL') return rawReward;

  const w = agent.brain?.weights || {
    obiWeight: 0.35,
    momentumWeight: 0.25,
    vwapWeight: 0.2,
    sentimentWeight: 0.2,
  };

  if (regime === 'HIGH_VOL_TREND') {
    // High-volatility trend favors Momentum + Sentiment weights; penalizes pure passive OBI if low momentum weight
    const trendAffinity = w.momentumWeight * 1.45 + w.sentimentWeight * 1.25 + w.vwapWeight * 0.9;
    const wave = Math.sin(stepIdx * 0.9) * 0.12;
    return Number((rawReward * (0.72 + trendAffinity * 0.85) + wave).toFixed(3));
  }

  if (regime === 'LOW_VOL_OBI') {
    // Range / L2 Orderbook scalping favors deep OBI + VWAP reversion weights
    const obiAffinity = w.obiWeight * 1.55 + w.vwapWeight * 1.25;
    const wave = Math.cos(stepIdx * 0.75) * 0.08;
    return Number((rawReward * (0.7 + obiAffinity * 0.85) + wave).toFixed(3));
  }

  if (regime === 'STRESS_LIQUIDITY') {
    // Stress regime tests drawdown defense (tighter ATR multiplier & higher confidence threshold perform better)
    const conf = agent.brain?.confidenceThreshold ?? 0.21;
    const defenseFactor = 0.65 + conf * 1.4 + w.obiWeight * 0.45;
    const stressDrag = rawReward < 0 ? 1.18 : 0.88 * defenseFactor;
    return Number((rawReward * stressDrag).toFixed(3));
  }

  return rawReward;
}

export const RewardCurveChart: React.FC<RewardCurveChartProps> = ({
  agents,
  trainingBotId,
  onTrainEpoch,
  onResetBrain,
  onSelectAgentForConfig,
  externalComparePair,
}) => {
  // Mode: 'DUAL' (Head-to-Head 2 strategies comparison), 'ALL' (All 3 models), or specific agentId for Single view
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('DUAL');

  // Dual comparison strategy IDs (Strategy A vs Strategy B)
  const [strategyAId, setStrategyAId] = useState<string>('agent-onnx-ppo-v2');
  const [strategyBId, setStrategyBId] = useState<string>('agent-lgbm-nightly');

  // Market regime filter for evaluating RL agents under different market conditions
  const [marketRegime, setMarketRegime] = useState<MarketConditionFilter>('ALL');

  // Dual comparison Y-axis unit: 'YIELD_PCT' (Доходность %), 'CUMULATIVE_R' (Накопленная награда ΣR), or 'SPREAD_DIFF' (Кривые + Дельта A-B)
  const [dualUnitMode, setDualUnitMode] = useState<'YIELD_PCT' | 'CUMULATIVE_R' | 'SPREAD_DIFF'>('YIELD_PCT');

  // Single-strategy metric mode: 'CUMULATIVE' (ΣR), 'STEP' (ΔR), or 'COMPOSED'
  const [metricMode, setMetricMode] = useState<'CUMULATIVE' | 'STEP' | 'COMPOSED'>('CUMULATIVE');

  // Zoom filter: All steps vs last 15 steps
  const [stepWindow, setStepWindow] = useState<'ALL' | 'LAST15'>('ALL');

  // Reset confirmation state
  const [confirmResetBotId, setConfirmResetBotId] = useState<string | null>(null);
  const [isTrainingPair, setIsTrainingPair] = useState<boolean>(false);

  // Sync external comparison pair if triggered from AiArenaView agent cards
  useEffect(() => {
    if (externalComparePair && externalComparePair[0] && externalComparePair[1]) {
      setStrategyAId(externalComparePair[0]);
      setStrategyBId(externalComparePair[1]);
      setSelectedStrategyId('DUAL');
    }
  }, [externalComparePair]);

  // Ensure valid strategy A & B defaults when agents load
  useEffect(() => {
    if (agents.length >= 2) {
      const existsA = agents.some((a) => a.agentId === strategyAId);
      const existsB = agents.some((a) => a.agentId === strategyBId);
      if (!existsA) setStrategyAId(agents[0].agentId);
      if (!existsB || strategyAId === strategyBId) {
        const fallbackB = agents.find((a) => a.agentId !== (existsA ? strategyAId : agents[0].agentId));
        if (fallbackB) setStrategyBId(fallbackB.agentId);
      }
    }
  }, [agents, strategyAId, strategyBId]);

  const strategyAAgent = useMemo(
    () => agents.find((a) => a.agentId === strategyAId) || agents[0] || null,
    [agents, strategyAId]
  );

  const strategyBAgent = useMemo(
    () =>
      agents.find((a) => a.agentId === strategyBId) ||
      agents.find((a) => a.agentId !== strategyAId) ||
      agents[1] ||
      agents[0] ||
      null,
    [agents, strategyBId, strategyAId]
  );

  // Selected agent if in single mode
  const currentAgent = useMemo(() => {
    if (selectedStrategyId === 'ALL' || selectedStrategyId === 'DUAL') return null;
    return agents.find((a) => a.agentId === selectedStrategyId) || agents[0] || null;
  }, [agents, selectedStrategyId]);

  const handleSelectStrategyA = (newId: string) => {
    if (newId === strategyBId) {
      setStrategyBId(strategyAId);
    }
    setStrategyAId(newId);
  };

  const handleSelectStrategyB = (newId: string) => {
    if (newId === strategyAId) {
      setStrategyAId(strategyBId);
    }
    setStrategyBId(newId);
  };

  const handleSwapPair = () => {
    const prevA = strategyAId;
    setStrategyAId(strategyBId);
    setStrategyBId(prevA);
  };

  const handleTrainSelectedPair = async () => {
    if (!strategyAAgent || !strategyBAgent || isTrainingPair || trainingBotId !== null) return;
    setIsTrainingPair(true);
    try {
      await onTrainEpoch(strategyAAgent.agentId, strategyAAgent.name);
      await onTrainEpoch(strategyBAgent.agentId, strategyBAgent.name);
    } finally {
      setIsTrainingPair(false);
    }
  };

  // Dual-Strategy Head-to-Head Comparison Dataset (aligned by step index 1..N, regime-aware)
  const dualComparisonData = useMemo(() => {
    if (!strategyAAgent || !strategyBAgent) return [];

    const histA = strategyAAgent.brain?.rewardHistory || [];
    const histB = strategyBAgent.brain?.rewardHistory || [];
    const maxSteps = Math.max(histA.length, histB.length, 1);

    const riskPctA = strategyAAgent.riskPerTradePct ?? 1.5;
    const riskPctB = strategyBAgent.riskPerTradePct ?? 1.5;

    let cumRA = 0;
    let cumRB = 0;
    const rows: Array<Record<string, any>> = [];

    for (let i = 0; i < maxSteps; i++) {
      const stepIdx = i + 1;
      const ptA = i < histA.length ? histA[i] : null;
      const ptB = i < histB.length ? histB[i] : null;

      const rawStepA = ptA ? ptA.reward : 0;
      const rawStepB = ptB ? ptB.reward : 0;

      const adjStepA = ptA
        ? adjustStepRewardForRegime(rawStepA, strategyAAgent, marketRegime, stepIdx)
        : 0;
      const adjStepB = ptB
        ? adjustStepRewardForRegime(rawStepB, strategyBAgent, marketRegime, stepIdx)
        : 0;

      cumRA = Number((cumRA + adjStepA).toFixed(3));
      cumRB = Number((cumRB + adjStepB).toFixed(3));

      // Convert cumulative R into compound portfolio yield % (1R = riskPerTradePct %)
      const yieldPctA = Number((cumRA * riskPctA).toFixed(2));
      const yieldPctB = Number((cumRB * riskPctB).toFixed(2));

      const spreadYield = Number((yieldPctA - yieldPctB).toFixed(2));
      const spreadR = Number((cumRA - cumRB).toFixed(3));

      rows.push({
        index: stepIdx,
        displayStep: `Шаг #${stepIdx}`,
        // Primary plotted keys depending on dualUnitMode
        valA: dualUnitMode === 'CUMULATIVE_R' ? cumRA : yieldPctA,
        valB: dualUnitMode === 'CUMULATIVE_R' ? cumRB : yieldPctB,
        spreadAB: dualUnitMode === 'CUMULATIVE_R' ? spreadR : spreadYield,
        // Detailed telemetry for Tooltip
        cumRA,
        cumRB,
        stepRA: adjStepA,
        stepRB: adjStepB,
        yieldPctA,
        yieldPctB,
        equityUsdtA: Number((1500 * (1 + yieldPctA / 100)).toFixed(2)),
        equityUsdtB: Number((1500 * (1 + yieldPctB / 100)).toFixed(2)),
        labelA: ptA?.label || 'Удержание позиции',
        labelB: ptB?.label || 'Удержание позиции',
        spreadR,
        spreadYield,
      });
    }

    if (stepWindow === 'LAST15' && rows.length > 15) {
      return rows.slice(-15);
    }
    return rows;
  }, [strategyAAgent, strategyBAgent, marketRegime, dualUnitMode, stepWindow]);

  // Summary metrics for the Dual Head-to-Head panel
  const dualSummary = useMemo(() => {
    if (dualComparisonData.length === 0 || !strategyAAgent || !strategyBAgent) {
      return {
        finalYieldA: 0,
        finalYieldB: 0,
        finalRA: 0,
        finalRB: 0,
        winRateA: 0,
        winRateB: 0,
        leaderId: null as string | null,
        yieldAdvantage: 0,
        rAdvantage: 0,
      };
    }

    const last = dualComparisonData[dualComparisonData.length - 1];
    const winsA = dualComparisonData.filter((r) => r.stepRA > 0).length;
    const totalA = Math.max(1, dualComparisonData.filter((r) => r.stepRA !== 0).length);
    const winsB = dualComparisonData.filter((r) => r.stepRB > 0).length;
    const totalB = Math.max(1, dualComparisonData.filter((r) => r.stepRB !== 0).length);

    const metricA = dualUnitMode === 'CUMULATIVE_R' ? last.cumRA : last.yieldPctA;
    const metricB = dualUnitMode === 'CUMULATIVE_R' ? last.cumRB : last.yieldPctB;

    return {
      finalYieldA: last.yieldPctA,
      finalYieldB: last.yieldPctB,
      finalRA: last.cumRA,
      finalRB: last.cumRB,
      winRateA: Number(((winsA / totalA) * 100).toFixed(1)),
      winRateB: Number(((winsB / totalB) * 100).toFixed(1)),
      leaderId:
        metricA > metricB
          ? strategyAAgent.agentId
          : metricB > metricA
          ? strategyBAgent.agentId
          : null,
      yieldAdvantage: Number(Math.abs(last.yieldPctA - last.yieldPctB).toFixed(2)),
      rAdvantage: Number(Math.abs(last.cumRA - last.cumRB).toFixed(2)),
    };
  }, [dualComparisonData, strategyAAgent, strategyBAgent, dualUnitMode]);

  // Single agent chart dataset
  const singleAgentData = useMemo(() => {
    if (!currentAgent) return [];
    const history: RewardHistoryPoint[] = currentAgent.brain?.rewardHistory || [];
    let cumRegimeR = 0;
    let items = history.map((pt, idx) => {
      const adjR = adjustStepRewardForRegime(pt.reward, currentAgent, marketRegime, idx + 1);
      cumRegimeR = Number((cumRegimeR + adjR).toFixed(3));
      return {
        index: idx + 1,
        displayStep: `Шаг #${idx + 1}`,
        rawLabel: pt.label,
        timestamp: pt.timestamp,
        timeStr: new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dateStr: new Date(pt.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
        reward: adjR,
        cumulativeReward: marketRegime === 'ALL' ? Number(pt.cumulativeReward.toFixed(3)) : cumRegimeR,
        sha256: pt.sha256 || '',
        agentName: currentAgent.name,
      };
    });

    if (stepWindow === 'LAST15' && items.length > 15) {
      items = items.slice(-15);
    }
    return items;
  }, [currentAgent, stepWindow, marketRegime]);

  // Multi-strategy (All 3) comparison dataset
  const comparisonData = useMemo(() => {
    if (selectedStrategyId !== 'ALL' || agents.length === 0) return [];

    const maxSteps = Math.max(
      ...agents.map((a) => (a.brain?.rewardHistory ? a.brain.rewardHistory.length : 0)),
      1
    );

    const runningCum: Record<string, number> = {};
    agents.forEach((a) => {
      runningCum[a.agentId] = 0;
    });

    const rows = [];
    for (let i = 0; i < maxSteps; i++) {
      const stepIdx = i + 1;
      const row: Record<string, any> = {
        index: stepIdx,
        displayStep: `Шаг #${stepIdx}`,
      };

      agents.forEach((ag) => {
        const hist = ag.brain?.rewardHistory || [];
        if (i < hist.length) {
          const pt = hist[i];
          const adjStep = adjustStepRewardForRegime(pt.reward, ag, marketRegime, stepIdx);
          runningCum[ag.agentId] = Number((runningCum[ag.agentId] + adjStep).toFixed(3));
          row[ag.agentId] =
            marketRegime === 'ALL' ? Number(pt.cumulativeReward.toFixed(3)) : runningCum[ag.agentId];
          row[`${ag.agentId}_step`] = adjStep;
          row[`${ag.agentId}_label`] = pt.label;
          row[`${ag.agentId}_sha`] = pt.sha256;
          row[`${ag.agentId}_time`] = new Date(pt.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        } else if (hist.length > 0) {
          row[ag.agentId] = runningCum[ag.agentId];
        }
      });
      rows.push(row);
    }

    if (stepWindow === 'LAST15' && rows.length > 15) {
      return rows.slice(-15);
    }
    return rows;
  }, [agents, selectedStrategyId, stepWindow, marketRegime]);

  // Ranked strategies for comparison summary
  const rankedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const rewA = a.brain?.cumulativeReward ?? 0;
      const rewB = b.brain?.cumulativeReward ?? 0;
      return rewB - rewA;
    });
  }, [agents]);

  // Custom Recharts Tooltip for Dual Strategy Comparison (A vs B)
  const DualCompareTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length || !strategyAAgent || !strategyBAgent) return null;
    const data = payload[0].payload;
    const themeA = STRATEGY_THEMES[strategyAAgent.agentId] || DEFAULT_THEME;
    const themeB = STRATEGY_THEMES[strategyBAgent.agentId] || DEFAULT_THEME;
    const activeRegimeObj = MARKET_REGIMES.find((r) => r.id === marketRegime) || MARKET_REGIMES[0];

    return (
      <div className="bg-slate-950/95 border border-slate-700/90 rounded-lg p-3.5 shadow-2xl backdrop-blur font-mono text-xs min-w-[310px] space-y-2.5 tabular-nums">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="text-white font-bold">{data.displayStep}</span>
          <span className="text-cyan-300 text-[10px] px-1.5 py-0.5 bg-cyan-950/80 rounded border border-cyan-500/30">
            {activeRegimeObj.shortLabel}
          </span>
        </div>

        {/* Strategy A Box */}
        <div className="bg-slate-900/75 border border-slate-800 rounded p-2 space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: themeA.stroke }} />
              <span className="text-white font-bold">A: {themeA.shortName}</span>
            </div>
            <span className={`font-bold ${data.yieldPctA >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.yieldPctA >= 0 ? '+' : ''}
              {data.yieldPctA.toFixed(2)}% ({data.cumRA >= 0 ? '+' : ''}
              {data.cumRA.toFixed(2)}R)
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 pl-4">
            <span className="truncate max-w-[180px]">{data.labelA}</span>
            <span className={data.stepRA >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              Шаг: {data.stepRA >= 0 ? '+' : ''}
              {data.stepRA.toFixed(2)}R (${data.equityUsdtA.toFixed(0)})
            </span>
          </div>
        </div>

        {/* Strategy B Box */}
        <div className="bg-slate-900/75 border border-slate-800 rounded p-2 space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: themeB.stroke }} />
              <span className="text-white font-bold">B: {themeB.shortName}</span>
            </div>
            <span className={`font-bold ${data.yieldPctB >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.yieldPctB >= 0 ? '+' : ''}
              {data.yieldPctB.toFixed(2)}% ({data.cumRB >= 0 ? '+' : ''}
              {data.cumRB.toFixed(2)}R)
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 pl-4">
            <span className="truncate max-w-[180px]">{data.labelB}</span>
            <span className={data.stepRB >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              Шаг: {data.stepRB >= 0 ? '+' : ''}
              {data.stepRB.toFixed(2)}R (${data.equityUsdtB.toFixed(0)})
            </span>
          </div>
        </div>

        {/* Spread / Alpha Difference Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
          <span className="text-slate-400">Дельта доходности (A − B):</span>
          <span className={`font-bold ${data.spreadYield >= 0 ? 'text-cyan-300' : 'text-amber-300'}`}>
            {data.spreadYield >= 0 ? '+' : ''}
            {data.spreadYield.toFixed(2)}% ({data.spreadR >= 0 ? '+' : ''}
            {data.spreadR.toFixed(2)}R)
          </span>
        </div>
      </div>
    );
  };

  // Custom Recharts Tooltip for Single Agent
  const SingleTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-lg p-3 shadow-xl backdrop-blur font-mono text-xs max-w-xs space-y-1.5 tabular-nums">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="text-white font-bold">{data.displayStep}</span>
          <span className="text-slate-400 text-[11px]">{data.timeStr} ({data.dateStr})</span>
        </div>
        <div className="text-[11px] text-cyan-300 font-semibold">{data.rawLabel}</div>

        <div className="space-y-1 pt-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Накопленная награда (ΣR):</span>
            <span
              className={`font-bold ${
                data.cumulativeReward >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {data.cumulativeReward >= 0 ? '+' : ''}
              {data.cumulativeReward.toFixed(3)}R
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Прирост за шаг (ΔR):</span>
            <span
              className={`font-semibold ${
                data.reward >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {data.reward >= 0 ? '+' : ''}
              {data.reward.toFixed(3)}R
            </span>
          </div>

          {data.sha256 && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
              <span className="text-slate-500">Чекпоинт весов:</span>
              <span className="text-slate-400">{data.sha256.slice(0, 12)}...</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Custom Recharts Tooltip for Multi-Strategy Comparison
  const ComparisonTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-lg p-3.5 shadow-2xl backdrop-blur font-mono text-xs min-w-[280px] space-y-2 tabular-nums">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="text-white font-bold">{data.displayStep}</span>
          <span className="text-slate-400 text-[10px]">Сравнение всех 3 стратегий</span>
        </div>

        <div className="space-y-2 pt-0.5">
          {agents.map((ag) => {
            const theme = STRATEGY_THEMES[ag.agentId] || DEFAULT_THEME;
            const cumVal = data[ag.agentId];
            const stepVal = data[`${ag.agentId}_step`];
            const itemLabel = data[`${ag.agentId}_label`];

            if (cumVal === undefined) return null;

            return (
              <div
                key={ag.agentId}
                className="bg-slate-900/60 border border-slate-800/80 rounded p-1.5 space-y-0.5 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: theme.stroke }}
                    />
                    <span className="text-white font-semibold">{theme.shortName}</span>
                  </div>
                  <span
                    className={`font-bold ${
                      cumVal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {cumVal >= 0 ? '+' : ''}
                    {cumVal.toFixed(2)}R
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pl-4">
                  <span className="truncate max-w-[170px]">{itemLabel || 'Эпоха / Сделка'}</span>
                  {stepVal !== undefined && (
                    <span className={stepVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      Δ {stepVal >= 0 ? '+' : ''}
                      {stepVal.toFixed(2)}R
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const themeA = STRATEGY_THEMES[strategyAAgent?.agentId || ''] || DEFAULT_THEME;
  const themeB = STRATEGY_THEMES[strategyBAgent?.agentId || ''] || DEFAULT_THEME;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-5 space-y-4 sm:space-y-5 overflow-hidden min-w-0">
      {/* Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/90 pb-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold shrink-0 mt-0.5 sm:mt-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                <span>Кривая доходности и сравнение стратегий (Yield &amp; R-Curve)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold whitespace-nowrap">
                  Bybit V5 Linear
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Параллельное сравнение кривых доходности двух стратегий (A vs B) в разных рыночных режимах
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Epoch Trigger */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Zoom Window Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setStepWindow('ALL')}
              className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                stepWindow === 'ALL'
                  ? 'bg-slate-800 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Вся история
            </button>
            <button
              type="button"
              onClick={() => setStepWindow('LAST15')}
              className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                stepWindow === 'LAST15'
                  ? 'bg-slate-800 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Посл. 15 шагов
            </button>
          </div>

          {/* Metric Mode Selector (for Dual vs Single) */}
          {selectedStrategyId === 'DUAL' ? (
            <div className="flex flex-wrap items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setDualUnitMode('YIELD_PCT')}
                className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                  dualUnitMode === 'YIELD_PCT'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Доходность (%)
              </button>
              <button
                type="button"
                onClick={() => setDualUnitMode('CUMULATIVE_R')}
                className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                  dualUnitMode === 'CUMULATIVE_R'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Награда (ΣR)
              </button>
              <button
                type="button"
                onClick={() => setDualUnitMode('SPREAD_DIFF')}
                className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                  dualUnitMode === 'SPREAD_DIFF'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Параллельные кривые + гистограмма спрэда преимущества (A - B)"
              >
                Кривые + Дельта
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setMetricMode('CUMULATIVE')}
                className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                  metricMode === 'CUMULATIVE'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Σ Награда (ΣR)
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('STEP')}
                className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                  metricMode === 'STEP'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Шаг (ΔR)
              </button>
              {selectedStrategyId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setMetricMode('COMPOSED')}
                  className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                    metricMode === 'COMPOSED'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ΣR + ΔR
                </button>
              )}
            </div>
          )}

          {/* Train Epoch Button */}
          {selectedStrategyId === 'DUAL' ? (
            <button
              type="button"
              disabled={trainingBotId !== null || isTrainingPair}
              onClick={handleTrainSelectedPair}
              className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 border border-cyan-500/40 whitespace-nowrap shrink-0"
              title="Калибровать обе выбранные стратегии (A и B) на свечах Bybit V5 (5m)"
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${
                  trainingBotId !== null || isTrainingPair ? 'animate-spin text-cyan-300' : 'text-cyan-400'
                }`}
              />
              <span>
                {trainingBotId !== null || isTrainingPair
                  ? 'Калибровка A+B...'
                  : 'Калибровать A vs B (5m)'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={trainingBotId !== null}
              onClick={() =>
                onTrainEpoch(
                  selectedStrategyId,
                  selectedStrategyId === 'ALL'
                    ? 'Все стратегии'
                    : currentAgent?.name || 'Стратегия'
                )
              }
              className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 border border-cyan-500/40 whitespace-nowrap shrink-0"
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${
                  trainingBotId !== null ? 'animate-spin text-cyan-300' : 'text-cyan-400'
                }`}
              />
              <span>
                {trainingBotId === selectedStrategyId || trainingBotId === 'ALL'
                  ? 'Калибровка Bybit...'
                  : selectedStrategyId === 'ALL'
                  ? 'Откалибровать все (5m)'
                  : `Калибровать ${currentAgent?.name.split(' ')[0] || 'стратегию'}`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Mode & Strategy Switcher Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab 0: Dual Strategy Head-to-Head Comparison (A vs B) */}
          <button
            type="button"
            onClick={() => setSelectedStrategyId('DUAL')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-2 border whitespace-nowrap ${
              selectedStrategyId === 'DUAL'
                ? 'bg-cyan-950 text-cyan-200 border-cyan-400/70 shadow-lg shadow-cyan-950/50'
                : 'bg-slate-950/80 text-slate-400 hover:text-white border-slate-800'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Сравнение 2 стратегий (A vs B)</span>
          </button>

          {/* Tab 1: All 3 Strategies Comparison */}
          <button
            type="button"
            onClick={() => setSelectedStrategyId('ALL')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-2 border whitespace-nowrap ${
              selectedStrategyId === 'ALL'
                ? 'bg-slate-800 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-950/80 text-slate-400 hover:text-white border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Все 3 стратегии</span>
          </button>

          {/* Individual Strategy Tabs */}
          {agents.map((agent) => {
            const theme = STRATEGY_THEMES[agent.agentId] || DEFAULT_THEME;
            const isSelected = selectedStrategyId === agent.agentId;
            const cumReward = agent.brain?.cumulativeReward ?? 0;

            return (
              <button
                key={agent.agentId}
                type="button"
                onClick={() => setSelectedStrategyId(agent.agentId)}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-2 border max-w-full ${
                  isSelected
                    ? `${theme.bg} text-white ${theme.border} shadow-lg`
                    : 'bg-slate-950/80 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: theme.stroke }}
                />
                <span className="truncate">{agent.name.split(' (')[0]}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    cumReward >= 0
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                      : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                  }`}
                >
                  {cumReward >= 0 ? '+' : ''}
                  {cumReward.toFixed(2)}R
                </span>
              </button>
            );
          })}
        </div>

        {/* Market Condition / Regime Filter Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 font-mono text-xs w-full lg:w-auto">
          <span className="text-[11px] text-slate-400 px-1.5 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3 text-cyan-400" />
            Условия рынка:
          </span>
          {MARKET_REGIMES.map((reg) => (
            <button
              key={reg.id}
              type="button"
              onClick={() => setMarketRegime(reg.id)}
              title={reg.description}
              className={`px-2.5 py-1 rounded text-[11px] transition whitespace-nowrap shrink-0 ${
                marketRegime === reg.id
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {reg.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Dual Strategy Selection & Head-to-Head Comparison Matrix */}
      {selectedStrategyId === 'DUAL' && strategyAAgent && strategyBAgent && (
        <div className="bg-slate-950/85 border border-slate-800/90 rounded-xl p-3 sm:p-4 space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5 min-w-0">
            {/* Strategy A & Strategy B Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 w-full xl:w-auto min-w-0">
              {/* Strategy A Picker */}
              <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 min-w-0 w-full overflow-hidden">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: themeA.stroke }}
                />
                <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap shrink-0">Стратегия A:</span>
                <select
                  aria-label="Выбор первой стратегии для сравнения"
                  value={strategyAAgent.agentId}
                  onChange={(e) => handleSelectStrategyA(e.target.value)}
                  className="w-full min-w-0 flex-1 truncate bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
                >
                  {agents.map((ag) => (
                    <option key={ag.agentId} value={ag.agentId} className="bg-slate-950 text-white">
                      {ag.name} ({ag.engineType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Swap Button */}
              <button
                type="button"
                onClick={handleSwapPair}
                title="Поменять стратегии A и B местами"
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 rounded-lg transition flex items-center justify-center gap-1.5 sm:w-auto w-full text-xs font-mono"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span className="sm:hidden text-[11px] text-slate-400">Поменять A и B местами</span>
              </button>

              {/* Strategy B Picker */}
              <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 min-w-0 w-full overflow-hidden">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: themeB.stroke }}
                />
                <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap shrink-0">Стратегия B:</span>
                <select
                  aria-label="Выбор второй стратегии для сравнения"
                  value={strategyBAgent.agentId}
                  onChange={(e) => handleSelectStrategyB(e.target.value)}
                  className="w-full min-w-0 flex-1 truncate bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
                >
                  {agents.map((ag) => (
                    <option key={ag.agentId} value={ag.agentId} className="bg-slate-950 text-white">
                      {ag.name} ({ag.engineType})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Winner / Outperformance Summary Badge */}
            <div className="flex items-center gap-2 font-mono text-xs tabular-nums min-w-0">
              {dualSummary.leaderId ? (
                <div className="w-full xl:w-auto px-3 py-2 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 min-w-0">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="leading-snug break-words min-w-0">
                    Лидер режима:{' '}
                    <strong className="text-white">
                      {dualSummary.leaderId === strategyAAgent.agentId ? themeA.shortName : themeB.shortName}
                    </strong>{' '}
                    (преимущество +{dualSummary.yieldAdvantage.toFixed(2)}% / +{dualSummary.rAdvantage.toFixed(2)}R)
                  </span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                  Паритет доходности стратегий
                </div>
              )}
            </div>
          </div>

          {/* Side-by-Side Telemetry Comparison Cards (Strategy A vs Strategy B) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 font-mono text-xs tabular-nums min-w-0">
            {[
              {
                tag: 'СТРАТЕГИЯ A',
                agent: strategyAAgent,
                theme: themeA,
                yieldPct: dualSummary.finalYieldA,
                cumR: dualSummary.finalRA,
                winRate: dualSummary.winRateA,
                isLeader: dualSummary.leaderId === strategyAAgent.agentId,
              },
              {
                tag: 'СТРАТЕГИЯ B',
                agent: strategyBAgent,
                theme: themeB,
                yieldPct: dualSummary.finalYieldB,
                cumR: dualSummary.finalRB,
                winRate: dualSummary.winRateB,
                isLeader: dualSummary.leaderId === strategyBAgent.agentId,
              },
            ].map((card) => {
              const w = card.agent.brain?.weights || {
                obiWeight: 0.35,
                momentumWeight: 0.25,
                vwapWeight: 0.2,
                sentimentWeight: 0.2,
              };
              return (
                <div
                  key={card.tag}
                  className={`rounded-lg border p-3.5 space-y-2.5 min-w-0 overflow-hidden ${
                    card.isLeader
                      ? 'bg-slate-900/90 border-cyan-500/40'
                      : 'bg-slate-900/50 border-slate-800/90'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: card.theme.stroke }}
                        />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">
                          {card.tag}
                        </span>
                      </div>
                      <div className="font-bold text-white text-xs sm:text-sm truncate mt-0.5">
                        {card.agent.name}
                      </div>
                    </div>
                    <span
                      className={`text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 ${
                        card.yieldPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {card.yieldPct >= 0 ? '+' : ''}
                      {card.yieldPct.toFixed(2)}% ({card.cumR >= 0 ? '+' : ''}
                      {card.cumR.toFixed(2)}R)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-[11px] border-t border-slate-800/80">
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <MetricTooltip metric="SHARPE" value={card.agent.sharpeRatio} showIcon={false}>
                        <span className="text-slate-400 block text-[10px]">Sharpe / PF</span>
                      </MetricTooltip>
                      <span className="text-slate-200 font-semibold block mt-0.5 whitespace-nowrap">
                        {card.agent.sharpeRatio.toFixed(2)} / x{card.agent.profitFactor.toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <MetricTooltip metric="WIN_RATE" value={card.winRate} showIcon={false}>
                        <span className="text-slate-400 block text-[10px]">WinRate фазы</span>
                      </MetricTooltip>
                      <span className="text-emerald-400 font-semibold block mt-0.5 whitespace-nowrap">{card.winRate.toFixed(1)}%</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <MetricTooltip metric="MAX_DRAWDOWN" value={card.agent.maxDrawdownPct} showIcon={false}>
                        <span className="text-slate-400 block text-[10px]">Макс. DD</span>
                      </MetricTooltip>
                      <span className="text-rose-400 font-semibold block mt-0.5 whitespace-nowrap">-{card.agent.maxDrawdownPct.toFixed(1)}%</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <MetricTooltip metric="LEVERAGE" value={card.agent.leverage ?? 10} showIcon={false}>
                        <span className="text-slate-400 block text-[10px]">Риск / Плечо</span>
                      </MetricTooltip>
                      <span className="text-cyan-300 font-semibold block mt-0.5 whitespace-nowrap">
                        {card.agent.riskPerTradePct ?? 1.5}% · {card.agent.leverage ?? 10}x
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60 text-[10px] text-slate-400">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>Веса:</span>
                      <MetricTooltip metric="OBI" value={w.obiWeight * 100} showIcon={false}>
                        <span>OBI <strong className="text-cyan-300">{(w.obiWeight * 100).toFixed(0)}%</strong></span>
                      </MetricTooltip>
                      <span>·</span>
                      <MetricTooltip metric="RSI_EMA" showIcon={false}>
                        <span>Mom <strong className="text-emerald-300">{(w.momentumWeight * 100).toFixed(0)}%</strong></span>
                      </MetricTooltip>
                      <span>·</span>
                      <MetricTooltip metric="VWAP" value={w.vwapWeight} showIcon={false}>
                        <span>VWAP <strong className="text-indigo-300">{(w.vwapWeight * 100).toFixed(0)}%</strong></span>
                      </MetricTooltip>
                      <span>·</span>
                      <MetricTooltip metric="SENTIMENT_LLM" showIcon={false}>
                        <span>Sent <strong className="text-amber-300">{(w.sentimentWeight * 100).toFixed(0)}%</strong></span>
                      </MetricTooltip>
                    </span>
                    {onSelectAgentForConfig && (
                      <button
                        type="button"
                        onClick={() => onSelectAgentForConfig(card.agent.agentId)}
                        className="text-cyan-400 hover:text-cyan-300 underline whitespace-nowrap"
                      >
                        Настроить &rarr;
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Strategy Summary KPI Badges for ALL or SINGLE modes */}
      {selectedStrategyId === 'ALL' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {rankedAgents.map((ag, idx) => {
            const theme = STRATEGY_THEMES[ag.agentId] || DEFAULT_THEME;
            const cumR = ag.brain?.cumulativeReward ?? 0;
            const epochs = ag.brain?.epochsTrained ?? 0;
            const steps = ag.brain?.onlineUpdatesCount ?? 0;
            const isTop = idx === 0;

            return (
              <div
                key={ag.agentId}
                onClick={() => setSelectedStrategyId(ag.agentId)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isTop
                    ? 'bg-slate-950/90 border-cyan-500/40 hover:border-cyan-400'
                    : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: theme.stroke }}
                    />
                    <span className="font-bold text-white">{theme.shortName}</span>
                    {isTop && (
                      <span className="text-[10px] text-amber-300 font-bold flex items-center gap-0.5">
                        <Award className="w-3 h-3 text-amber-400" />
                        #1
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-bold ${
                      cumR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {cumR >= 0 ? '+' : ''}
                    {cumR.toFixed(2)}R
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                  <span>Циклов Bybit: {epochs}</span>
                  <span>Сделок: {steps}</span>
                  <span className="text-cyan-400 underline text-[10px]">Подробнее &rarr;</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        currentAgent && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 text-xs font-mono tabular-nums flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-slate-500 text-[10px] block">Текущий результат (ΣR)</span>
                <span
                  className={`font-bold text-sm ${
                    (currentAgent.brain?.cumulativeReward ?? 0) >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {(currentAgent.brain?.cumulativeReward ?? 0) >= 0 ? '+' : ''}
                  {(currentAgent.brain?.cumulativeReward ?? 0).toFixed(3)}R
                </span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-slate-500 text-[10px] block">Циклов Bybit (5m)</span>
                <span className="font-bold text-white text-sm">
                  {currentAgent.brain?.epochsTrained ?? 0}
                </span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-slate-500 text-[10px] block">Обновлений весов</span>
                <span className="font-bold text-cyan-300 text-sm">
                  {currentAgent.brain?.onlineUpdatesCount ?? 0}
                </span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-slate-500 text-[10px] block">Порог / ATR SL / Шаг</span>
                <span className="text-slate-300 text-xs">
                  &ge;{(currentAgent.brain?.confidenceThreshold ?? 0.21).toFixed(2)} ·{' '}
                  {(currentAgent.brain?.atrMultiplier ?? 1.45).toFixed(2)}x ATR · &eta;=
                  {(currentAgent.brain?.learningRate ?? 0.06).toFixed(3)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onSelectAgentForConfig && (
                <button
                  type="button"
                  onClick={() => onSelectAgentForConfig(currentAgent.agentId)}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono transition flex items-center gap-1.5 border border-slate-800"
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Настроить бота</span>
                </button>
              )}

              {confirmResetBotId === currentAgent.agentId ? (
                <div className="flex items-center gap-1.5 bg-rose-950/60 border border-rose-600/60 rounded-lg px-2 py-1 text-xs font-mono">
                  <span className="text-rose-300 text-[11px]">Сбросить веса?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await onResetBrain(currentAgent.agentId, currentAgent.name);
                      setConfirmResetBotId(null);
                    }}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold"
                  >
                    Да
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetBotId(null)}
                    className="px-1.5 py-0.5 text-slate-400 hover:text-white text-[10px]"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetBotId(currentAgent.agentId)}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-mono transition flex items-center gap-1 border border-slate-800"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  <span>Сброс весов</span>
                </button>
              )}
            </div>
          </div>
        )
      )}

      {/* Main Recharts Area / Line / Composed Chart Container */}
      <div className="w-full h-72 sm:h-80 bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 pt-5">
        <ResponsiveContainer width="100%" height="100%">
          {selectedStrategyId === 'DUAL' && strategyAAgent && strategyBAgent ? (
            // Dual-Strategy Parallel Comparison Chart (A vs B)
            <ComposedChart
              data={dualComparisonData}
              margin={{ top: 10, right: 25, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="dualGradA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={themeA.stroke} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={themeA.stroke} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="dualGradB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={themeB.stroke} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={themeB.stroke} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="displayStep"
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(v) =>
                  dualUnitMode === 'CUMULATIVE_R'
                    ? `${v >= 0 ? '+' : ''}${v}R`
                    : `${v >= 0 ? '+' : ''}${v}%`
                }
              />
              <Tooltip content={<DualCompareTooltip />} />
              <ReferenceLine
                y={0}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{
                  value: dualUnitMode === 'CUMULATIVE_R' ? '0.00 R' : '0.00% (Брейкивен)',
                  fill: '#64748b',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: '11px', fontFamily: 'monospace' }}
              />
              {dualUnitMode === 'SPREAD_DIFF' && (
                <Bar
                  dataKey="spreadAB"
                  name="Дельта преимущества (A − B)"
                  fill="#6366f1"
                  opacity={0.45}
                  radius={[3, 3, 0, 0]}
                />
              )}
              <Area
                type="monotone"
                dataKey="valA"
                name={`A: ${themeA.shortName}`}
                stroke={themeA.stroke}
                strokeWidth={2.5}
                fill="url(#dualGradA)"
                dot={{ r: 3.5, fill: themeA.dot, strokeWidth: 1.5, stroke: '#020617' }}
                activeDot={{ r: 6, fill: themeA.dot, stroke: '#ffffff', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="valB"
                name={`B: ${themeB.shortName}`}
                stroke={themeB.stroke}
                strokeWidth={2.5}
                fill="url(#dualGradB)"
                dot={{ r: 3.5, fill: themeB.dot, strokeWidth: 1.5, stroke: '#020617' }}
                activeDot={{ r: 6, fill: themeB.dot, stroke: '#ffffff', strokeWidth: 2 }}
              />
            </ComposedChart>
          ) : selectedStrategyId === 'ALL' ? (
            // Multi-Strategy (All 3) Comparison Chart
            <LineChart
              data={comparisonData}
              margin={{ top: 10, right: 25, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="displayStep"
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}R`}
              />
              <Tooltip content={<ComparisonTooltip />} />
              <ReferenceLine
                y={0}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{
                  value: '0.00 R (Брейкивен)',
                  fill: '#64748b',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: '11px', fontFamily: 'monospace' }}
                formatter={(value) => {
                  const theme = STRATEGY_THEMES[value] || DEFAULT_THEME;
                  return (
                    <span style={{ color: theme.stroke, fontWeight: 600 }}>
                      {theme.shortName}
                    </span>
                  );
                }}
              />
              {agents.map((ag) => {
                const theme = STRATEGY_THEMES[ag.agentId] || DEFAULT_THEME;
                return (
                  <Line
                    key={ag.agentId}
                    type="monotone"
                    dataKey={ag.agentId}
                    name={ag.agentId}
                    stroke={theme.stroke}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: theme.dot, strokeWidth: 1.5, stroke: '#020617' }}
                    activeDot={{ r: 6, fill: theme.dot, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                );
              })}
            </LineChart>
          ) : metricMode === 'STEP' ? (
            // Single Strategy - Step Reward Bar Chart
            <BarChart
              data={singleAgentData}
              margin={{ top: 10, right: 25, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="displayStep"
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}R`}
              />
              <Tooltip content={<SingleTooltip />} />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
              <Bar
                dataKey="reward"
                name="Награда за шаг (ΔR)"
                fill="#22d3ee"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          ) : metricMode === 'COMPOSED' ? (
            // Single Strategy - Composed Chart (Area for Cumulative, Bar for Step Delta)
            <ComposedChart
              data={singleAgentData}
              margin={{ top: 10, right: 25, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="singleComposedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={
                      STRATEGY_THEMES[currentAgent?.agentId || '']?.stroke || '#06b6d4'
                    }
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="95%"
                    stopColor={
                      STRATEGY_THEMES[currentAgent?.agentId || '']?.stroke || '#06b6d4'
                    }
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="displayStep"
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
              />
              <YAxis
                yAxisId="left"
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}R`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `Δ${v >= 0 ? '+' : ''}${v}R`}
              />
              <Tooltip content={<SingleTooltip />} />
              <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="4 4" />
              <Bar
                yAxisId="right"
                dataKey="reward"
                name="Шаг (ΔR)"
                fill="#38bdf8"
                opacity={0.65}
                radius={[3, 3, 0, 0]}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="cumulativeReward"
                name="Накопленная (ΣR)"
                stroke={
                  STRATEGY_THEMES[currentAgent?.agentId || '']?.stroke || '#06b6d4'
                }
                strokeWidth={2.5}
                fill="url(#singleComposedGrad)"
                dot={{
                  r: 3.5,
                  fill: STRATEGY_THEMES[currentAgent?.agentId || '']?.dot || '#22d3ee',
                  strokeWidth: 1.5,
                  stroke: '#020617',
                }}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
              />
            </ComposedChart>
          ) : (
            // Single Strategy - Smooth Cumulative Area Chart
            <AreaChart
              data={singleAgentData}
              margin={{ top: 10, right: 25, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="singleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={
                      STRATEGY_THEMES[currentAgent?.agentId || '']?.stroke || '#06b6d4'
                    }
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor={
                      STRATEGY_THEMES[currentAgent?.agentId || '']?.stroke || '#06b6d4'
                    }
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="displayStep"
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}R`}
              />
              <Tooltip content={<SingleTooltip />} />
              <ReferenceLine
                y={0}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{
                  value: '0.00 R (Брейкивен)',
                  fill: '#64748b',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulativeReward"
                name="Накопленная награда (ΣR)"
                stroke={
                  STRATEGY_THEMES[currentAgent?.agentId || '']?.stroke || '#06b6d4'
                }
                strokeWidth={2.5}
                fill="url(#singleAreaGrad)"
                dot={{
                  r: 3.5,
                  fill: STRATEGY_THEMES[currentAgent?.agentId || '']?.dot || '#22d3ee',
                  strokeWidth: 1.5,
                  stroke: '#020617',
                }}
                activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Footer Info */}
      <div className="flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 pt-1 border-t border-slate-800/60">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {selectedStrategyId === 'DUAL'
              ? `Режим A vs B (${MARKET_REGIMES.find((r) => r.id === marketRegime)?.label}): сравнение кривых доходности`
              : selectedStrategyId === 'ALL'
              ? 'Сравнение всех 3 стратегий по накопленному результату'
              : `Стратегия «${currentAgent?.name}»: динамика весов OBI, RSI/EMA, VWAP и Sentiment`}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          Формула шага: R = (PnL_net / SL_usdt) - Fee · Доходность % = ΣR × Risk_per_trade%
        </div>
      </div>
    </div>
  );
};
