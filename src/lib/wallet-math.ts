export interface ClosedTradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  grossPnlUsdt: number;
  feeUsdt: number;
  fundingUsdt: number;
  netPnlUsdt: number;
  roePct: number;
  mode: 'SHADOW' | 'LIVE';
  exitReason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE';
  botId: string;
  botName: string;
  openedAt: number;
  closedAt: number;
  isSynthetic?: boolean;
}

export interface WalletLedgerEntry {
  id: string;
  timestamp: number;
  type: 'REALIZED_PNL' | 'COMMISSION_FEE' | 'FUNDING_FEE' | 'DEPOSIT_RESET';
  amountUsdt: number;
  balanceAfterUsdt: number;
  symbol?: string;
  description: string;
  mode: 'SHADOW' | 'LIVE';
  isSynthetic?: boolean;
}

export interface ActivePositionInput {
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryVwap: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
  fundingPaid?: number;
}

export interface PortfolioSummary {
  baseCapitalUsdt: number;
  totalRealizedPnlUsdt: number;
  walletBalanceUsdt: number;
  unrealizedPnlUsdt: number;
  totalEquityUsdt: number;
  usedMarginUsdt: number;
  availableMarginUsdt: number;
  marginUtilizationPct: number;
  totalFeesPaidUsdt: number;
  totalTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  winRatePct: number;
  profitFactor: number;
  avgWinUsdt: number;
  avgLossUsdt: number;
}

export function calculateClosedTradeMetrics(params: {
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  leverage: number;
  fundingUsdt?: number;
  takerFeeRate?: number;
}): {
  grossPnlUsdt: number;
  feeUsdt: number;
  netPnlUsdt: number;
  roePct: number;
} {
  const {
    side,
    qty,
    entryPrice,
    exitPrice,
    leverage,
    fundingUsdt = 0,
    takerFeeRate = 0.00055,
  } = params;

  const direction = side === 'LONG' ? 1 : -1;
  const grossPnlUsdt = Number(((exitPrice - entryPrice) * qty * direction).toFixed(2));
  const entryNotional = entryPrice * qty;
  const exitNotional = exitPrice * qty;
  const feeUsdt = Number(((entryNotional + exitNotional) * takerFeeRate).toFixed(2));
  const netPnlUsdt = Number((grossPnlUsdt - feeUsdt + fundingUsdt).toFixed(2));

  const initialMargin = entryNotional / Math.max(1, leverage);
  const roePct = initialMargin > 0 ? Number(((netPnlUsdt / initialMargin) * 100).toFixed(2)) : 0;

  return {
    grossPnlUsdt,
    feeUsdt,
    netPnlUsdt,
    roePct,
  };
}

export function calculatePortfolioSummary(
  baseCapitalUsdt: number,
  activePositions: ActivePositionInput[],
  closedTrades: ClosedTradeRecord[],
  authoritativeRealizedPnlUsdt?: number,
  includeSynthetic: boolean = false
): PortfolioSummary {
  const realTrades = includeSynthetic
    ? closedTrades
    : closedTrades.filter((t) => !t.isSynthetic && !String(t.id || '').startsWith('trd-seed-'));

  const summedFromHistory = Number(
    realTrades.reduce((acc, t) => acc + t.netPnlUsdt, 0).toFixed(2)
  );
  const totalRealizedPnlUsdt =
    typeof authoritativeRealizedPnlUsdt === 'number' && Number.isFinite(authoritativeRealizedPnlUsdt)
      ? Number(authoritativeRealizedPnlUsdt.toFixed(2))
      : summedFromHistory;
  const totalFeesPaidUsdt = Number(
    realTrades.reduce((acc, t) => acc + t.feeUsdt, 0).toFixed(2)
  );

  const walletBalanceUsdt = Number((baseCapitalUsdt + totalRealizedPnlUsdt).toFixed(2));

  const unrealizedPnlUsdt = Number(
    activePositions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0).toFixed(2)
  );

  const usedMarginUsdt = Number(
    activePositions
      .reduce((acc, p) => {
        const notional = p.entryVwap * p.qty;
        const lev = Math.max(1, p.leverage || 10);
        return acc + notional / lev;
      }, 0)
      .toFixed(2)
  );

  const totalEquityUsdt = Number((walletBalanceUsdt + unrealizedPnlUsdt).toFixed(2));
  const availableMarginUsdt = Number(Math.max(0, totalEquityUsdt - usedMarginUsdt).toFixed(2));
  const marginUtilizationPct =
    totalEquityUsdt > 0
      ? Number(Math.min(100, (usedMarginUsdt / totalEquityUsdt) * 100).toFixed(2))
      : 0;

  const winningTrades = realTrades.filter((t) => t.netPnlUsdt > 0);
  const losingTrades = realTrades.filter((t) => t.netPnlUsdt <= 0);

  const totalTradesCount = realTrades.length;
  const winningTradesCount = winningTrades.length;
  const losingTradesCount = losingTrades.length;

  const winRatePct =
    totalTradesCount > 0
      ? Number(((winningTradesCount / totalTradesCount) * 100).toFixed(1))
      : 0;

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.netPnlUsdt, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.netPnlUsdt, 0));

  const profitFactor =
    grossLoss > 0
      ? Number((grossProfit / grossLoss).toFixed(2))
      : grossProfit > 0
      ? 9.99
      : 0;

  const avgWinUsdt =
    winningTradesCount > 0 ? Number((grossProfit / winningTradesCount).toFixed(2)) : 0;
  const avgLossUsdt =
    losingTradesCount > 0 ? Number((-grossLoss / losingTradesCount).toFixed(2)) : 0;

  return {
    baseCapitalUsdt,
    totalRealizedPnlUsdt,
    walletBalanceUsdt,
    unrealizedPnlUsdt,
    totalEquityUsdt,
    usedMarginUsdt,
    availableMarginUsdt,
    marginUtilizationPct,
    totalFeesPaidUsdt,
    totalTradesCount,
    winningTradesCount,
    losingTradesCount,
    winRatePct,
    profitFactor,
    avgWinUsdt,
    avgLossUsdt,
  };
}

