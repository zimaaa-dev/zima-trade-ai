import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  toOkxSwapInstId,
  fromOkxSwapInstId,
  DEFAULT_OKX_SWAP_INSTRUMENTS,
  buildOkxInstrumentRules,
  convertBaseQtyToOkxContracts,
  convertOkxContractsToBaseQty,
  buildOkxV5Signature,
  buildOkxV5Headers,
  buildOkxSetLeveragePayload,
  buildOkxMarketOrderPayload,
  buildOkxAmendAlgoPayload,
} from './okx-exchange.ts';

test('OKX instId normalization round-trips cleanly', () => {
  assert.equal(toOkxSwapInstId('BTCUSDT'), 'BTC-USDT-SWAP');
  assert.equal(toOkxSwapInstId('xrp-usdt-swap'), 'XRP-USDT-SWAP');
  assert.equal(fromOkxSwapInstId('SOL-USDT-SWAP'), 'SOLUSDT');
});

test('OKX real SWAP contract rules fit $100 account cleanly (BTC min 0.0001 BTC vs Bybit 0.001)', () => {
  const btcInst = DEFAULT_OKX_SWAP_INSTRUMENTS.BTCUSDT;
  const btcRules = buildOkxInstrumentRules(btcInst, 61600);
  assert.equal(btcRules.exchange, 'okx');
  assert.equal(btcRules.minQty, 0.0001);
  assert.equal(btcRules.qtyStep, 0.0001);
  assert.ok(btcRules.minNotional > 6 && btcRules.minNotional < 7);

  // Convert 0.00045 BTC -> floor to 0.04 contracts (0.04 * 0.01 = 0.0004 BTC)
  const conv = convertBaseQtyToOkxContracts(0.00045, btcInst);
  assert.equal(conv.ok, true);
  assert.equal(conv.contracts, 0.04);
  assert.equal(conv.contractsSz, '0.04');
  assert.equal(conv.actualBaseQty, 0.0004);
  assert.equal(convertOkxContractsToBaseQty(0.04, btcInst), 0.0004);

  // Reject tiny order below minSz
  const tiny = convertBaseQtyToOkxContracts(0.00005, btcInst);
  assert.equal(tiny.ok, false);

  // BNB-USDT-SWAP has ctVal=0.01, lotSz=1, minSz=1 -> 0.055 BNB -> 5 contracts = 0.05 BNB
  const bnbConv = convertBaseQtyToOkxContracts(0.055, DEFAULT_OKX_SWAP_INSTRUMENTS.BNBUSDT);
  assert.equal(bnbConv.ok, true);
  assert.equal(bnbConv.contractsSz, '5');
  assert.equal(bnbConv.actualBaseQty, 0.05);
});

test('OKX V5 HMAC-SHA256 Base64 signature and Demo Trading header', () => {
  const ts = '2026-11-19T21:40:00.000Z';
  const body = '{"instId":"BTC-USDT-SWAP","tdMode":"isolated","side":"buy","ordType":"market","sz":"0.04"}';
  const sig = buildOkxV5Signature({
    timestampIso: ts,
    method: 'POST',
    requestPath: '/api/v5/trade/order',
    body,
    secretKey: 'test_okx_secret',
  });
  const expected = crypto
    .createHmac('sha256', 'test_okx_secret')
    .update(`${ts}POST/api/v5/trade/order${body}`)
    .digest('base64');
  assert.equal(sig, expected);

  const demoHeaders = buildOkxV5Headers({
    apiKey: 'k1',
    secretKey: 'test_okx_secret',
    passphrase: 'p1',
    method: 'POST',
    requestPath: '/api/v5/trade/order',
    body,
    isDemo: true,
    timestampIso: ts,
  });
  assert.equal(demoHeaders['x-simulated-trading'], '1');
  assert.equal(demoHeaders['OK-ACCESS-SIGN'], expected);

  const liveHeaders = buildOkxV5Headers({
    apiKey: 'k1',
    secretKey: 'test_okx_secret',
    passphrase: 'p1',
    method: 'GET',
    requestPath: '/api/v5/account/balance?ccy=USDT',
    isDemo: false,
    timestampIso: ts,
  });
  assert.equal(liveHeaders['x-simulated-trading'], undefined);
});

test('OKX One-Way (net_mode) leverage, entry with attached Algo SL/TP, reduceOnly close, and amend-algos payloads', () => {
  const lev = buildOkxSetLeveragePayload({ symbol: 'XRPUSDT', leverage: 4, posMode: 'net_mode' });
  assert.deepEqual(lev, { instId: 'XRP-USDT-SWAP', lever: '4', mgnMode: 'isolated' });

  const openPayload = buildOkxMarketOrderPayload({
    symbol: 'XRPUSDT',
    side: 'SHORT',
    contractsSz: '0.45',
    slTriggerPrice: 0.992,
    tpTriggerPrice: 0.941,
    priceDecimals: 4,
    posMode: 'net_mode',
  });
  assert.equal(openPayload.instId, 'XRP-USDT-SWAP');
  assert.equal(openPayload.tdMode, 'isolated');
  assert.equal(openPayload.side, 'sell');
  assert.equal(openPayload.reduceOnly, undefined);
  assert.equal(openPayload.attachAlgoOrds[0].slTriggerPx, '0.9920');
  assert.equal(openPayload.attachAlgoOrds[0].tpTriggerPx, '0.9410');

  const closePayload = buildOkxMarketOrderPayload({
    symbol: 'XRPUSDT',
    side: 'SHORT',
    contractsSz: '0.45',
    reduceOnly: true,
    posMode: 'net_mode',
  });
  assert.equal(closePayload.side, 'buy');
  assert.equal(closePayload.reduceOnly, true);
  assert.equal(closePayload.attachAlgoOrds, undefined);

  const amend = buildOkxAmendAlgoPayload({
    symbol: 'XRPUSDT',
    algoId: '987654321',
    slTriggerPrice: 0.958,
    tpTriggerPrice: 0.935,
    priceDecimals: 4,
  });
  assert.equal(amend.algoId, '987654321');
  assert.equal(amend.newSlTriggerPx, '0.9580');
  assert.equal(amend.newTpTriggerPx, '0.9350');
});
