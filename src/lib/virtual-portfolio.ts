export interface VirtualPortfolio {
  id: string;
  label: string;
  strategyFamily: string;
  ownerBotIds: string[];
  allocationPct: number;
  allocatedCapitalUsdt: number;
  freeCapitalUsdt: number;
  reservedMarginUsdt: number;
  realizedPnlUsdt: number;
  unrealizedPnlUsdt: number;
  feesPaidUsdt: number;
  fundingPaidUsdt: number;
  peakEquityUsdt: number;
  drawdownPct: number;
  maxRiskPerTradePct: number;
  isTradingEnabled: boolean;
  closedTradesCount: number;
  winningTradesCount: number;
  decisionLog: Array<{
    timestamp: number;
    strategyId: string;
    symbol: string;
    action: string;
    note: string;
  }>;
  updatedAt: number;
}

export interface PortfolioAllocationSpec {
  id: string;
  label: string;
  strategyFamily: string;
  ownerBotIds: string[];
  allocationPct: number;
  maxRiskPerTradePct: number;
  isTradingEnabled: boolean;
}

export const DEFAULT_PORTFOLIO_ALLOCATIONS: PortfolioAllocationSpec[] = [
  {
    id: 'vp-trend-momentum',
    label: 'Trend / Momentum',
    strategyFamily: 'Trend & Momentum',
    ownerBotIds: ['agent-lgbm-nightly', 'agent-tg-crypto-alpha'],
    allocationPct: 25,
    maxRiskPerTradePct: 1.5,
    isTradingEnabled: true,
  },
  {
    id: 'vp-breakout',
    label: 'Breakout',
    strategyFamily: 'Volatility Breakout',
    ownerBotIds: ['strat-breakout-squeeze', 'strat-atr-breakout', 'strat-high-beta-alt'],
    allocationPct: 15,
    maxRiskPerTradePct: 1.5,
    isTradingEnabled: true,
  },
  {
    id: 'vp-mean-reversion',
    label: 'Mean Reversion',
    strategyFamily: 'Mean Reversion',
    ownerBotIds: ['strat-btc-bounce-hunter', 'strat-vwap-mean-reverter', 'strat-crowd-contrarian'],
    allocationPct: 20,
    maxRiskPerTradePct: 1.25,
    isTradingEnabled: true,
  },
  {
    id: 'vp-order-flow',
    label: 'Order Flow',
    strategyFamily: 'L2 Orderflow',
    ownerBotIds: ['agent-onnx-ppo-v2', 'strat-liquidity-sweep', 'strat-obi-sniper'],
    allocationPct: 15,
    maxRiskPerTradePct: 1.5,
    isTradingEnabled: true,
  },
  {
    id: 'vp-funding-volatility',
    label: 'Funding / Volatility',
    strategyFamily: 'Funding & Hedge',
    ownerBotIds: ['strat-funding-arb', 'strat-macro-shield', 'strat-xau-gold-hedge'],
    allocationPct: 15,
    maxRiskPerTradePct: 1.25,
    isTradingEnabled: true,
  },
  {
    id: 'vp-reserve',
    label: 'Резерв (Reserve)',
    strategyFamily: 'Capital Reserve',
    ownerBotIds: [],
    allocationPct: 10,
    maxRiskPerTradePct: 0,
    isTradingEnabled: false,
  },
];

export function resolvePortfolioIdForStrategy(agentId?: string, strategyFamily?: string): string {
  const id = String(agentId || '').trim();
  const fam = String(strategyFamily || '').toLowerCase();

  for (const spec of DEFAULT_PORTFOLIO_ALLOCATIONS) {
    if (id && spec.ownerBotIds.includes(id)) {
      return spec.id;
    }
  }

  if (fam.includes('order') || fam.includes('obi') || fam.includes('liquid')) return 'vp-order-flow';
  if (fam.includes('breakout') || fam.includes('squeeze') || fam.includes('beta')) return 'vp-breakout';
  if (fam.includes('mean') || fam.includes('bounce') || fam.includes('vwap') || fam.includes('crowd')) {
    return 'vp-mean-reversion';
  }
  if (fam.includes('funding') || fam.includes('macro') || fam.includes('gold') || fam.includes('hedge')) {
    return 'vp-funding-volatility';
  }
  return 'vp-trend-momentum';
}

export function validatePortfolioAllocations(
  allocations: Array<{ id: string; allocationPct: number }>
): { valid: boolean; totalPct: number; error?: string } {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { valid: false, totalPct: 0, error: 'Список распределений портфелей пуст' };
  }

  let totalPct = 0;
  for (const item of allocations) {
    const pct = Number(item.allocationPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return {
        valid: false,
        totalPct,
        error: `Недопустимая доля для портфеля ${item.id}: ${item.allocationPct}%`,
      };
    }
    totalPct += pct;
  }

  totalPct = Number(totalPct.toFixed(2));
  if (totalPct > 100.001) {
    return {
      valid: false,
      totalPct,
      error: `Сумма долей виртуальных портфелей (${totalPct}%) не может превышать 100%`,
    };
  }

  return { valid: true, totalPct };
}

