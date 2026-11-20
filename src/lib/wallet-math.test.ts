import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClosedTradeMetrics,
  calculatePortfolioSummary,
  filterClosedTrades,
  buildEquityCurve,
  computeMskPeriodBounds,
  calculateMskPeriodBreakdown,
  formatTelegramPeriodSummaryHtml,
  shouldSendDailyTelegramDigest,
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

test('calculatePortfolioSummary and filterClosedTrades exclude synthetic seed trades by default', () => {
  const mixedTrades: ClosedTradeRecord[] = [
    {
      id: 'trd-seed-btcusdt-00',
      symbol: 'BTCUSDT',
      side: 'LONG',
      qty: 0.01,
      leverage: 10,
      entryPrice: 70000,
      exitPrice: 71000,
      grossPnlUsdt: 10,
      feeUsdt: 0.5,
      fundingUsdt: 0,
      netPnlUsdt: 9.5,
      roePct: 13.5,
      mode: 'SHADOW',
      exitReason: 'TP_HIT',
      botId: 'agent-onnx-ppo-v2',
      botName: 'Delta-L2',
      openedAt: 1000,
      closedAt: 2000,
      isSynthetic: true,
    },
    {
      id: 'trd-real-solusdt-01',
      symbol: 'SOLUSDT',
      side: 'LONG',
      qty: 1,
      leverage: 10,
      entryPrice: 100,
      exitPrice: 102,
      grossPnlUsdt: 2.0,
      feeUsdt: 0.11,
      fundingUsdt: 0,
      netPnlUsdt: 1.89,
      roePct: 18.9,
      mode: 'LIVE',
      exitReason: 'TP_HIT',
      botId: 'agent-onnx-ppo-v2',
      botName: 'Delta-L2',
      openedAt: 3000,
      closedAt: 4000,
    },
  ];

  const summary = calculatePortfolioSummary(10, [], mixedTrades);
  assert.equal(summary.totalTradesCount, 1);
  assert.equal(summary.totalRealizedPnlUsdt, 1.89);
  assert.equal(summary.walletBalanceUsdt, 11.89);

  const filtered = filterClosedTrades(mixedTrades, { mode: 'ALL' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'trd-real-solusdt-01');
});

test('calculateMskPeriodBreakdown computes calendar MSK today, week (Mon), and month PnL accurately', () => {
  // Friday, 2026-11-20 18:30:00 MSK = 15:30:00 UTC
  const nowTs = Date.UTC(2026, 10, 20, 15, 30, 0);
  const bounds = computeMskPeriodBounds(nowTs);
  assert.equal(bounds.mskDateKey, '2026-11-20');
  assert.equal(bounds.mskDateLabel, '20.11.2026');
  assert.equal(bounds.mskHour, 18);

  const mkTrade = (id: string, closedAt: number, netPnlUsdt: number, isSynthetic = false): ClosedTradeRecord => ({
    id,
    symbol: 'BTCUSDT',
    side: 'LONG',
    qty: 0.01,
    leverage: 4,
    entryPrice: 60000,
    exitPrice: 61000,
    grossPnlUsdt: netPnlUsdt,
    feeUsdt: 0,
    fundingUsdt: 0,
    netPnlUsdt,
    roePct: 5,
    mode: 'SHADOW',
    exitReason: netPnlUsdt >= 0 ? 'TP_HIT' : 'SL_HIT',
    botId: 'agent-onnx-ppo-v2',
    botName: 'Delta-L2',
    openedAt: closedAt - 60000,
    closedAt,
    isSynthetic,
  });

  const trades: ClosedTradeRecord[] = [
    // Today MSK (2026-11-20 10:00 MSK = 07:00 UTC)
    mkTrade('t-today-1', Date.UTC(2026, 10, 20, 7, 0, 0), 2.5),
    // Today MSK right after 00:05 MSK (2026-11-19 21:05 UTC)
    mkTrade('t-today-2', Date.UTC(2026, 10, 19, 21, 5, 0), -0.65),
    // Earlier this week (Monday 2026-11-16 12:00 MSK = 09:00 UTC)
    mkTrade('t-week-1', Date.UTC(2026, 10, 16, 9, 0, 0), 4.15),
    // Earlier this month, previous week (Friday 2026-11-13 12:00 MSK = 09:00 UTC)
    mkTrade('t-month-1', Date.UTC(2026, 10, 13, 9, 0, 0), 3.0),
    // Previous month (2026-10-30 12:00 MSK) -> excluded from month/week/today
    mkTrade('t-prev-month', Date.UTC(2026, 9, 30, 9, 0, 0), 10.0),
    // Synthetic seed trade today -> excluded
    mkTrade('trd-seed-fake', Date.UTC(2026, 10, 20, 8, 0, 0), 99.0, true),
  ];

  const breakdown = calculateMskPeriodBreakdown({
    closedTrades: trades,
    baseCapitalUsdt: 100,
    nowTs,
  });

  // Today: +2.5 - 0.65 = +1.85 (2 trades)
  assert.equal(breakdown.today.pnlUsdt, 1.85);
  assert.equal(breakdown.today.returnPct, 1.85);
  assert.equal(breakdown.today.tradesCount, 2);
  assert.equal(breakdown.today.winsCount, 1);

  // Week (since Mon Nov 16 00:00 MSK): +1.85 + 4.15 = +6.00 (3 trades)
  assert.equal(breakdown.week.pnlUsdt, 6.0);
  assert.equal(breakdown.week.tradesCount, 3);

  // Month (since Nov 1 00:00 MSK): +6.00 + 3.00 = +9.00 (4 trades)
  assert.equal(breakdown.month.pnlUsdt, 9.0);
  assert.equal(breakdown.month.tradesCount, 4);

  // All time (real only): +19.00 (5 trades)
  assert.equal(breakdown.allTime.pnlUsdt, 19.0);
  assert.equal(breakdown.allTime.tradesCount, 5);

  const html = formatTelegramPeriodSummaryHtml(breakdown);
  assert.match(html, /Сегодня: <b>\+\$1\.85 USDT \(\+1\.85% · 2 сд\.\)<\/b>/);
  assert.match(html, /Неделя: <b>\+\$6\.00 USDT \(\+6\.00% · 3 сд\.\)<\/b>/);
  assert.match(html, /Месяц: <b>\+\$9\.00 USDT \(\+9\.00% · 4 сд\.\)<\/b>/);
});

test('shouldSendDailyTelegramDigest fires once per calendar MSK day at target hour', () => {
  // 20:59 MSK -> not due
  assert.equal(
    shouldSendDailyTelegramDigest({
      nowTs: Date.UTC(2026, 10, 20, 17, 59, 0),
      lastSentMskDate: null,
      targetHourMsk: 21,
    }).due,
    false
  );

  // 21:05 MSK -> due when not sent today
  const at2105 = shouldSendDailyTelegramDigest({
    nowTs: Date.UTC(2026, 10, 20, 18, 5, 0),
    lastSentMskDate: '2026-11-19',
    targetHourMsk: 21,
  });
  assert.equal(at2105.due, true);
  assert.equal(at2105.mskDateKey, '2026-11-20');

  // 21:15 MSK same day after already sent -> not due
  assert.equal(
    shouldSendDailyTelegramDigest({
      nowTs: Date.UTC(2026, 10, 20, 18, 15, 0),
      lastSentMskDate: '2026-11-20',
      targetHourMsk: 21,
    }).due,
    false
  );
});

