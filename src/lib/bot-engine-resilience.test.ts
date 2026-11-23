import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBotCycleWatchdogState,
  acquireBotCycleLock,
  releaseBotCycleLock,
  runWithHardTimeout,
  reconcileOkxLivePositions,
  normalizeOkxOpenPositions,
  buildOkxPositionDiff,
  mergeTerminalAndOkxPositionsSummary,
} from './bot-engine-resilience.ts';

test('bot cycle watchdog lock recovers stale stuck lock without letting old run clear new run', () => {
  const state = createBotCycleWatchdogState();

  const r1 = acquireBotCycleLock(state, 1000, 30_000);
  assert.equal(r1.acquired, true);
  assert.equal(r1.runId, 1);
  assert.equal(r1.staleRecovered, false);

  // Within timeout window, second attempt is skipped
  const r2 = acquireBotCycleLock(state, 15_000, 30_000);
  assert.equal(r2.acquired, false);
  assert.equal(state.totalRecoveredLocks, 0);

  // Past 30s timeout window, watchdog recovers the stale lock and increments runId
  const r3 = acquireBotCycleLock(state, 32_000, 30_000);
  assert.equal(r3.acquired, true);
  assert.equal(r3.runId, 2);
  assert.equal(r3.staleRecovered, true);
  assert.equal(r3.staleDurationMs, 31_000);
  assert.equal(state.totalRecoveredLocks, 1);
  assert.equal(state.consecutiveTimeouts, 1);

  // Old runId=1 finishing late CANNOT release runId=2's active lock
  assert.equal(releaseBotCycleLock(state, r1.runId, 33_000), false);
  assert.equal(state.isRunning, true);

  // Active runId=2 releases lock cleanly and resets consecutiveTimeouts
  assert.equal(releaseBotCycleLock(state, r3.runId, 34_000), true);
  assert.equal(state.isRunning, false);
  assert.equal(state.consecutiveTimeouts, 0);
  assert.equal(state.lastCompletedAt, 34_000);
});

test('runWithHardTimeout rejects cleanly if promise hangs past deadline', async () => {
  const fast = await runWithHardTimeout(async () => 42, 200, 'FAST');
  assert.equal(fast, 42);

  await assert.rejects(
    () => runWithHardTimeout(() => new Promise(() => {}), 30, 'BOT_CYCLE'),
    /BOT_CYCLE_TIMEOUT_30MS/
  );
});

