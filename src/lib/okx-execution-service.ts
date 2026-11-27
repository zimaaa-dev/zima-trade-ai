import { convertOkxContractsToBaseQty, type OkxSwapInstrument } from './okx-exchange.ts';

export type ExchangeOrderLifecycleStatus =
  | 'SUBMITTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'AMBIGUOUS_TIMEOUT';

export interface ExchangeOrderRecord {
  clientOrderId: string;
  exchangeOrderId: string | null;
  strategyId: string;
  virtualPortfolioId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  requestedQty: number;
  filledQty: number;
  averageFillPrice: number;
  fee: number;
  status: ExchangeOrderLifecycleStatus;
  createdAt: number;
  updatedAt: number;
  cancelReason?: string;
  protectionAlgoId?: string | null;
  protectionVerified: boolean;
}

export interface ParsedOkxOrderFill {
  found: boolean;
  ordId: string | null;
  clOrdId: string | null;
  state: 'live' | 'partially_filled' | 'filled' | 'canceled' | 'mmp_canceled' | 'unknown';
  filledContracts: number;
  filledBaseQty: number;
  remainingBaseQty: number;
  avgPx: number;
  feeUsdt: number;
  isTerminal: boolean;
  hasAnyFill: boolean;
}

export function generateDeterministicClOrdId(prefix: string = 'zt', nowTs: number = Date.now(), nonce?: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'zt';
  const rand = (nonce || Math.random().toString(36).slice(2, 8)).replace(/[^a-zA-Z0-9]/g, '');
  return `${cleanPrefix}${nowTs.toString(36)}${rand}`.slice(0, 32);
}

export function parseOkxOrderDetails(params: {
  orderRow: any;
  instrument: OkxSwapInstrument;
  requestedBaseQty: number;
}): ParsedOkxOrderFill {
  const row = params.orderRow;
  if (!row || typeof row !== 'object') {
    return {
      found: false,
      ordId: null,
      clOrdId: null,
      state: 'unknown',
      filledContracts: 0,
      filledBaseQty: 0,
      remainingBaseQty: params.requestedBaseQty,
      avgPx: 0,
      feeUsdt: 0,
      isTerminal: false,
      hasAnyFill: false,
    };
  }

  const rawState = String(row.state || '').toLowerCase();
  const state: ParsedOkxOrderFill['state'] =
    rawState === 'live' ||
    rawState === 'partially_filled' ||
    rawState === 'filled' ||
    rawState === 'canceled' ||
    rawState === 'mmp_canceled'
      ? rawState
      : 'unknown';

  const filledContracts = Math.max(0, parseFloat(String(row.accFillSz || '0')) || 0);
  const filledBaseQty =
    filledContracts > 0 ? convertOkxContractsToBaseQty(filledContracts, params.instrument) : 0;

  const avgPx =
    parseFloat(String(row.avgPx || '0')) ||
    parseFloat(String(row.fillPx || '0')) ||
    0;
  const rawFee = parseFloat(String(row.fee || '0'));
  const feeUsdt = Number.isFinite(rawFee) ? Number(Math.abs(rawFee).toFixed(6)) : 0;

  const isTerminal = state === 'filled' || state === 'canceled' || state === 'mmp_canceled';
  const remainingBaseQty = Math.max(0, Number((params.requestedBaseQty - filledBaseQty).toFixed(8)));

  return {
    found: true,
    ordId: row.ordId ? String(row.ordId) : null,
    clOrdId: row.clOrdId ? String(row.clOrdId) : null,
    state,
    filledContracts,
    filledBaseQty,
    remainingBaseQty,
    avgPx: Number.isFinite(avgPx) && avgPx > 0 ? avgPx : 0,
    feeUsdt,
    isTerminal,
    hasAnyFill: filledBaseQty > 0,
  };
}

export function shouldLookupOrderBeforeRetry(params: {
  submitOk: boolean;
  errorMsg?: string | null;
}): boolean {
  if (params.submitOk) return false;
  const lower = String(params.errorMsg || '').toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('socket') ||
    lower.includes('50004') ||
    lower.includes('50013') ||
    lower.includes('50026') ||
    lower.includes('50001') ||
    lower.includes('http 5') ||
    lower.includes('попыток:')
  );
}

export function evaluateProtectionSafety(params: {
  filledBaseQty: number;
  algoId?: string | null;
  fallbackSlOrderConfirmed?: boolean;
}): {
  safeToContinue: boolean;
  protectionVerified: boolean;
  blockFurtherRiskExpansion: boolean;
  reason?: string;
} {
  if (params.filledBaseQty <= 0) {
    return {
      safeToContinue: true,
      protectionVerified: false,
      blockFurtherRiskExpansion: false,
    };
  }

  const confirmed = Boolean(params.algoId) || Boolean(params.fallbackSlOrderConfirmed);
  if (confirmed) {
    return {
      safeToContinue: true,
      protectionVerified: true,
      blockFurtherRiskExpansion: false,
    };
  }

  return {
    safeToContinue: false,
    protectionVerified: false,
    blockFurtherRiskExpansion: true,
    reason: 'SL_PROTECTION_UNCONFIRMED_AFTER_FILL',
  };
}
