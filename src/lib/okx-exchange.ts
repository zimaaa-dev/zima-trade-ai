import crypto from 'node:crypto';
import type { InstrumentRules } from './engine-math.ts';

export interface OkxSwapInstrument {
  instId: string;
  symbol: string;
  ctVal: number;
  lotSz: number;
  minSz: number;
  tickSz: number;
  maxLever: number;
}

export type OkxPositionMode = 'net_mode' | 'long_short_mode';

export function toOkxSwapInstId(symbol: string): string {
  const clean = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (clean.endsWith('-USDT-SWAP')) return clean;
  if (clean.endsWith('USDT')) {
    return `${clean.slice(0, -4)}-USDT-SWAP`;
  }
  return `${clean}-USDT-SWAP`;
}

export function fromOkxSwapInstId(instId: string): string {
  const parts = String(instId || '').toUpperCase().split('-');
  if (parts.length >= 2 && parts[1] === 'USDT') {
    return `${parts[0]}USDT`;
  }
  return String(instId || '').replace(/[^A-Z0-9]/g, '');
}

const RAW_OKX_SWAP_SPECS: Array<Omit<OkxSwapInstrument, 'symbol'>> = [
  { instId: 'BTC-USDT-SWAP', ctVal: 0.01, lotSz: 0.01, minSz: 0.01, tickSz: 0.1, maxLever: 100 },
  { instId: 'ETH-USDT-SWAP', ctVal: 0.1, lotSz: 0.01, minSz: 0.01, tickSz: 0.01, maxLever: 100 },
  { instId: 'SOL-USDT-SWAP', ctVal: 1, lotSz: 0.01, minSz: 0.01, tickSz: 0.01, maxLever: 100 },
  { instId: 'XRP-USDT-SWAP', ctVal: 100, lotSz: 0.01, minSz: 0.01, tickSz: 0.0001, maxLever: 100 },
  { instId: 'BNB-USDT-SWAP', ctVal: 0.01, lotSz: 1, minSz: 1, tickSz: 0.01, maxLever: 50 },
  { instId: 'DOGE-USDT-SWAP', ctVal: 1000, lotSz: 0.01, minSz: 0.01, tickSz: 0.00001, maxLever: 50 },
  { instId: 'ADA-USDT-SWAP', ctVal: 100, lotSz: 0.1, minSz: 0.1, tickSz: 0.0001, maxLever: 50 },
  { instId: 'AVAX-USDT-SWAP', ctVal: 1, lotSz: 0.1, minSz: 0.1, tickSz: 0.001, maxLever: 50 },
  { instId: 'LINK-USDT-SWAP', ctVal: 1, lotSz: 0.1, minSz: 0.1, tickSz: 0.001, maxLever: 50 },
  { instId: 'SUI-USDT-SWAP', ctVal: 1, lotSz: 1, minSz: 1, tickSz: 0.0001, maxLever: 50 },
  { instId: 'NEAR-USDT-SWAP', ctVal: 10, lotSz: 0.1, minSz: 0.1, tickSz: 0.001, maxLever: 50 },
  { instId: 'LTC-USDT-SWAP', ctVal: 1, lotSz: 0.1, minSz: 0.1, tickSz: 0.01, maxLever: 50 },
  { instId: 'BCH-USDT-SWAP', ctVal: 0.1, lotSz: 0.1, minSz: 0.1, tickSz: 0.01, maxLever: 50 },
  { instId: 'DOT-USDT-SWAP', ctVal: 1, lotSz: 1, minSz: 1, tickSz: 0.0001, maxLever: 50 },
  { instId: 'UNI-USDT-SWAP', ctVal: 1, lotSz: 1, minSz: 1, tickSz: 0.001, maxLever: 50 },
  { instId: 'AAVE-USDT-SWAP', ctVal: 0.1, lotSz: 0.1, minSz: 0.1, tickSz: 0.01, maxLever: 50 },
  { instId: 'APT-USDT-SWAP', ctVal: 1, lotSz: 1, minSz: 1, tickSz: 0.0001, maxLever: 50 },
  { instId: 'INJ-USDT-SWAP', ctVal: 0.1, lotSz: 1, minSz: 1, tickSz: 0.001, maxLever: 50 },
  { instId: 'ARB-USDT-SWAP', ctVal: 10, lotSz: 0.1, minSz: 0.1, tickSz: 0.00001, maxLever: 50 },
  { instId: 'OP-USDT-SWAP', ctVal: 1, lotSz: 1, minSz: 1, tickSz: 0.00001, maxLever: 50 },
];