test('reconcileOkxLivePositions detects phantom LIVE OKX slots after consecutive misses while respecting grace period', () => {
  const now = 1_795_415_000_000;
  const activePositions = [
    { id: 'pos-op', symbol: 'OPUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 18 * 3600_000 },
    { id: 'pos-xrp', symbol: 'XRPUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 18 * 3600_000 },
    { id: 'pos-ltc', symbol: 'LTCUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 18 * 3600_000 },
    { id: 'pos-xau', symbol: 'XAUUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 18 * 3600_000 },
    { id: 'pos-bch', symbol: 'BCHUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 19 * 3600_000 },
    { id: 'pos-new', symbol: 'SOLUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 20_000 },
    { id: 'pos-shadow', symbol: 'DOGEUSDT', side: 'LONG' as const, mode: 'SHADOW', exchange: 'OKX', openedAt: now - 5 * 3600_000 },
  ];

  // OKX reports 4 open SWAP positions (BCH-USDT-SWAP is closed on exchange)
  const okxOpen = [
    { instId: 'OP-USDT-SWAP', pos: '810', markPx: '0.0714' },
    { instId: 'XRP-USDT-SWAP', pos: '0.92', markPx: '0.9403' },
    { instId: 'LTC-USDT-SWAP', pos: '2.2', markPx: '40.54' },
    { instId: 'XAU-USDT-SWAP', pos: '13', markPx: '3622.7' },
  ];

  // Pass 1 (streak 1 < minConsecutiveMisses 2): tracks streak, does not drop yet; syncs live mark prices
  const pass1 = reconcileOkxLivePositions({
    activePositions,
    okxOpenPositions: okxOpen,
    okxPosMode: 'net_mode',
    previousMissingStreaks: {},
    minConsecutiveMisses: 2,
    gracePeriodMs: 90_000,
    nowTs: now,
  });
  assert.equal(pass1.orphanedPositions.length, 0);
  assert.equal(pass1.updatedStreaks['pos-bch'], 1);
  assert.equal(pass1.syncedMarkPrices.XRPUSDT, 0.9403);
  assert.equal(pass1.updatedStreaks['pos-new'], undefined);
  assert.equal(pass1.updatedStreaks['pos-shadow'], undefined);

  // Pass 2 (streak 2 >= 2): confirms BCHUSDT is orphaned/closed on OKX
  const pass2 = reconcileOkxLivePositions({
    activePositions,
    okxOpenPositions: okxOpen,
    okxPosMode: 'net_mode',
    previousMissingStreaks: pass1.updatedStreaks,
    minConsecutiveMisses: 2,
    gracePeriodMs: 90_000,
    nowTs: now + 60_000,
  });
  assert.deepEqual(
    pass2.orphanedPositions.map((p) => p.symbol),
    ['BCHUSDT']
  );
  assert.equal(pass2.updatedStreaks['pos-bch'], undefined);
});

test('buildOkxPositionDiff identifies stray exchange-only positions and normalizes net_mode shorts', () => {
  const normalized = normalizeOkxOpenPositions(
    [
      { instId: 'BTC-USDT-SWAP', pos: '-2', posSide: 'net', avgPx: '63100', markPx: '63050', upl: '1.0', lever: '4' },
      { instId: 'SOL-USDT-SWAP', pos: '0', posSide: 'net', avgPx: '0', markPx: '76.5', upl: '0' },
      { instId: 'XAU-USDT-SWAP', pos: '13', posSide: 'net', avgPx: '3620', markPx: '3640', upl: '0.26', lever: '4' },
    ],
    'net_mode'
  );
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].symbol, 'BTCUSDT');
  assert.equal(normalized[0].side, 'SHORT');
  assert.equal(normalized[1].symbol, 'XAUUSDT');
  assert.equal(normalized[1].side, 'LONG');

  const diff = buildOkxPositionDiff({
    activePositions: [
      { id: 'pos-btc', symbol: 'BTCUSDT', side: 'SHORT', mode: 'LIVE', exchange: 'OKX', openedAt: 1000 },
      { id: 'pos-eth', symbol: 'ETHUSDT', side: 'LONG', mode: 'LIVE', exchange: 'OKX', openedAt: 2000 },
    ],
    okxOpenPositions: [
      { instId: 'BTC-USDT-SWAP', pos: '-2', posSide: 'net', avgPx: '63100', markPx: '63050', upl: '1.0' },
      { instId: 'XAU-USDT-SWAP', pos: '13', posSide: 'net', avgPx: '3620', markPx: '3640', upl: '0.26' },
    ],
    okxPosMode: 'net_mode',
    missingStreaks: { 'pos-eth': 1 },
  });

  assert.equal(diff.okxPositions.length, 2);
  assert.equal(diff.okxPositions[0].inTerminal, true);
  assert.equal(diff.okxPositions[0].terminalPositionId, 'pos-btc');
  assert.equal(diff.okxPositions[1].inTerminal, false);
  assert.deepEqual(
    diff.strayExchangePositions.map((p) => p.symbol),
    ['XAUUSDT']
  );
  assert.equal(diff.terminalLiveOkxPositions.find((p) => p.symbol === 'ETHUSDT')?.onExchange, false);
  assert.equal(diff.terminalLiveOkxPositions.find((p) => p.symbol === 'ETHUSDT')?.missingStreak, 1);
});

test('reconcileOkxLivePositions protects fresh trades from lagging OKX positions snapshot unless close is confirmed in positions-history', () => {
  const now = 1_795_446_000_000;
  const activePositions = [
    // Opened 4 min ago (past 90s grace), missing from lagging OKX /positions, NOT in positions-history -> MUST NOT be dropped
    { id: 'pos-aave', symbol: 'AAVEUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 4 * 60_000 },
    // Opened 6 min ago, missing from OKX /positions, AND closed in positions-history 2 min ago -> MUST be reconciled
    { id: 'pos-mu', symbol: 'MUUSDT', side: 'LONG' as const, mode: 'LIVE', exchange: 'OKX', openedAt: now - 6 * 60_000 },
  ];

  // Prior XRP close happened BEFORE pos-aave opened, so it must NOT trigger anything anyway
  const okxHistory = [
    { instId: 'MU-USDT-SWAP', uTime: now - 2 * 60_000, closeAvgPx: 678 },
    { instId: 'AAVE-USDT-SWAP', uTime: now - 10 * 60_000, closeAvgPx: 101 },
  ];

  const pass1 = reconcileOkxLivePositions({
    activePositions,
    okxOpenPositions: [],
    okxPosMode: 'net_mode',
    okxPositionsHistory: okxHistory,
    previousMissingStreaks: {},
    minConsecutiveMisses: 2,
    gracePeriodMs: 90_000,
    nowTs: now,
  });
  assert.equal(pass1.orphanedPositions.length, 0);
  assert.equal(pass1.updatedStreaks['pos-aave'], undefined);
  assert.equal(pass1.updatedStreaks['pos-mu'], 1);

  const pass2 = reconcileOkxLivePositions({
    activePositions,
    okxOpenPositions: [],
    okxPosMode: 'net_mode',
    okxPositionsHistory: okxHistory,
    previousMissingStreaks: pass1.updatedStreaks,
    minConsecutiveMisses: 2,
    gracePeriodMs: 90_000,
    nowTs: now + 60_000,
  });
  assert.deepEqual(
    pass2.orphanedPositions.map((p) => p.symbol),
    ['MUUSDT']
  );
  assert.equal(pass2.updatedStreaks['pos-aave'], undefined);
});

test('mergeTerminalAndOkxPositionsSummary includes stray OKX positions in totals, symbols, and PnL', () => {
  const okxOpen = normalizeOkxOpenPositions(
    [
      { instId: 'ADA-USDT-SWAP', pos: '11.8', posSide: 'net', avgPx: '0.152', markPx: '0.149', upl: '-3.06', lever: '4' },
      { instId: 'DOT-USDT-SWAP', pos: '83', posSide: 'net', avgPx: '0.712', markPx: '0.686', upl: '-2.16', lever: '4' },
      { instId: 'BTC-USDT-SWAP', pos: '0.09', posSide: 'net', avgPx: '63341', markPx: '61464', upl: '-1.69', lever: '4' },
    ],
    'net_mode'
  );

  const merged = mergeTerminalAndOkxPositionsSummary({
    activePositions: [{ symbol: 'ADAUSDT', side: 'LONG', unrealizedPnl: -3.06, mode: 'LIVE', exchange: 'OKX' }],
    okxCachedOpenPositions: okxOpen,
    includeOkxExchange: true,
  });

  assert.equal(merged.terminalCount, 1);
  assert.equal(merged.exchangeStrayCount, 2);
  assert.equal(merged.totalLiveCount, 3);
  assert.equal(merged.correlationPositions.length, 3);
  assert.equal(merged.openSymbolsSet.has('DOTUSDT'), true);
  assert.equal(merged.openSymbolsSet.has('BTCUSDT'), true);
  assert.equal(merged.terminalFloatingPnlUsdt, -3.06);
  assert.equal(merged.strayFloatingPnlUsdt, -3.85);
  assert.equal(merged.totalFloatingPnlUsdt, -6.91);
});

