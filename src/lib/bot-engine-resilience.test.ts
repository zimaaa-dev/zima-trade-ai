import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBotCycleWatchdogState,
  acquireBotCycleLock,
  releaseBotCycleLock,
  runWithHardTimeout,
  reconcileOkxLivePositions,
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