export function createDefaultVirtualPortfolios(totalAccountCapitalUsdt: number, nowTs: number = Date.now()): VirtualPortfolio[] {
  const baseCap = Math.max(0, Number(totalAccountCapitalUsdt) || 0);
  return DEFAULT_PORTFOLIO_ALLOCATIONS.map((spec) => {
    const allocatedCapitalUsdt = Number(((baseCap * spec.allocationPct) / 100).toFixed(2));
    return {
      id: spec.id,
      label: spec.label,
      strategyFamily: spec.strategyFamily,
      ownerBotIds: [...spec.ownerBotIds],
      allocationPct: spec.allocationPct,
      allocatedCapitalUsdt,
      freeCapitalUsdt: allocatedCapitalUsdt,
      reservedMarginUsdt: 0,
      realizedPnlUsdt: 0,
      unrealizedPnlUsdt: 0,
      feesPaidUsdt: 0,
      fundingPaidUsdt: 0,
      peakEquityUsdt: allocatedCapitalUsdt,
      drawdownPct: 0,
      maxRiskPerTradePct: spec.maxRiskPerTradePct,
      isTradingEnabled: spec.isTradingEnabled,
      closedTradesCount: 0,
      winningTradesCount: 0,
      decisionLog: [],
      updatedAt: nowTs,
    };
  });
}

export interface PortfolioPositionSnapshot {
  symbol: string;
  botId?: string;
  virtualPortfolioId?: string;
  qty: number;
  entryVwap: number;
  leverage: number;
  unrealizedPnl: number;
}

export function syncPortfoliosWithAccount(params: {
  portfolios: VirtualPortfolio[];
  totalAccountCapitalUsdt: number;
  activePositions: PortfolioPositionSnapshot[];
  nowTs?: number;
}): VirtualPortfolio[] {
  const nowTs = params.nowTs ?? Date.now();
  const baseAccount = Math.max(0, Number(params.totalAccountCapitalUsdt) || 0);
  const source =
    Array.isArray(params.portfolios) && params.portfolios.length > 0
      ? params.portfolios
      : createDefaultVirtualPortfolios(baseAccount, nowTs);

  const marginByPortfolio = new Map<string, number>();
  const upnlByPortfolio = new Map<string, number>();

  for (const pos of params.activePositions) {
    const vpId = pos.virtualPortfolioId || resolvePortfolioIdForStrategy(pos.botId);
    const margin = (Math.max(0, pos.entryVwap) * Math.max(0, pos.qty)) / Math.max(1, pos.leverage || 4);
    marginByPortfolio.set(vpId, (marginByPortfolio.get(vpId) || 0) + margin);
    upnlByPortfolio.set(vpId, (upnlByPortfolio.get(vpId) || 0) + (Number(pos.unrealizedPnl) || 0));
  }

  return source.map((vp) => {
    const baseAlloc = Number(((baseAccount * vp.allocationPct) / 100).toFixed(2));
    const allocatedCapitalUsdt = Math.max(0, Number((baseAlloc + (vp.realizedPnlUsdt || 0)).toFixed(2)));
    const reservedMarginUsdt = Number((marginByPortfolio.get(vp.id) || 0).toFixed(2));
    const unrealizedPnlUsdt = Number((upnlByPortfolio.get(vp.id) || 0).toFixed(2));
    const currentEquity = Math.max(0, allocatedCapitalUsdt + unrealizedPnlUsdt);
    const peakEquityUsdt = Math.max(vp.peakEquityUsdt || allocatedCapitalUsdt, currentEquity, baseAlloc);
    const drawdownPct =
      peakEquityUsdt > 0 ? Number(Math.max(0, ((peakEquityUsdt - currentEquity) / peakEquityUsdt) * 100).toFixed(2)) : 0;
    const freeCapitalUsdt = Number(Math.max(0, allocatedCapitalUsdt - reservedMarginUsdt).toFixed(2));

    return {
      ...vp,
      allocatedCapitalUsdt,
      reservedMarginUsdt,
      freeCapitalUsdt,
      unrealizedPnlUsdt,
      peakEquityUsdt: Number(peakEquityUsdt.toFixed(2)),
      drawdownPct,
      updatedAt: nowTs,
    };
  });
}

export function applyVirtualPortfolioTradeClose(params: {
  portfolios: VirtualPortfolio[];
  portfolioId: string;
  strategyId: string;
  symbol: string;
  realizedNetPnlUsdt: number;
  feeUsdt: number;
  fundingUsdt: number;
  nowTs?: number;
}): VirtualPortfolio[] {
  const nowTs = params.nowTs ?? Date.now();
  return params.portfolios.map((vp) => {
    if (vp.id !== params.portfolioId) return vp;
    const nextRealized = Number(((vp.realizedPnlUsdt || 0) + params.realizedNetPnlUsdt).toFixed(4));
    const nextFees = Number(((vp.feesPaidUsdt || 0) + Math.abs(params.feeUsdt || 0)).toFixed(4));
    const nextFunding = Number(((vp.fundingPaidUsdt || 0) + (params.fundingUsdt || 0)).toFixed(4));
    const closedTradesCount = (vp.closedTradesCount || 0) + 1;
    const winningTradesCount = (vp.winningTradesCount || 0) + (params.realizedNetPnlUsdt > 0 ? 1 : 0);
    const nextLog = [
      {
        timestamp: nowTs,
        strategyId: params.strategyId,
        symbol: params.symbol,
        action: 'CLOSE',
        note: `Net PnL: ${params.realizedNetPnlUsdt >= 0 ? '+' : ''}${params.realizedNetPnlUsdt.toFixed(2)} USDT`,
      },
      ...(vp.decisionLog || []),
    ].slice(0, 25);

    return {
      ...vp,
      realizedPnlUsdt: nextRealized,
      feesPaidUsdt: nextFees,
      fundingPaidUsdt: nextFunding,
      closedTradesCount,
      winningTradesCount,
      decisionLog: nextLog,
      updatedAt: nowTs,
    };
  });
}