export type TimeWindowFilter = 'ALL' | '24H' | '7D';

export interface EquityCurvePoint {
  index: number;
  timestamp: number;
  label: string;
  equityUsdt: number;
  highWaterMarkUsdt: number;
  drawdownPct: number;
  deltaUsdt: number;
  eventType: 'START' | 'TRADE' | 'LIVE';
  symbol?: string;
  botId?: string;
  botName?: string;
}

export interface EquityCurveAnalytics {
  points: EquityCurvePoint[];
  startEquityUsdt: number;
  currentEquityUsdt: number;
  peakEquityUsdt: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  periodNetChangeUsdt: number;
  periodReturnPct: number;
}

export function filterClosedTrades(
  trades: ClosedTradeRecord[],
  filters: {
    mode?: 'ALL' | 'SHADOW' | 'LIVE';
    botId?: string;
    outcome?: 'ALL' | 'WIN' | 'LOSS';
    symbolQuery?: string;
    timeWindow?: TimeWindowFilter;
    nowTs?: number;
    includeSynthetic?: boolean;
  }
): ClosedTradeRecord[] {
  const {
    mode = 'ALL',
    botId = 'ALL',
    outcome = 'ALL',
    symbolQuery = '',
    timeWindow = 'ALL',
    nowTs = Date.now(),
    includeSynthetic = false,
  } = filters;
  const q = symbolQuery.trim().toUpperCase();

  const cutoffTs =
    timeWindow === '24H'
      ? nowTs - 24 * 3600 * 1000
      : timeWindow === '7D'
      ? nowTs - 7 * 24 * 3600 * 1000
      : 0;

  return trades.filter((t) => {
    if (!includeSynthetic && (t.isSynthetic || String(t.id || '').startsWith('trd-seed-'))) {
      return false;
    }
    if (cutoffTs > 0 && t.closedAt < cutoffTs) return false;
    if (mode !== 'ALL' && t.mode !== mode) return false;
    if (botId !== 'ALL' && t.botId !== botId) return false;
    if (outcome === 'WIN' && t.netPnlUsdt <= 0) return false;
    if (outcome === 'LOSS' && t.netPnlUsdt > 0) return false;
    if (q && !t.symbol.toUpperCase().includes(q) && !t.botName.toUpperCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export function buildEquityCurve(params: {
  baseCapitalUsdt: number;
  closedTrades: ClosedTradeRecord[];
  unrealizedPnlUsdt?: number;
  botIdFilter?: string;
  timeWindow?: TimeWindowFilter;
  nowTs?: number;
  includeSynthetic?: boolean;
}): EquityCurveAnalytics {
  const {
    baseCapitalUsdt,
    closedTrades,
    unrealizedPnlUsdt = 0,
    botIdFilter = 'ALL',
    timeWindow = 'ALL',
    nowTs = Date.now(),
    includeSynthetic = false,
  } = params;

  // Sort all real trades chronologically ascending by closedAt
  const allSorted = [...closedTrades]
    .filter((t) => includeSynthetic || (!t.isSynthetic && !String(t.id || '').startsWith('trd-seed-')))
    .filter((t) => botIdFilter === 'ALL' || t.botId === botIdFilter)
    .sort((a, b) => a.closedAt - b.closedAt);

  const cutoffTs =
    timeWindow === '24H'
      ? nowTs - 24 * 3600 * 1000
      : timeWindow === '7D'
      ? nowTs - 7 * 24 * 3600 * 1000
      : 0;

  // Calculate starting equity prior to cutoff
  let runningEquity = baseCapitalUsdt;
  const visibleTrades: ClosedTradeRecord[] = [];

  for (const t of allSorted) {
    if (cutoffTs > 0 && t.closedAt < cutoffTs) {
      runningEquity = Number((runningEquity + t.netPnlUsdt).toFixed(2));
    } else {
      visibleTrades.push(t);
    }
  }

  const startEquityUsdt = runningEquity;
  let highWaterMark = runningEquity;
  let maxDrawdownPct = 0;

  const startTs =
    visibleTrades.length > 0
      ? Math.max(0, visibleTrades[0].openedAt || visibleTrades[0].closedAt - 3600000)
      : nowTs - 3600000;

  const points: EquityCurvePoint[] = [
    {
      index: 0,
      timestamp: startTs,
      label: 'Старт периода',
      equityUsdt: startEquityUsdt,
      highWaterMarkUsdt: highWaterMark,
      drawdownPct: 0,
      deltaUsdt: 0,
      eventType: 'START',
    },
  ];

  visibleTrades.forEach((t, idx) => {
    runningEquity = Number((runningEquity + t.netPnlUsdt).toFixed(2));
    if (runningEquity > highWaterMark) {
      highWaterMark = runningEquity;
    }
    const ddPct =
      highWaterMark > 0
        ? Number((((highWaterMark - runningEquity) / highWaterMark) * 100).toFixed(2))
        : 0;
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
    }

    points.push({
      index: idx + 1,
      timestamp: t.closedAt,
      label: `${t.side} ${t.symbol} (${t.netPnlUsdt >= 0 ? '+' : ''}$${t.netPnlUsdt.toFixed(2)})`,
      equityUsdt: runningEquity,
      highWaterMarkUsdt: highWaterMark,
      drawdownPct: ddPct,
      deltaUsdt: t.netPnlUsdt,
      eventType: 'TRADE',
      symbol: t.symbol,
      botId: t.botId,
      botName: t.botName,
    });
  });

  // Append current live mark point including floating unrealized PnL
  const liveEquity = Number((runningEquity + unrealizedPnlUsdt).toFixed(2));
  if (liveEquity > highWaterMark) {
    highWaterMark = liveEquity;
  }
  const currentDrawdownPct =
    highWaterMark > 0
      ? Number((((highWaterMark - liveEquity) / highWaterMark) * 100).toFixed(2))
      : 0;
  if (currentDrawdownPct > maxDrawdownPct) {
    maxDrawdownPct = currentDrawdownPct;
  }

  points.push({
    index: points.length,
    timestamp: nowTs,
    label: `Текущий капитал (Live Mark)`,
    equityUsdt: liveEquity,
    highWaterMarkUsdt: highWaterMark,
    drawdownPct: currentDrawdownPct,
    deltaUsdt: Number(unrealizedPnlUsdt.toFixed(2)),
    eventType: 'LIVE',
  });

  const periodNetChangeUsdt = Number((liveEquity - startEquityUsdt).toFixed(2));
  const periodReturnPct =
    startEquityUsdt > 0
      ? Number(((periodNetChangeUsdt / startEquityUsdt) * 100).toFixed(2))
      : 0;

  return {
    points,
    startEquityUsdt,
    currentEquityUsdt: liveEquity,
    peakEquityUsdt: highWaterMark,
    maxDrawdownPct,
    currentDrawdownPct,
    periodNetChangeUsdt,
    periodReturnPct,
  };
}

const MSK_OFFSET_MS = 3 * 3600 * 1000;

export interface TelegramPeriodStats {
  pnlUsdt: number;
  returnPct: number;
  tradesCount: number;
  winsCount: number;
}

export interface TelegramPeriodBreakdown {
  mskDateKey: string;
  mskDateLabel: string;
  mskTimeLabel: string;
  mskHour: number;
  todayStartTs: number;
  weekStartTs: number;
  monthStartTs: number;
  today: TelegramPeriodStats;
  week: TelegramPeriodStats;
  month: TelegramPeriodStats;
  allTime: TelegramPeriodStats;
}

export function computeMskPeriodBounds(nowTs: number = Date.now()): {
  mskDateKey: string;
  mskDateLabel: string;
  mskTimeLabel: string;
  mskHour: number;
  todayStartTs: number;
  weekStartTs: number;
  monthStartTs: number;
} {
  const mskDate = new Date(nowTs + MSK_OFFSET_MS);
  const year = mskDate.getUTCFullYear();
  const month = mskDate.getUTCMonth();
  const day = mskDate.getUTCDate();
  const mskHour = mskDate.getUTCHours();
  const mskMin = mskDate.getUTCMinutes();
  const dayOfWeek = mskDate.getUTCDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const mskDateKey = `${year}-${pad2(month + 1)}-${pad2(day)}`;
  const mskDateLabel = `${pad2(day)}.${pad2(month + 1)}.${year}`;
  const mskTimeLabel = `${pad2(mskHour)}:${pad2(mskMin)} МСК`;

  const todayStartTs = Date.UTC(year, month, day, 0, 0, 0, 0) - MSK_OFFSET_MS;
  const weekStartTs = Date.UTC(year, month, day - daysSinceMonday, 0, 0, 0, 0) - MSK_OFFSET_MS;
  const monthStartTs = Date.UTC(year, month, 1, 0, 0, 0, 0) - MSK_OFFSET_MS;

  return {
    mskDateKey,
    mskDateLabel,
    mskTimeLabel,
    mskHour,
    todayStartTs,
    weekStartTs,
    monthStartTs,
  };
}

function aggregateTradesForPeriod(
  trades: ClosedTradeRecord[],
  cutoffTs: number,
  baseCapitalUsdt: number
): TelegramPeriodStats {
  const subset = cutoffTs > 0 ? trades.filter((t) => t.closedAt >= cutoffTs) : trades;
  const pnlUsdt = Number(subset.reduce((acc, t) => acc + (Number(t.netPnlUsdt) || 0), 0).toFixed(2));
  const returnPct =
    baseCapitalUsdt > 0 ? Number(((pnlUsdt / baseCapitalUsdt) * 100).toFixed(2)) : 0;
  const winsCount = subset.filter((t) => (Number(t.netPnlUsdt) || 0) > 0).length;
  return {
    pnlUsdt,
    returnPct,
    tradesCount: subset.length,
    winsCount,
  };
}

export function calculateMskPeriodBreakdown(params: {
  closedTrades: ClosedTradeRecord[];
  baseCapitalUsdt: number;
  nowTs?: number;
  includeSynthetic?: boolean;
}): TelegramPeriodBreakdown {
  const { closedTrades, baseCapitalUsdt, nowTs = Date.now(), includeSynthetic = false } = params;
  const realTrades = includeSynthetic
    ? closedTrades
    : closedTrades.filter((t) => !t.isSynthetic && !String(t.id || '').startsWith('trd-seed-'));

  const bounds = computeMskPeriodBounds(nowTs);
  return {
    ...bounds,
    today: aggregateTradesForPeriod(realTrades, bounds.todayStartTs, baseCapitalUsdt),
    week: aggregateTradesForPeriod(realTrades, bounds.weekStartTs, baseCapitalUsdt),
    month: aggregateTradesForPeriod(realTrades, bounds.monthStartTs, baseCapitalUsdt),
    allTime: aggregateTradesForPeriod(realTrades, 0, baseCapitalUsdt),
  };
}

export function formatSignedUsdt(value: number): string {
  const rounded = Number((Number(value) || 0).toFixed(2));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const sign = normalized >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(normalized).toFixed(2)}`;
}

export function formatSignedPct(value: number): string {
  const rounded = Number((Number(value) || 0).toFixed(2));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const sign = normalized >= 0 ? '+' : '-';
  return `${sign}${Math.abs(normalized).toFixed(2)}%`;
}

export function formatTelegramPeriodSummaryHtml(
  breakdown: TelegramPeriodBreakdown,
  titleLabel = '📅 <b>Итоги PnL (МСК):</b>'
): string {
  const fmtLine = (label: string, s: TelegramPeriodStats) =>
    `• ${label}: <b>${formatSignedUsdt(s.pnlUsdt)} USDT (${formatSignedPct(s.returnPct)} · ${s.tradesCount} сд.)</b>`;

  return [
    titleLabel,
    fmtLine('Сегодня', breakdown.today),
    fmtLine('Неделя', breakdown.week),
    fmtLine('Месяц', breakdown.month),
  ].join('\n');
}

export function shouldSendDailyTelegramDigest(params: {
  nowTs?: number;
  lastSentMskDate?: string | null;
  targetHourMsk?: number;
}): {
  due: boolean;
  mskDateKey: string;
  mskDateLabel: string;
  mskHour: number;
} {
  const { nowTs = Date.now(), lastSentMskDate, targetHourMsk = 21 } = params;
  const bounds = computeMskPeriodBounds(nowTs);
  return {
    due: bounds.mskHour === targetHourMsk && lastSentMskDate !== bounds.mskDateKey,
    mskDateKey: bounds.mskDateKey,
    mskDateLabel: bounds.mskDateLabel,
    mskHour: bounds.mskHour,
  };
}
