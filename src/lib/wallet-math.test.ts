import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClosedTradeMetrics,
  calculatePortfolioSummary,
  filterClosedTrades,
  buildEquityCurve,
  type ClosedTradeRecord,
} from './wallet-math';

test('calculateClosedTradeMetrics calculates LONG profit, fees, and ROE accurately', () => {
  const res = calculateClosedTradeMetrics({
    side: 'LONG',
    qty: 0.2,
    entryPrice: 68000,
    exitPrice: 69000,
    leverage: 10,
    fundingUsdt: -0.5,
    takerFeeRate: 0.00055,
  });

  // Gross PnL = (69000 - 68000) * 0.2 = 200.0
  assert.equal(res.grossPnlUsdt, 200);
  // Notional = (13600 + 13800) = 27400; fee = 27400 * 0.00055 = 15.07
  assert.equal(res.feeUsdt, 15.07);
  // Net PnL = 200 - 15.07 - 0.5 = 184.43
  assert.equal(res.netPnlUsdt, 184.43);
  assert.ok(res.roePct > 13.0);
});

test('calculateClosedTradeMetrics calculates SHORT profit and loss accurately', () => {
  const res = calculateClosedTradeMetrics({
    side: 'SHORT',
    qty: 10,
    entryPrice: 180,
    exitPrice: 170,
    leverage: 5,
    fundingUsdt: 0,
    takerFeeRate: 0.00055,
  });

  // Gross PnL = (170 - 180) * 10 * -1 = 100
  assert.equal(res.grossPnlUsdt, 100);
  assert.ok(res.netPnlUsdt < 100 && res.netPnlUsdt > 95);
});

test('calculatePortfolioSummary aggregates equity, margin, winRate, and profitFactor', () => {
  const trades: ClosedTradeRecord[] = [
    {
      id: 't1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      qty: 0.1,
      leverage: 10,
      entryPrice: 68000,
      exitPrice: 69200,
      grossPnlUsdt: 120,
      feeUsdt: 7.55,
      fundingUsdt: 0,
      netPnlUsdt: 112.45,
      roePct: 16.5,
      mode: 'SHADOW',
      exitReason: 'TP_HIT',
      botId: 'agent-onnx-ppo-v2',
      botName: 'ONNX PyTorch RL',
      openedAt: 1000,
      closedAt: 2000,
    },
    {
      id: 't2',
      symbol: 'SOLUSDT',
      side: 'SHORT',
      qty: 20,
      leverage: 10,
      entryPrice: 175,
      exitPrice: 177.5,
      grossPnlUsdt: -50,
      feeUsdt: 3.88,
      fundingUsdt: 0,
      netPnlUsdt: -53.88,
      roePct: -15.4,
      mode: 'SHADOW',
      exitReason: 'SL_HIT',
      botId: 'agent-lgbm-nightly',
      botName: 'LightGBM Momentum',
      openedAt: 1500,
      closedAt: 2500,
    },
  ];

  const active = [
    {
      symbol: 'ETHUSDT',
      side: 'LONG' as const,
      qty: 2,
      entryVwap: 3000,
      currentPrice: 3050,
      unrealizedPnl: 100,
      leverage: 10,
    },
  ];

  const summary = calculatePortfolioSummary(10000, active, trades);

  // Realized = 112.45 - 53.88 = 58.57
  assert.equal(summary.totalRealizedPnlUsdt, 58.57);
  assert.equal(summary.walletBalanceUsdt, 10058.57);
  assert.equal(summary.unrealizedPnlUsdt, 100);
  assert.equal(summary.totalEquityUsdt, 10158.57);
  // Used margin = (2 * 3000) / 10 = 600
  assert.equal(summary.usedMarginUsdt, 600);
  assert.equal(summary.winRatePct, 50);
  assert.equal(summary.profitFactor, Number((112.45 / 53.88).toFixed(2)));
});

