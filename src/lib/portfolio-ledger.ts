import type { VirtualPortfolio } from './virtual-portfolio.ts';

export type PortfolioLedgerEventType =
  | 'ALLOCATION'
  | 'RESERVE_MARGIN'
  | 'RELEASE_MARGIN'
  | 'EXCHANGE_FILL'
  | 'COMMISSION_FEE'
  | 'FUNDING_FEE'
  | 'REALIZED_PNL'
  | 'REBALANCE';

export interface PortfolioLedgerRecord {
  id: string;
  timestamp: number;
  virtualPortfolioId: string;
  strategyId: string;
  symbol: string;
  eventType: PortfolioLedgerEventType;
  amountUsdt: number;
  balanceAfterUsdt: number;
  clientOrderId?: string;
  exchangeOrderId?: string;
  description: string;
}

export interface ExchangeFillRecord {
  id: string;
  timestamp: number;
  clientOrderId: string;
  exchangeOrderId: string | null;
  strategyId: string;
  virtualPortfolioId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  filledQty: number;
  fillPrice: number;
  feeUsdt: number;
  mode: 'SHADOW' | 'LIVE';
}

export interface RiskEventRecord {
  id: string;
  timestamp: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code: string;
  symbol?: string;
  strategyId?: string;
  virtualPortfolioId?: string;
  reason: string;
  actionTaken: string;
}

export function createPortfolioLedgerEntry(params: {
  virtualPortfolioId: string;
  strategyId: string;
  symbol: string;
  eventType: PortfolioLedgerEventType;
  amountUsdt: number;
  balanceAfterUsdt: number;
  clientOrderId?: string;
  exchangeOrderId?: string;
  description: string;
  nowTs?: number;
}): PortfolioLedgerRecord {
  const nowTs = params.nowTs ?? Date.now();
  return {
    id: `led-${nowTs}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: nowTs,
    virtualPortfolioId: params.virtualPortfolioId,
    strategyId: params.strategyId,
    symbol: params.symbol,
    eventType: params.eventType,
    amountUsdt: Number((Number(params.amountUsdt) || 0).toFixed(4)),
    balanceAfterUsdt: Number((Number(params.balanceAfterUsdt) || 0).toFixed(4)),
    clientOrderId: params.clientOrderId,
    exchangeOrderId: params.exchangeOrderId,
    description: params.description,
  };
}

export function verifyPortfoliosReconcileWithAccount(params: {
  portfolios: VirtualPortfolio[];
  totalAccountCapitalUsdt: number;
  toleranceUsdt?: number;
}): {
  reconciled: boolean;
  totalAllocatedBasePct: number;
  sumVirtualAllocatedUsdt: number;
  sumRealizedPnlUsdt: number;
  expectedTotalUsdt: number;
  driftUsdt: number;
} {
  const tolerance = params.toleranceUsdt ?? 0.25;
  const totalAllocatedBasePct = Number(
    params.portfolios.reduce((acc, vp) => acc + (vp.allocationPct || 0), 0).toFixed(2)
  );
  const sumRealizedPnlUsdt = Number(
    params.portfolios.reduce((acc, vp) => acc + (vp.realizedPnlUsdt || 0), 0).toFixed(2)
  );
  const sumVirtualAllocatedUsdt = Number(
    params.portfolios.reduce((acc, vp) => acc + (vp.allocatedCapitalUsdt || 0), 0).toFixed(2)
  );
  const expectedTotalUsdt = Number(
    (((params.totalAccountCapitalUsdt * totalAllocatedBasePct) / 100) + sumRealizedPnlUsdt).toFixed(2)
  );
  const driftUsdt = Number(Math.abs(sumVirtualAllocatedUsdt - expectedTotalUsdt).toFixed(2));

  return {
    reconciled: totalAllocatedBasePct <= 100.01 && driftUsdt <= tolerance,
    totalAllocatedBasePct,
    sumVirtualAllocatedUsdt,
    sumRealizedPnlUsdt,
    expectedTotalUsdt,
    driftUsdt,
  };
}
