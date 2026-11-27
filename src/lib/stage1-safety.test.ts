import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeSafetyConfig,
  enforceDcaDisabledPatch,
  validateRuntimeSafetyConfig,
} from './runtime-config.ts';
import {
  buildMarketSnapshotMeta,
  canUseMarketDataForLiveEntry,
  validateOkxKlinesIntegrity,
  validateOkxOrderbookFreshness,
} from './okx-market-data.ts';
import {
  createOkxInstrumentRegistry,
  ingestOkxSwapCatalogRows,
  resolveInstrumentForOrder,
} from './okx-instrument-registry.ts';
import {
  evaluateProtectionSafety,
  generateDeterministicClOrdId,
  parseOkxOrderDetails,
  shouldLookupOrderBeforeRetry,
} from './okx-execution-service.ts';
import { reconcileStartupState } from './trade-reconciliation.ts';
import { DEFAULT_OKX_SWAP_INSTRUMENTS } from './okx-exchange.ts';
import { buildTrendGridPlan } from './bot-learning-math.ts';

test('Runtime config strictly locks DCA=OFF, Shadow-only learning, and Python LIVE isolation', () => {
  const cfg = buildRuntimeSafetyConfig({ activeExchange: 'OKX', mode: 'LIVE', okxDemoTrading: false });
  assert.equal(cfg.dcaEnabled, false);
  assert.equal(cfg.allowBybitFallbackInOkxLive, false);
  assert.equal(cfg.allowSyntheticDataInLive, false);
  assert.equal(cfg.allowPythonLiveExecution, false);
  assert.equal(cfg.shadowLearningMutatesActiveParams, false);
  assert.equal(cfg.trialRiskLimits.maxRiskPerTradePct, 0.5);
  assert.equal(cfg.trialRiskLimits.maxDailyDrawdownPct, 2.0);

  const invalid = validateRuntimeSafetyConfig({
    activeExchange: 'OKX',
    mode: 'LIVE',
    requestedDcaEnabled: true,
    requestedAllowPythonLive: true,
    requestedShadowAutoApply: true,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('DCA_LOCKED_OFF_CANNOT_BE_ENABLED'));
  assert.ok(invalid.errors.includes('PYTHON_LIVE_EXECUTION_FORBIDDEN'));
  assert.ok(invalid.errors.includes('SHADOW_LEARNING_CANNOT_MUTATE_PRODUCTION_PARAMS'));

  const patchRes = enforceDcaDisabledPatch({ riskPerTradePct: 1.0, dcaEnabled: true, enableDca: true });
  assert.equal(patchRes.rejectedDcaAttempt, true);
  assert.equal(patchRes.sanitized.dcaEnabled, false);
});

test('DCA=OFF produces empty safetyOrders and full single-shot baseOrderQty', () => {
  const plan = buildTrendGridPlan({
    side: 'SHORT',
    entryPrice: 100,
    totalPlannedQty: 1.5,
    atrPct: 1.5,
    qtyStep: 0.1,
    minQty: 0.1,
    priceDecimals: 2,
    dcaEnabled: false,
  });
  assert.equal(plan.safetyOrders.length, 0);
  assert.equal(plan.baseOrderQty, 1.5);
  assert.equal(plan.totalMaxQty, 1.5);
});

test('OKX Market Data blocks Bybit/synthetic fallback, stale books, and unclosed candles in OKX LIVE', () => {
  const now = 1_760_000_000_000;
  const book = {
    timestamp: now - 500,
    seqId: 100,
    bids: [{ price: 68000, qty: 2 }],
    asks: [{ price: 68005, qty: 2 }],
  };

  const bybitMeta = buildMarketSnapshotMeta({
    exchange: 'BYBIT',
    instId: 'BTCUSDT',
    symbol: 'BTCUSDT',
    sourceKind: 'BYBIT_FALLBACK',
    exchangeTs: now - 500,
    localTs: now - 400,
    connectionOk: true,
    complete: true,
    nowTs: now,
  });
  const bybitCheck = validateOkxOrderbookFreshness({
    book,
    meta: bybitMeta,
    mode: 'LIVE',
    activeExchange: 'OKX',
  });
  assert.equal(bybitCheck.allowed, false);
  assert.match(bybitCheck.reason || '', /OKX_LIVE_FORBIDS_NON_OKX_DATA/);

  const staleMeta = buildMarketSnapshotMeta({
    exchange: 'OKX',
    instId: 'BTC-USDT-SWAP',
    symbol: 'BTCUSDT',
    sourceKind: 'OKX_REST_WS',
    exchangeTs: now - 30_000,
    localTs: now - 30_000,
    seqId: 100,
    connectionOk: true,
    complete: true,
    nowTs: now,
  });
  const staleCheck = validateOkxOrderbookFreshness({
    book,
    meta: staleMeta,
    mode: 'LIVE',
    activeExchange: 'OKX',
  });
  assert.equal(staleCheck.allowed, false);
  assert.match(staleCheck.reason || '', /OKX_ORDERBOOK_STALE/);

  const freshMeta = buildMarketSnapshotMeta({
    exchange: 'OKX',
    instId: 'BTC-USDT-SWAP',
    symbol: 'BTCUSDT',
    sourceKind: 'OKX_REST_WS',
    exchangeTs: now - 500,
    localTs: now - 400,
    seqId: 105,
    connectionOk: true,
    complete: true,
    nowTs: now,
  });
  const okCheck = validateOkxOrderbookFreshness({
    book,
    meta: freshMeta,
    mode: 'LIVE',
    activeExchange: 'OKX',
    previousSeqId: 100,
  });
  assert.equal(okCheck.allowed, true);

  const bars = Array.from({ length: 16 }, (_, idx) => ({
    timestamp: now - (16 - idx) * 15 * 60_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
    turnover: 100_000,
    confirm: idx === 15 ? '0' : '1',
  }));
  const klineRes = validateOkxKlinesIntegrity({
    bars,
    sourceExchange: 'OKX',
    sourceKind: 'OKX_REST_WS',
    mode: 'LIVE',
    activeExchange: 'OKX',
    nowTs: now,
  });
  assert.equal(klineRes.allowed, true);
  assert.equal(klineRes.closedBars.length, 15);

  const gateRejected = canUseMarketDataForLiveEntry({
    mode: 'LIVE',
    activeExchange: 'OKX',
    orderbookVerdict: okCheck,
    klinesValid: true,
    tickersHealthy: false,
  });
  assert.equal(gateRejected.allowed, false);
});

test('OKX Instrument Registry blocks unverified default specs in LIVE and resolves verified catalog', () => {
  const now = 1_760_000_000_000;
  const reg = createOkxInstrumentRegistry(DEFAULT_OKX_SWAP_INSTRUMENTS);

  const unverifiedRes = resolveInstrumentForOrder({
    state: reg,
    symbol: 'SOLUSDT',
    mode: 'LIVE',
    activeExchange: 'OKX',
    referencePrice: 150,
    nowTs: now,
  });
  assert.equal(unverifiedRes.ok, false);
  assert.equal(unverifiedRes.reason, 'OKX_LIVE_UNVERIFIED_DEFAULT_SPEC:SOLUSDT');

  ingestOkxSwapCatalogRows(
    reg,
    [{ instId: 'SOL-USDT-SWAP', ctVal: '1', lotSz: '0.01', minSz: '0.01', tickSz: '0.01', lever: '50' }],
    now
  );

  const verifiedRes = resolveInstrumentForOrder({
    state: reg,
    symbol: 'SOLUSDT',
    mode: 'LIVE',
    activeExchange: 'OKX',
    referencePrice: 150,
    nowTs: now + 1000,
  });
  assert.equal(verifiedRes.ok, true);
  assert.equal(verifiedRes.instrument?.verifiedFromExchange, true);

  const unknownRes = resolveInstrumentForOrder({
    state: reg,
    symbol: 'FAKEUSDT',
    mode: 'LIVE',
    activeExchange: 'OKX',
    referencePrice: 1,
    nowTs: now + 1000,
  });
  assert.equal(unknownRes.ok, false);
  assert.equal(unknownRes.reason, 'OKX_LIVE_UNKNOWN_INSTRUMENT:FAKEUSDT');
});

test('OKX Execution Service parses partial fill accFillSz/avgPx/fee, lookup-before-retry, and SL protection', () => {
  const clOrdId = generateDeterministicClOrdId('zt', 1_760_000_000_000, 'abc123');
  assert.ok(clOrdId.startsWith('zt'));
  assert.ok(clOrdId.length <= 32);

  const parsed = parseOkxOrderDetails({
    orderRow: {
      ordId: '99887766',
      clOrdId,
      state: 'partially_filled',
      accFillSz: '0.5',
      avgPx: '148.25',
      fee: '-0.0371',
    },
    instrument: DEFAULT_OKX_SWAP_INSTRUMENTS.SOLUSDT,
    requestedBaseQty: 1.0,
  });
  assert.equal(parsed.found, true);
  assert.equal(parsed.state, 'partially_filled');
  assert.equal(parsed.filledBaseQty, 0.5);
  assert.equal(parsed.remainingBaseQty, 0.5);
  assert.equal(parsed.avgPx, 148.25);
  assert.equal(parsed.feeUsdt, 0.0371);

  assert.equal(shouldLookupOrderBeforeRetry({ submitOk: false, errorMsg: 'ETIMEDOUT 50004' }), true);
  assert.equal(shouldLookupOrderBeforeRetry({ submitOk: false, errorMsg: '[51008] Insufficient margin' }), false);

  const unsafeProt = evaluateProtectionSafety({ filledBaseQty: 0.5, algoId: null, fallbackSlOrderConfirmed: false });
  assert.equal(unsafeProt.safeToContinue, false);
  assert.equal(unsafeProt.blockFurtherRiskExpansion, true);

  const safeProt = evaluateProtectionSafety({ filledBaseQty: 0.5, algoId: 'algo-123' });
  assert.equal(safeProt.safeToContinue, true);
  assert.equal(safeProt.protectionVerified, true);
});

test('Startup Reconciliation transitions RECOVERY -> READY, flags ORPHANED without closing, or DEGRADED on sync fail', () => {
  const degraded = reconcileStartupState({
    mode: 'LIVE',
    activeExchange: 'OKX',
    okxKeysConfigured: true,
    okxSyncOk: false,
    instrumentCatalogVerified: true,
    activePositions: [],
    okxOpenPositions: [],
  });
  assert.equal(degraded.nextPhase, 'DEGRADED');
  assert.equal(degraded.allowNewLiveEntries, false);

  const readyOrphan = reconcileStartupState({
    mode: 'LIVE',
    activeExchange: 'OKX',
    okxKeysConfigured: true,
    okxSyncOk: true,
    instrumentCatalogVerified: true,
    activePositions: [],
    okxOpenPositions: [
      {
        instId: 'XRP-USDT-SWAP',
        symbol: 'XRPUSDT',
        side: 'SHORT',
        posSide: 'net',
        mgnMode: 'isolated',
        posContracts: -1,
        avgPx: 2.1,
        markPx: 2.09,
        uplUsdt: 1.0,
        marginUsdt: 50,
        lever: 4,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
  });
  assert.equal(readyOrphan.nextPhase, 'READY');
  assert.equal(readyOrphan.allowNewLiveEntries, true);
  assert.equal(readyOrphan.orphanedExchangePositions.length, 1);
  assert.deepEqual(readyOrphan.blockedSymbols, ['XRPUSDT']);
});