test('filterClosedTrades filters by botId, outcome, symbolQuery, and timeWindow', () => {
  const nowTs = 100_000_000;
  const trades: ClosedTradeRecord[] = [
    {
      id: 't1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      qty: 0.1,
      leverage: 10,
      entryPrice: 68000,
      exitPrice: 69000,
      grossPnlUsdt: 100,
      feeUsdt: 5,
      fundingUsdt: 0,
      netPnlUsdt: 95,
      roePct: 14,
      mode: 'SHADOW',
      exitReason: 'TP_HIT',
      botId: 'agent-onnx-ppo-v2',
      botName: 'ONNX PyTorch RL',
      openedAt: nowTs - 3600_000,
      closedAt: nowTs - 1800_000, // 30m ago
    },
    {
      id: 't2',
      symbol: 'SOLUSDT',
      side: 'SHORT',
      qty: 10,
      leverage: 10,
      entryPrice: 180,
      exitPrice: 185,
      grossPnlUsdt: -50,
      feeUsdt: 2,
      fundingUsdt: 0,
      netPnlUsdt: -52,
      roePct: -28,
      mode: 'LIVE',
      exitReason: 'SL_HIT',
      botId: 'agent-lgbm-nightly',
      botName: 'LightGBM Momentum',
      openedAt: nowTs - 48 * 3600_000,
      closedAt: nowTs - 36 * 3600_000, // 36h ago
    },
  ];

  assert.equal(filterClosedTrades(trades, { outcome: 'WIN' }).length, 1);
  assert.equal(filterClosedTrades(trades, { outcome: 'LOSS' }).length, 1);
  assert.equal(filterClosedTrades(trades, { mode: 'LIVE' }).length, 1);
  assert.equal(filterClosedTrades(trades, { symbolQuery: 'sol' }).length, 1);
  assert.equal(filterClosedTrades(trades, { timeWindow: '24H', nowTs }).length, 1);
  assert.equal(filterClosedTrades(trades, { timeWindow: '7D', nowTs }).length, 2);
});

test('buildEquityCurve computes chronological points, High-Water Mark, and Drawdown %', () => {
  const nowTs = 200_000_000;
  const trades: ClosedTradeRecord[] = [
    {
      id: 't1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      qty: 0.2,
      leverage: 10,
      entryPrice: 68000,
      exitPrice: 69000,
      grossPnlUsdt: 210,
      feeUsdt: 10,
      fundingUsdt: 0,
      netPnlUsdt: 200,
      roePct: 14.7,
      mode: 'SHADOW',
      exitReason: 'TP_HIT',
      botId: 'agent-onnx-ppo-v2',
      botName: 'ONNX PyTorch RL',
      openedAt: nowTs - 7200_000,
      closedAt: nowTs - 5000_000,
    },
    {
      id: 't2',
      symbol: 'SOLUSDT',
      side: 'SHORT',
      qty: 20,
      leverage: 10,
      entryPrice: 175,
      exitPrice: 180,
      grossPnlUsdt: -100,
      feeUsdt: 2,
      fundingUsdt: 0,
      netPnlUsdt: -102,
      roePct: -29.1,
      mode: 'SHADOW',
      exitReason: 'SL_HIT',
      botId: 'agent-lgbm-nightly',
      botName: 'LightGBM Momentum',
      openedAt: nowTs - 4000_000,
      closedAt: nowTs - 2000_000,
    },
  ];

  const curve = buildEquityCurve({
    baseCapitalUsdt: 10000,
    closedTrades: trades,
    unrealizedPnlUsdt: 50,
    nowTs,
  });

  // Start (10000) -> Trade 1 (10200, HWM 10200) -> Trade 2 (10098, DD = 102/10200 = 1.0%) -> Live (10148)
  assert.equal(curve.points.length, 4);
  assert.equal(curve.startEquityUsdt, 10000);
  assert.equal(curve.peakEquityUsdt, 10200);
  assert.equal(curve.maxDrawdownPct, 1.0);
  assert.equal(curve.currentEquityUsdt, 10148);
  assert.equal(curve.periodNetChangeUsdt, 148);
});

