import type { ExchangeId, ExecutionMode } from '../types.ts';
import {
  buildOkxInstrumentRules,
  fromOkxSwapInstId,
  type OkxSwapInstrument,
} from './okx-exchange.ts';
import type { InstrumentRules } from './engine-math.ts';

export interface OkxInstrumentRegistryEntry extends OkxSwapInstrument {
  minNotional?: number;
  verifiedFromExchange: boolean;
  fetchedAt: number;
}

export interface OkxInstrumentRegistryState {
  entries: Record<string, OkxInstrumentRegistryEntry>;
  lastRefreshedAt: number;
  lastRefreshOk: boolean;
  lastError: string | null;
}

export function createOkxInstrumentRegistry(
  seedMap?: Record<string, OkxSwapInstrument>
): OkxInstrumentRegistryState {
  const entries: Record<string, OkxInstrumentRegistryEntry> = {};
  if (seedMap) {
    for (const [sym, inst] of Object.entries(seedMap)) {
      entries[sym.toUpperCase()] = {
        ...inst,
        symbol: sym.toUpperCase(),
        verifiedFromExchange: false,
        fetchedAt: 0,
      };
    }
  }
  return {
    entries,
    lastRefreshedAt: 0,
    lastRefreshOk: false,
    lastError: null,
  };
}

export function ingestOkxSwapCatalogRows(
  state: OkxInstrumentRegistryState,
  rows: any[],
  nowTs: number = Date.now()
): number {
  let verifiedCount = 0;
  for (const row of rows) {
    const instId = String(row?.instId || '').toUpperCase();
    if (!instId.endsWith('-USDT-SWAP')) continue;
    const symbol = fromOkxSwapInstId(instId);
    const ctVal = parseFloat(String(row?.ctVal || '0'));
    const lotSz = parseFloat(String(row?.lotSz || '0'));
    const minSz = parseFloat(String(row?.minSz || '0'));
    const tickSz = parseFloat(String(row?.tickSz || '0'));
    const maxLever = parseFloat(String(row?.lever || '20'));
    const minNotionalRaw = parseFloat(String(row?.minNotional || '0'));

    if (ctVal > 0 && lotSz > 0 && minSz > 0 && tickSz > 0) {
      state.entries[symbol] = {
        instId,
        symbol,
        ctVal,
        lotSz,
        minSz,
        tickSz,
        maxLever: Number.isFinite(maxLever) && maxLever > 0 ? maxLever : 20,
        minNotional: Number.isFinite(minNotionalRaw) && minNotionalRaw > 0 ? minNotionalRaw : undefined,
        verifiedFromExchange: true,
        fetchedAt: nowTs,
      };
      verifiedCount += 1;
    }
  }

  if (verifiedCount > 0) {
    state.lastRefreshedAt = nowTs;
    state.lastRefreshOk = true;
    state.lastError = null;
  }
  return verifiedCount;
}

export function resolveInstrumentForOrder(params: {
  state: OkxInstrumentRegistryState;
  symbol: string;
  mode: ExecutionMode;
  activeExchange: ExchangeId;
  referencePrice?: number;
  maxCatalogAgeMs?: number;
  nowTs?: number;
}): {
  ok: boolean;
  instrument?: OkxInstrumentRegistryEntry;
  rules?: InstrumentRules;
  reason?: string;
} {
  const sym = String(params.symbol || '').trim().toUpperCase();
  const entry = params.state.entries[sym];
  const nowTs = params.nowTs ?? Date.now();
  const maxAgeMs = params.maxCatalogAgeMs ?? 60 * 60_000; // 1 hour max catalog staleness in LIVE

  const isOkxLive = params.mode === 'LIVE' && params.activeExchange === 'OKX';

  if (isOkxLive) {
    if (!entry) {
      return {
        ok: false,
        reason: `OKX_LIVE_UNKNOWN_INSTRUMENT:${sym}`,
      };
    }
    if (!entry.verifiedFromExchange || entry.fetchedAt <= 0) {
      return {
        ok: false,
        reason: `OKX_LIVE_UNVERIFIED_DEFAULT_SPEC:${sym}`,
      };
    }
    if (nowTs - entry.fetchedAt > maxAgeMs) {
      return {
        ok: false,
        reason: `OKX_LIVE_STALE_INSTRUMENT_SPEC:${sym}`,
      };
    }
  }

  if (!entry) {
    return {
      ok: false,
      reason: `INSTRUMENT_SPEC_MISSING:${sym}`,
    };
  }

  const rules = buildOkxInstrumentRules(entry, params.referencePrice);
  if (typeof entry.minNotional === 'number' && entry.minNotional > 0) {
    rules.minNotional = Math.max(rules.minNotional, entry.minNotional);
  }

  return {
    ok: true,
    instrument: entry,
    rules,
  };
}