export const DEFAULT_OKX_SWAP_INSTRUMENTS: Record<string, OkxSwapInstrument> = Object.fromEntries(
  RAW_OKX_SWAP_SPECS.map((s) => {
    const symbol = fromOkxSwapInstId(s.instId);
    return [symbol, { ...s, symbol }];
  })
);

function decimalPrecisionFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 4;
  if (step >= 1) return 0;
  return Math.max(0, Math.min(8, Math.ceil(-Math.log10(step) - 1e-9)));
}

/**
 * Converts a real OKX SWAP contract specification (ctVal, lotSz, minSz, tickSz)
 * into base-coin InstrumentRules compatible with the Risk Firewall & Trend-Grid planner.
 */
export function buildOkxInstrumentRules(
  inst: OkxSwapInstrument,
  referencePrice?: number
): InstrumentRules {
  const qtyStepRaw = inst.lotSz * inst.ctVal;
  const minQtyRaw = inst.minSz * inst.ctVal;
  const qtyPrec = decimalPrecisionFromStep(qtyStepRaw);
  const qtyStep = Number(qtyStepRaw.toFixed(qtyPrec));
  const minQty = Number(minQtyRaw.toFixed(qtyPrec));
  const minNotional =
    referencePrice && referencePrice > 0
      ? Number((minQty * referencePrice).toFixed(4))
      : 0.5;

  return {
    exchange: 'okx',
    symbol: inst.symbol,
    tickSize: inst.tickSz,
    qtyStep,
    minQty,
    minNotional,
    maxLeverage: Math.min(20, Math.max(1, inst.maxLever || 20)),
  };
}

/**
 * Converts a base-asset quantity (e.g. 0.00045 BTC) into valid OKX SWAP contracts (`sz`)
 * rounded down to `lotSz` and verified >= `minSz`.
 */
export function convertBaseQtyToOkxContracts(
  baseQty: number,
  inst: OkxSwapInstrument
): {
  ok: boolean;
  contracts: number;
  contractsSz: string;
  actualBaseQty: number;
  reason?: string;
} {
  if (!Number.isFinite(baseQty) || baseQty <= 0) {
    return { ok: false, contracts: 0, contractsSz: '0', actualBaseQty: 0, reason: 'Некорректный объем baseQty' };
  }
  const ctVal = inst.ctVal > 0 ? inst.ctVal : 1;
  const lotSz = inst.lotSz > 0 ? inst.lotSz : 1;
  const minSz = inst.minSz > 0 ? inst.minSz : lotSz;

  const rawContracts = baseQty / ctVal;
  const lotPrec = decimalPrecisionFromStep(lotSz);
  const floored = Number((Math.floor((rawContracts + 1e-12) / lotSz) * lotSz).toFixed(lotPrec));

  if (floored < minSz) {
    return {
      ok: false,
      contracts: 0,
      contractsSz: '0',
      actualBaseQty: 0,
      reason: `Объем ${baseQty} (${rawContracts.toFixed(4)} контр.) меньше минимального лота OKX ${minSz} контр. (min ${(minSz * ctVal).toFixed(6)} ${inst.symbol.replace('USDT', '')})`,
    };
  }

  const basePrec = decimalPrecisionFromStep(lotSz * ctVal);
  const actualBaseQty = Number((floored * ctVal).toFixed(basePrec));

  return {
    ok: true,
    contracts: floored,
    contractsSz: floored.toFixed(lotPrec),
    actualBaseQty,
  };
}

export function convertOkxContractsToBaseQty(contracts: number, inst: OkxSwapInstrument): number {
  const prec = decimalPrecisionFromStep((inst.lotSz || 1) * (inst.ctVal || 1));
  return Number((contracts * (inst.ctVal || 1)).toFixed(prec));
}

/**
 * Generates OKX V5 Base64 HMAC-SHA256 signature:
 * sign = Base64(HMAC_SHA256(timestamp + method.toUpperCase() + requestPath + body, secretKey))
 */
export function buildOkxV5Signature(params: {
  timestampIso: string;
  method: string;
  requestPath: string;
  body?: string;
  secretKey: string;
}): string {
  const prehash = `${params.timestampIso}${params.method.toUpperCase()}${params.requestPath}${params.body || ''}`;
  return crypto
    .createHmac('sha256', params.secretKey.trim())
    .update(prehash)
    .digest('base64');
}

