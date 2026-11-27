export type OwnershipStatus = 'ACTIVE' | 'CLOSING' | 'ORPHANED';

export interface PositionOwnershipRecord {
  symbol: string;
  side: 'LONG' | 'SHORT';
  ownerStrategyId: string;
  ownerPortfolioId: string;
  clientOrderId?: string;
  exchangeOrderId?: string | null;
  acquiredAt: number;
  status: OwnershipStatus;
}

export function normalizeSymbolKey(symbol: string): string {
  return String(symbol || '').trim().toUpperCase().replace(/-SWAP$/i, '').replace(/-/g, '');
}

export function checkOwnershipForEntry(params: {
  ownershipRecords: PositionOwnershipRecord[];
  symbol: string;
  side: 'LONG' | 'SHORT';
  strategyId: string;
  portfolioId: string;
  okxPosMode?: 'net_mode' | 'long_short_mode';
}): {
  allowed: boolean;
  reason?: string;
  conflictOwner?: PositionOwnershipRecord;
} {
  const sym = normalizeSymbolKey(params.symbol);
  const posMode = params.okxPosMode ?? 'net_mode';

  const existingSameSymbol = params.ownershipRecords.filter((r) => normalizeSymbolKey(r.symbol) === sym);

  for (const record of existingSameSymbol) {
    if (record.status === 'ORPHANED') {
      return {
        allowed: false,
        reason: `SYMBOL_ORPHANED_BLOCKED:${sym}`,
        conflictOwner: record,
      };
    }

    if (posMode === 'net_mode') {
      return {
        allowed: false,
        reason: `SYMBOL_OWNED_IN_NET_MODE:${sym}:owner=${record.ownerStrategyId}:${record.side}`,
        conflictOwner: record,
      };
    }

    if (record.side === params.side) {
      return {
        allowed: false,
        reason: `SYMBOL_SIDE_ALREADY_OWNED:${sym}:${record.side}:owner=${record.ownerStrategyId}`,
        conflictOwner: record,
      };
    }
  }

  return { allowed: true };
}

export function acquirePositionOwnership(
  ownershipRecords: PositionOwnershipRecord[],
  record: Omit<PositionOwnershipRecord, 'symbol' | 'acquiredAt' | 'status'> & {
    symbol: string;
    acquiredAt?: number;
    status?: OwnershipStatus;
  }
): PositionOwnershipRecord[] {
  const sym = normalizeSymbolKey(record.symbol);
  const next: PositionOwnershipRecord = {
    symbol: sym,
    side: record.side,
    ownerStrategyId: record.ownerStrategyId,
    ownerPortfolioId: record.ownerPortfolioId,
    clientOrderId: record.clientOrderId,
    exchangeOrderId: record.exchangeOrderId ?? null,
    acquiredAt: record.acquiredAt ?? Date.now(),
    status: record.status ?? 'ACTIVE',
  };

  const filtered = ownershipRecords.filter(
    (r) => !(normalizeSymbolKey(r.symbol) === sym && r.side === record.side)
  );
  return [...filtered, next];
}

export function authorizePositionClose(params: {
  ownershipRecords: PositionOwnershipRecord[];
  symbol: string;
  side: 'LONG' | 'SHORT';
  requesterStrategyId: string;
  isRiskOrOperatorOverride?: boolean;
}): { allowed: boolean; reason?: string; ownerRecord?: PositionOwnershipRecord } {
  const sym = normalizeSymbolKey(params.symbol);
  const matching = params.ownershipRecords.find(
    (r) => normalizeSymbolKey(r.symbol) === sym && r.side === params.side
  );

  if (!matching) {
    return { allowed: true };
  }

  if (matching.status === 'ORPHANED' && !params.isRiskOrOperatorOverride) {
    return {
      allowed: false,
      reason: `ORPHANED_POSITION_REQUIRES_OPERATOR_ACTION:${sym}`,
      ownerRecord: matching,
    };
  }

  if (params.isRiskOrOperatorOverride) {
    return { allowed: true, ownerRecord: matching };
  }

  if (matching.ownerStrategyId !== params.requesterStrategyId) {
    return {
      allowed: false,
      reason: `OWNERSHIP_MISMATCH_CLOSE_BLOCKED:${sym}:owner=${matching.ownerStrategyId}:requester=${params.requesterStrategyId}`,
      ownerRecord: matching,
    };
  }

  return { allowed: true, ownerRecord: matching };
}

export function releasePositionOwnership(
  ownershipRecords: PositionOwnershipRecord[],
  symbol: string,
  side?: 'LONG' | 'SHORT'
): PositionOwnershipRecord[] {
  const sym = normalizeSymbolKey(symbol);
  return ownershipRecords.filter((r) => {
    if (normalizeSymbolKey(r.symbol) !== sym) return true;
    if (side && r.side !== side) return true;
    return false;
  });
}