export function buildOkxV5Headers(params: {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  method: string;
  requestPath: string;
  body?: string;
  isDemo: boolean;
  timestampIso?: string;
}): Record<string, string> {
  const timestampIso = params.timestampIso || new Date().toISOString();
  const sign = buildOkxV5Signature({
    timestampIso,
    method: params.method,
    requestPath: params.requestPath,
    body: params.body || '',
    secretKey: params.secretKey,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'OK-ACCESS-KEY': params.apiKey.trim(),
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestampIso,
    'OK-ACCESS-PASSPHRASE': params.passphrase.trim(),
  };

  if (params.isDemo) {
    headers['x-simulated-trading'] = '1';
  }

  return headers;
}

export function buildOkxSetLeveragePayload(params: {
  symbol: string;
  leverage: number;
  side?: 'LONG' | 'SHORT';
  posMode?: OkxPositionMode;
}): Record<string, string> {
  const payload: Record<string, string> = {
    instId: toOkxSwapInstId(params.symbol),
    lever: String(Math.max(1, Math.min(20, Math.round(params.leverage)))),
    mgnMode: 'isolated',
  };
  if (params.posMode === 'long_short_mode' && params.side) {
    payload.posSide = params.side === 'LONG' ? 'long' : 'short';
  }
  return payload;
}

export function buildOkxMarketOrderPayload(params: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  contractsSz: string;
  reduceOnly?: boolean;
  slTriggerPrice?: number;
  tpTriggerPrice?: number;
  priceDecimals?: number;
  clOrdId?: string;
  attachAlgoClOrdId?: string;
  posMode?: OkxPositionMode;
}): Record<string, any> {
  const isBuy = params.reduceOnly ? params.side === 'SHORT' : params.side === 'LONG';
  const payload: Record<string, any> = {
    instId: toOkxSwapInstId(params.symbol),
    tdMode: 'isolated',
    side: isBuy ? 'buy' : 'sell',
    ordType: 'market',
    sz: params.contractsSz,
  };

  if (params.posMode === 'long_short_mode') {
    payload.posSide = params.side === 'LONG' ? 'long' : 'short';
  } else if (params.reduceOnly) {
    payload.reduceOnly = true;
  }

  if (params.clOrdId) {
    payload.clOrdId = params.clOrdId.slice(0, 32);
  }

  const prec = params.priceDecimals ?? 4;
  if (!params.reduceOnly && (params.slTriggerPrice || params.tpTriggerPrice)) {
    const algo: Record<string, string> = {};
    if (params.attachAlgoClOrdId) {
      algo.attachAlgoClOrdId = params.attachAlgoClOrdId.slice(0, 32);
    }
    if (params.tpTriggerPrice && params.tpTriggerPrice > 0) {
      algo.tpTriggerPx = Number(params.tpTriggerPrice).toFixed(prec);
      algo.tpOrdPx = '-1';
      algo.tpTriggerPxType = 'mark';
    }
    if (params.slTriggerPrice && params.slTriggerPrice > 0) {
      algo.slTriggerPx = Number(params.slTriggerPrice).toFixed(prec);
      algo.slOrdPx = '-1';
      algo.slTriggerPxType = 'mark';
    }
    payload.attachAlgoOrds = [algo];
  }

  return payload;
}

export function buildOkxAmendAlgoPayload(params: {
  symbol: string;
  algoId: string;
  slTriggerPrice?: number;
  tpTriggerPrice?: number;
  priceDecimals?: number;
}): Record<string, string> {
  const prec = params.priceDecimals ?? 4;
  const payload: Record<string, string> = {
    instId: toOkxSwapInstId(params.symbol),
    algoId: params.algoId,
  };
  if (params.slTriggerPrice && params.slTriggerPrice > 0) {
    payload.newSlTriggerPx = Number(params.slTriggerPrice).toFixed(prec);
    payload.newSlOrdPx = '-1';
    payload.newSlTriggerPxType = 'mark';
  }
  if (params.tpTriggerPrice && params.tpTriggerPrice > 0) {
    payload.newTpTriggerPx = Number(params.tpTriggerPrice).toFixed(prec);
    payload.newTpOrdPx = '-1';
    payload.newTpTriggerPxType = 'mark';
  }
  return payload;
}
