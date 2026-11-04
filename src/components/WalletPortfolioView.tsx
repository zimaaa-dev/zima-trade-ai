import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Download,
  RefreshCw,
  PlusCircle,
  RotateCcw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  History,
  FileSpreadsheet,
  HardDrive,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Bell,
  Activity,
  CheckCircle2,
  X,
  Flame,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Trash2,
} from 'lucide-react';
import {
  filterClosedTrades,
  buildEquityCurve,
  type ClosedTradeRecord,
  type WalletLedgerEntry,
  type PortfolioSummary,
  type TimeWindowFilter,
} from '../lib/wallet-math.ts';
import type { Position, AgentItem, PersistenceStatus } from '../types.ts';
import { MetricTooltip } from './MetricTooltip.tsx';
import { EquityCurveChart } from './EquityCurveChart.tsx';

interface SpreadPairTelemetry {
  symbol: string;
  price: number;
  spreadBps: number;
  atrPct: number;
  status: string;
  spreadState: 'OK' | 'WARNING' | 'CRITICAL';
  proximityPct: number;
}

interface RiskNotificationItem {
  id: string;
  timestamp: number;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  category: 'DRAWDOWN' | 'SPREAD' | 'MARGIN' | 'FUNDING' | 'GUARD_LOG';
  title: string;
  message: string;
  symbol?: string;
  currentValue: string;
  limitValue: string;
  proximityPct: number;
}

interface RiskFirewallTelemetry {
  overallStatus: 'OK' | 'WARNING' | 'CRITICAL';
  stressSimulation: {
    active: boolean;
    scenario: 'NONE' | 'SPREAD_SPIKE' | 'DRAWDOWN_WARNING' | 'MARGIN_PRESSURE' | 'CRITICAL_BREACH';
    activatedAt: number;
  };
  drawdown: {
    rolling24hPnlUsdt: number;
    dailyDrawdownPct: number;
    warningDrawdownPct: number;
    maxDailyDrawdownLimitPct: number;
    remainingDrawdownBufferUsdt: number;
    proximityPct: number;
    isKillSwitchActive: boolean;
    killSwitchTriggerReason: string | null;
  };
  spread: {
    maxObservedSpreadBps: number;
    maxSpreadSymbol: string;
    warningSpreadBps: number;
    limitSpreadBps: number;
    proximityPct: number;
    pairs: SpreadPairTelemetry[];
  };
  margin: {
    portfolioMarginUsedPct: number;
    warningMarginPct: number;
    limitMarginPct: number;
    proximityPct: number;
    maxSinglePositionMarginPct: number;
    maxSinglePositionSymbol: string;
    limitSinglePositionPct: number;
  };
  funding: {
    minutesToNextFunding: number;
    warningFundingMinutes: number;
    maxAtrPct: number;
  };
  notifications: RiskNotificationItem[];
}

interface WalletPortfolioViewProps {
  onRefreshHealth?: () => void;
}

export const WalletPortfolioView: React.FC<WalletPortfolioViewProps> = ({ onRefreshHealth }) => {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [closedTrades, setClosedTrades] = useState<ClosedTradeRecord[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [activePositions, setActivePositions] = useState<Position[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sub-navigation tab
  const [activeSubTab, setActiveSubTab] = useState<'trades' | 'ledger' | 'open'>('trades');

  // Synchronized Filters for Equity Curve & Closed Trades
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | 'SHADOW' | 'LIVE'>('ALL');
  const [botFilter, setBotFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [symbolQuery, setSymbolQuery] = useState<string>('');

  // Pagination for Closed Trades History Table
  const [pageSize, setPageSize] = useState<number | 'ALL'>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isClosingAll, setIsClosingAll] = useState<boolean>(false);

  // Balance adjustment & disk snapshot state
  const [customDeposit, setCustomDeposit] = useState<string>('2500');
  const [adjustStatus, setAdjustStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);
  const [isSimulatingTick, setIsSimulatingTick] = useState<boolean>(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState<boolean>(false);

  // Real-time Risk Firewall Telemetry & Notification state
  const [riskTelemetry, setRiskTelemetry] = useState<RiskFirewallTelemetry | null>(null);
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'SPREAD' | 'DRAWDOWN' | 'GUARD_LOG'>('ALL');
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [isSimulatingStress, setIsSimulatingStress] = useState<boolean>(false);

  const fetchWalletData = async () => {
    try {
      const res = await fetch('/api/wallet');
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        if (data.riskTelemetry) {
          setRiskTelemetry(data.riskTelemetry);
        }
        setClosedTrades(data.closedTrades || []);
        setLedger(data.ledger || []);
        setActivePositions(data.activePositions || []);
        setAgents(data.agents || []);
        if (data.persistence) {
          setPersistence(data.persistence);
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
    const interval = setInterval(fetchWalletData, 2500);
    return () => clearInterval(interval);
  }, []);

  const filteredTrades = useMemo(() => {
    return filterClosedTrades(closedTrades, {
      mode: modeFilter,
      botId: botFilter,
      outcome: outcomeFilter,
      symbolQuery,
      timeWindow,
    });
  }, [closedTrades, modeFilter, botFilter, outcomeFilter, symbolQuery, timeWindow]);

  const filteredNetPnl = useMemo(() => {
    return filteredTrades.reduce((acc, t) => acc + t.netPnlUsdt, 0);
  }, [filteredTrades]);

  // Reset to page 1 when filter parameters change
  useEffect(() => {
    setCurrentPage(1);
  }, [modeFilter, botFilter, outcomeFilter, symbolQuery, timeWindow]);

  const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(filteredTrades.length / pageSize));
  const paginatedTrades = useMemo(() => {
    if (pageSize === 'ALL') return filteredTrades;
    const start = (currentPage - 1) * pageSize;
    return filteredTrades.slice(start, start + pageSize);
  }, [filteredTrades, currentPage, pageSize]);

  const winTradesCount = useMemo(() => filteredTrades.filter((t) => t.netPnlUsdt > 0).length, [filteredTrades]);
  const lossTradesCount = useMemo(() => filteredTrades.filter((t) => t.netPnlUsdt <= 0).length, [filteredTrades]);
  const winRatePct = filteredTrades.length > 0 ? Number(((winTradesCount / filteredTrades.length) * 100).toFixed(1)) : 0;
  const avgWinUsdt = winTradesCount > 0
    ? Number((filteredTrades.filter((t) => t.netPnlUsdt > 0).reduce((acc, t) => acc + t.netPnlUsdt, 0) / winTradesCount).toFixed(2))
    : 0;
  const avgLossUsdt = lossTradesCount > 0
    ? Number((filteredTrades.filter((t) => t.netPnlUsdt <= 0).reduce((acc, t) => acc + t.netPnlUsdt, 0) / lossTradesCount).toFixed(2))
    : 0;

  const hasActiveFilters =
    modeFilter !== 'ALL' ||
    botFilter !== 'ALL' ||
    outcomeFilter !== 'ALL' ||
    symbolQuery.trim() !== '' ||
    timeWindow !== 'ALL';

  const handleResetFilters = () => {
    setModeFilter('ALL');
    setBotFilter('ALL');
    setOutcomeFilter('ALL');
    setSymbolQuery('');
    setTimeWindow('ALL');
    setCurrentPage(1);
  };

  const handleCloseAllPositions = async () => {
    if (activePositions.length === 0) return;
    setIsClosingAll(true);
    try {
      const res = await fetch('/api/positions/close-all', { method: 'POST' });
      if (res.ok) {
        await fetchWalletData();
        if (onRefreshHealth) onRefreshHealth();
      }
    } catch (err) {
      console.error('Failed to close all positions:', err);
    } finally {
      setIsClosingAll(false);
    }
  };

  const equityAnalytics = useMemo(() => {
    const baseCap = summary?.baseCapitalUsdt ?? 10000;
    const floating =
      botFilter === 'ALL'
        ? summary?.unrealizedPnlUsdt ?? 0
        : activePositions
            .filter((p) => p.botId === botFilter)
            .reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);

    return buildEquityCurve({
      baseCapitalUsdt: baseCap,
      closedTrades,
      unrealizedPnlUsdt: floating,
      botIdFilter: botFilter,
      timeWindow,
    });
  }, [summary, closedTrades, activePositions, botFilter, timeWindow]);

  const handleSaveSnapshot = async () => {
    setIsSavingSnapshot(true);
    try {
      const res = await fetch('/api/wallet/snapshot', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.persistence) setPersistence(data.persistence);
        setAdjustStatus({
          type: 'success',
          text: 'Контрольная точка кошелька и сделок сохранена на диск (data/runtime_state.json)',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setIsSavingSnapshot(false), 350);
    }
  };

  const handleAdjustBalance = async (action: 'DEPOSIT' | 'RESET', amount?: number) => {
    setAdjustStatus(null);
    const val = amount !== undefined ? amount : parseFloat(customDeposit);

    if (action === 'DEPOSIT' && (isNaN(val) || val < 10 || val > 1000000)) {
      setAdjustStatus({
        type: 'error',
        text: 'Введите сумму пополнения от $10 до $1,000,000 USDT',
      });
      return;
    }

    setIsAdjusting(true);
    try {
      const res = await fetch('/api/wallet/adjust-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amountUsdt: val }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSummary(data.summary);
        setLedger(data.ledger || []);
        setAdjustStatus({
          type: 'success',
          text:
            action === 'RESET'
              ? 'Базовый капитал сброшен до $10,000.00 USDT и сохранен на диск'
              : `Кошелек пополнен на +$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT`,
        });
        if (onRefreshHealth) onRefreshHealth();
      } else {
        setAdjustStatus({
          type: 'error',
          text: data.error || 'Не удалось изменить баланс',
        });
      }
    } catch (err: any) {
      setAdjustStatus({
        type: 'error',
        text: `Ошибка сети: ${err.message}`,
      });
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleCloseActivePosition = async (id: string) => {
    try {
      const res = await fetch('/api/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchWalletData();
        if (onRefreshHealth) onRefreshHealth();
      }
    } catch (err) {
      console.error('Failed to close position:', err);
    }
  };

  const handleTriggerBotTick = async () => {
    setIsSimulatingTick(true);
    try {
      await fetch('/api/bots/tick', { method: 'POST' });
      await fetchWalletData();
      if (onRefreshHealth) onRefreshHealth();
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setIsSimulatingTick(false), 400);
    }
  };

  const handleSimulateRiskStress = async (
    scenario: 'NONE' | 'SPREAD_SPIKE' | 'DRAWDOWN_WARNING' | 'MARGIN_PRESSURE' | 'CRITICAL_BREACH'
  ) => {
    setIsSimulatingStress(true);
    try {
      const res = await fetch('/api/wallet/simulate-risk-stress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.riskTelemetry) {
          setRiskTelemetry(data.riskTelemetry);
          setDismissedAlertIds([]);
        }
      }
    } catch (err) {
      console.error('Failed to toggle risk stress simulation:', err);
    } finally {
      setIsSimulatingStress(false);
    }
  };

  const visibleNotifications = useMemo(() => {
    const raw = riskTelemetry?.notifications || [];
    return raw.filter((item) => {
      if (dismissedAlertIds.includes(item.id)) return false;
      if (alertFilter === 'ALL') return true;
      if (alertFilter === 'CRITICAL') return item.severity === 'CRITICAL';
      if (alertFilter === 'WARNING') return item.severity === 'WARNING';
      if (alertFilter === 'SPREAD') return item.category === 'SPREAD';
      if (alertFilter === 'DRAWDOWN') return item.category === 'DRAWDOWN';
      if (alertFilter === 'GUARD_LOG') return item.category === 'GUARD_LOG';
      return true;
    });
  }, [riskTelemetry, alertFilter, dismissedAlertIds]);

  const criticalAlertsCount = useMemo(
    () => (riskTelemetry?.notifications || []).filter((n) => n.severity === 'CRITICAL' && !dismissedAlertIds.includes(n.id)).length,
    [riskTelemetry, dismissedAlertIds]
  );

  const warningAlertsCount = useMemo(
    () => (riskTelemetry?.notifications || []).filter((n) => n.severity === 'WARNING' && !dismissedAlertIds.includes(n.id)).length,
    [riskTelemetry, dismissedAlertIds]
  );

  const handleExportCsv = () => {
    if (filteredTrades.length === 0) return;
    const headers = [
      'ID',
      'ClosedAt',
      'Symbol',
      'Mode',
      'BotName',
      'Side',
      'Leverage',
      'Qty',
      'EntryPrice',
      'ExitPrice',
      'ExitReason',
      'GrossPnL_USDT',
      'Fee_USDT',
      'NetPnL_USDT',
      'ROE_Pct',
    ];
    const rows = filteredTrades.map((t) => [
      t.id,
      new Date(t.closedAt).toISOString(),
      t.symbol,
      t.mode,
      `"${t.botName}"`,
      t.side,
      t.leverage,
      t.qty,
      t.entryPrice,
      t.exitPrice,
      t.exitReason,
      t.grossPnlUsdt,
      t.feeUsdt,
      t.netPnlUsdt,
      t.roePct,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `zimatrade_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalEquity = summary?.totalEquityUsdt ?? 10381.79;
  const walletBalance = summary?.walletBalanceUsdt ?? 10381.79;
  const unrealizedPnl = summary?.unrealizedPnlUsdt ?? 0;
  const realizedPnl = summary?.totalRealizedPnlUsdt ?? 381.79;
  const usedMargin = summary?.usedMarginUsdt ?? 0;
  const availableMargin = summary?.availableMarginUsdt ?? 10381.79;
  const marginUtilPct = summary?.marginUtilizationPct ?? 0;
  const winRate = summary?.winRatePct ?? 80.0;
  const profitFactor = summary?.profitFactor ?? 4.82;
  const totalFees = summary?.totalFeesPaidUsdt ?? 30.15;

  return (
    <div className="p-4 space-y-6 max-w-[1600px] mx-auto">
      {/* Top Header & Quick Actions */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/40 text-cyan-400 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">
              Институциональный Кошелек, Кривая Капитала и История Сделок
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono">
              <span>Учет маржи и комиссий Bybit Taker (0.055%)</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">
                Диск: {persistence?.storageFile || 'data/runtime_state.json'} ({persistence?.recordsCount ?? closedTrades.length + ledger.length} зап.)
              </span>
              {persistence?.lastSavedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Синхр.: {new Date(persistence.lastSavedAt).toLocaleTimeString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={isSavingSnapshot}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isSavingSnapshot ? 'Запись на диск...' : 'Сохранить на диск'}</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerBotTick}
            disabled={isSimulatingTick}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingTick ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isSimulatingTick ? 'Пересчет стакана...' : 'Форсировать тик ИИ'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredTrades.length === 0}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Скачать CSV ({filteredTrades.length})</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid: Equity, Margin, Realized PnL, Win Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Equity */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <MetricTooltip metric="TOTAL_EQUITY" value={totalEquity}>
              <span className="text-xs font-semibold text-slate-200">1. Все ваши деньги (Итоговый капитал)</span>
            </MetricTooltip>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Баланс кошелька + текущая прибыль открытых сделок
            </span>
            <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
              ${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-xs text-slate-400 font-normal ml-1.5">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="text-slate-400">Зафиксировано в кошельке:</span>
            <span className="text-slate-200 font-semibold">
              ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Card 2: Margin & Free Balance */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <MetricTooltip metric="FREE_MARGIN" value={availableMargin}>
                <span className="text-xs font-semibold text-slate-200">2. Свободно для новых сделок</span>
              </MetricTooltip>
              <MetricTooltip metric="MARGIN_UTIL" value={marginUtilPct} showIcon={false}>
                <span className="text-xs font-mono text-cyan-400 tabular-nums">
                  Занято: {marginUtilPct.toFixed(1)}%
                </span>
              </MetricTooltip>
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Средства, не занятые в открытых позициях
            </span>
            <div className="text-2xl font-bold text-cyan-300 font-mono tabular-nums mt-1.5">
              ${availableMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-xs text-slate-400 font-normal ml-1.5">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="text-slate-400">В работе сейчас ({activePositions.length} поз.):</span>
            <span className="text-amber-300 font-semibold">
              ${usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Card 3: Realized & Floating PnL */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <MetricTooltip metric="REALIZED_PNL" value={realizedPnl}>
              <span className="text-xs font-semibold text-slate-200">3. Чистая заработанная прибыль (PnL)</span>
            </MetricTooltip>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Уже зачисленный результат закрытых сделок
            </span>
            <div
              className={`text-2xl font-bold font-mono tabular-nums mt-1.5 flex items-center gap-1 ${
                realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {realizedPnl >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
              <span>
                {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-slate-400 font-normal ml-1">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
            <MetricTooltip metric="UNREALIZED_PNL" value={unrealizedPnl} showIcon={false}>
              <span className="text-slate-400">По открытым сделкам сейчас:</span>
            </MetricTooltip>
            <span className={`font-semibold ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)} USDT
            </span>
          </div>
        </div>

        {/* Card 4: Win Rate, Profit Factor & Fees */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <MetricTooltip metric="WIN_RATE" value={winRate}>
                <span className="text-xs font-semibold text-slate-200">4. Успешность сделок (Винрейт)</span>
              </MetricTooltip>
              <MetricTooltip metric="PROFIT_FACTOR" value={profitFactor} showIcon={false}>
                <span className="text-xs font-mono text-emerald-400 tabular-nums">
                  Окупаемость: x{profitFactor.toFixed(2)}
                </span>
              </MetricTooltip>
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Доля сделок, закрытых в плюс (+Победы / -Убытки)
            </span>
            <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
              {winRate.toFixed(1)}%
              <span className="text-xs text-slate-400 font-normal ml-2">
                ({summary?.winningTradesCount ?? 4} в плюс / {summary?.losingTradesCount ?? 1} в минус)
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
            <MetricTooltip metric="BYBIT_FEE" showIcon={false}>
              <span className="text-slate-400">Комиссия биржи Bybit (0.055%):</span>
            </MetricTooltip>
            <span className="text-slate-300">-${totalFees.toFixed(2)} USDT</span>
          </div>
        </div>
      </div>

      {/* Real-Time Risk Firewall Notification & Threshold Proximity Monitor */}
      <div
        className={`bg-slate-900/95 border rounded-xl p-5 space-y-4 transition-colors ${
          riskTelemetry?.overallStatus === 'CRITICAL'
            ? 'border-rose-500/70 shadow-[0_0_25px_rgba(244,63,94,0.12)]'
            : riskTelemetry?.overallStatus === 'WARNING'
            ? 'border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
            : 'border-slate-800'
        }`}
      >
        {/* Top Status Bar & Stress-Test Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3.5">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                riskTelemetry?.overallStatus === 'CRITICAL'
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-400'
                  : riskTelemetry?.overallStatus === 'WARNING'
                  ? 'bg-amber-950/80 border-amber-500/50 text-amber-400'
                  : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
              }`}
            >
              {riskTelemetry?.overallStatus === 'CRITICAL' ? (
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              ) : riskTelemetry?.overallStatus === 'WARNING' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Мониторинг лимитов Риск-Файрвола и Система уведомлений (Real-Time)
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold tracking-wider uppercase border ${
                    riskTelemetry?.overallStatus === 'CRITICAL'
                      ? 'bg-rose-950/90 text-rose-300 border-rose-500/50'
                      : riskTelemetry?.overallStatus === 'WARNING'
                      ? 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      riskTelemetry?.overallStatus === 'CRITICAL'
                        ? 'bg-rose-400 animate-ping'
                        : riskTelemetry?.overallStatus === 'WARNING'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-emerald-400'
                    }`}
                  />
                  {riskTelemetry?.overallStatus === 'CRITICAL'
                    ? 'КРИТИЧЕСКИЙ ПОРОГ · БЛОКИРОВКА'
                    : riskTelemetry?.overallStatus === 'WARNING'
                    ? 'ВНИМАНИЕ · ПРИБЛИЖЕНИЕ К ЛИМИТУ'
                    : 'НОРМА · ВСЕ БАРЬЕРЫ В БЕЗОПАСНОЙ ЗОНЕ'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1 tabular-nums">
                <span>
                  Критичных тревог:{' '}
                  <strong className={criticalAlertsCount > 0 ? 'text-rose-400' : 'text-slate-300'}>
                    {criticalAlertsCount}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Предупреждений:{' '}
                  <strong className={warningAlertsCount > 0 ? 'text-amber-300' : 'text-slate-300'}>
                    {warningAlertsCount}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>Опрос телеметрии: каждые 2.5 сек</span>
              </div>
            </div>
          </div>

          {/* Interactive Stress Scenario Selector to test real-time notifications */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 font-mono text-xs">
            <span className="text-[11px] text-slate-400 px-2 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Тест порогов:
            </span>
            {(
              [
                { id: 'NONE', label: 'Штатный' },
                { id: 'SPREAD_SPIKE', label: 'Спред >15 bps' },
                { id: 'DRAWDOWN_WARNING', label: 'Просадка -3.85%' },
                { id: 'MARGIN_PRESSURE', label: 'Маржа 64.5%' },
                { id: 'CRITICAL_BREACH', label: 'Крит. стресс' },
              ] as const
            ).map((btn) => {
              const isSelected = (riskTelemetry?.stressSimulation?.scenario || 'NONE') === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={isSimulatingStress}
                  onClick={() => handleSimulateRiskStress(btn.id)}
                  className={`px-2.5 py-1 rounded transition whitespace-nowrap shrink-0 ${
                    isSelected
                      ? btn.id === 'NONE'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-semibold'
                        : 'bg-rose-950 text-rose-200 border border-rose-500/50 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4 Real-Time Risk Firewall Threshold Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {/* Gauge 1: MAX_DAILY_DRAWDOWN (-5.0% Kill-Switch) */}
          {(() => {
            const ddPct = riskTelemetry?.drawdown.dailyDrawdownPct ?? 0;
            const warnPct = riskTelemetry?.drawdown.warningDrawdownPct ?? 3.0;
            const limitPct = riskTelemetry?.drawdown.maxDailyDrawdownLimitPct ?? 5.0;
            const prox = riskTelemetry?.drawdown.proximityPct ?? 0;
            const remUsdt = riskTelemetry?.drawdown.remainingDrawdownBufferUsdt ?? 500;
            const isCrit = ddPct >= 4.2 || riskTelemetry?.drawdown.isKillSwitchActive;
            const isWarn = !isCrit && ddPct >= warnPct;

            return (
              <div
                className={`bg-slate-950/90 border rounded-lg p-3.5 flex flex-col justify-between ${
                  isCrit
                    ? 'border-rose-500/60'
                    : isWarn
                    ? 'border-amber-500/50'
                    : 'border-slate-800/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <MetricTooltip metric="DAILY_DRAWDOWN" value={ddPct}>
                      <span className="text-slate-300 font-semibold">1. MAX_DAILY_DRAWDOWN</span>
                    </MetricTooltip>
                    <span
                      className={`font-bold ${
                        isCrit ? 'text-rose-400' : isWarn ? 'text-amber-300' : 'text-emerald-400'
                      }`}
                    >
                      {isCrit ? 'КРИТИЧНО' : isWarn ? 'ВНИМАНИЕ' : 'НОРМА'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1.5 font-mono tabular-nums">
                    <span className="text-lg font-bold text-white">
                      -{ddPct.toFixed(2)}%
                    </span>
                    <span className="text-xs text-slate-400">
                      Порог: <strong className="text-rose-400">-{limitPct.toFixed(1)}%</strong> (пред. -{warnPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-2 border border-slate-800 relative">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isCrit ? 'bg-rose-500' : isWarn ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(3, Math.min(100, prox))}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>Запас до Kill-Switch:</span>
                  <span className="text-slate-200 font-semibold">${remUsdt.toFixed(2)} USDT</span>
                </div>
              </div>
            );
          })()}

          {/* Gauge 2: Market Spread Guard (L2 SPREAD LIMIT 15.0 bps) */}
          {(() => {
            const maxSpread = riskTelemetry?.spread.maxObservedSpreadBps ?? 1.8;
            const maxSym = riskTelemetry?.spread.maxSpreadSymbol ?? 'BTCUSDT';
            const warnBps = riskTelemetry?.spread.warningSpreadBps ?? 10.0;
            const limitBps = riskTelemetry?.spread.limitSpreadBps ?? 15.0;
            const prox = riskTelemetry?.spread.proximityPct ?? 12;
            const isCrit = maxSpread >= limitBps;
            const isWarn = !isCrit && maxSpread >= warnBps;

            return (
              <div
                className={`bg-slate-950/90 border rounded-lg p-3.5 flex flex-col justify-between ${
                  isCrit
                    ? 'border-rose-500/60'
                    : isWarn
                    ? 'border-amber-500/50'
                    : 'border-slate-800/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <MetricTooltip metric="SPREAD_BPS" value={maxSpread}>
                      <span className="text-slate-300 font-semibold">2. СПРЕД СТАКАНА L2</span>
                    </MetricTooltip>
                    <span
                      className={`font-bold ${
                        isCrit ? 'text-rose-400' : isWarn ? 'text-amber-300' : 'text-emerald-400'
                      }`}
                    >
                      {isCrit ? 'БЛОКИРОВКА' : isWarn ? 'РАСШИРЕН' : 'УЗКИЙ СПРЕД'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1.5 font-mono tabular-nums">
                    <span className="text-lg font-bold text-white">
                      {maxSpread.toFixed(1)} bps{' '}
                      <span className="text-xs text-cyan-300 font-normal">({maxSym})</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      Лимит: <strong className="text-rose-400">{limitBps.toFixed(1)} bps</strong>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-2 border border-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isCrit ? 'bg-rose-500' : isWarn ? 'bg-amber-400' : 'bg-cyan-400'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, prox))}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[10px] font-mono tabular-nums">
                  {(riskTelemetry?.spread.pairs || []).slice(0, 5).map((p) => (
                    <span
                      key={p.symbol}
                      className={`px-1.5 py-0.5 rounded border ${
                        p.spreadState === 'CRITICAL'
                          ? 'bg-rose-950/90 text-rose-300 border-rose-500/50 font-bold'
                          : p.spreadState === 'WARNING'
                          ? 'bg-amber-950/90 text-amber-300 border-amber-500/50 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {p.symbol.replace('USDT', '')}: {p.spreadBps.toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Gauge 3: Margin Utilization & Concentration (80% Portfolio / 35% Single) */}
          {(() => {
            const usedPct = riskTelemetry?.margin.portfolioMarginUsedPct ?? marginUtilPct;
            const warnPct = riskTelemetry?.margin.warningMarginPct ?? 55.0;
            const limitPct = riskTelemetry?.margin.limitMarginPct ?? 80.0;
            const prox = riskTelemetry?.margin.proximityPct ?? 10;
            const singlePct = riskTelemetry?.margin.maxSinglePositionMarginPct ?? 0;
            const singleSym = riskTelemetry?.margin.maxSinglePositionSymbol ?? '—';
            const singleLim = riskTelemetry?.margin.limitSinglePositionPct ?? 35.0;
            const isCrit = usedPct >= limitPct || singlePct >= singleLim;
            const isWarn = !isCrit && (usedPct >= warnPct || singlePct >= 28.0);

            return (
              <div
                className={`bg-slate-950/90 border rounded-lg p-3.5 flex flex-col justify-between ${
                  isCrit
                    ? 'border-rose-500/60'
                    : isWarn
                    ? 'border-amber-500/50'
                    : 'border-slate-800/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <MetricTooltip metric="MARGIN_UTIL" value={usedPct}>
                      <span className="text-slate-300 font-semibold">3. НАГРУЗКА МАРЖИ</span>
                    </MetricTooltip>
                    <span
                      className={`font-bold ${
                        isCrit ? 'text-rose-400' : isWarn ? 'text-amber-300' : 'text-emerald-400'
                      }`}
                    >
                      {isCrit ? 'ПЕРЕГРУЗКА' : isWarn ? 'ВЫСОКАЯ' : 'ОПТИМАЛЬНО'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1.5 font-mono tabular-nums">
                    <span className="text-lg font-bold text-white">{usedPct.toFixed(1)}%</span>
                    <span className="text-xs text-slate-400">
                      Барьер: <strong className="text-rose-400">{limitPct.toFixed(0)}%</strong> (пред. {warnPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-2 border border-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isCrit ? 'bg-rose-500' : isWarn ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, prox))}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>Макс. 1 поз. ({singleSym}):</span>
                  <span className={singlePct >= 28 ? 'text-amber-300 font-semibold' : 'text-slate-200 font-semibold'}>
                    {singlePct.toFixed(1)}% / {singleLim.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Gauge 4: Funding Settlement Window & ATR Volatility Guard */}
          {(() => {
            const mins = riskTelemetry?.funding.minutesToNextFunding ?? 120;
            const warnMins = riskTelemetry?.funding.warningFundingMinutes ?? 15;
            const maxAtr = riskTelemetry?.funding.maxAtrPct ?? 4.9;
            const isWarn = mins <= warnMins;
            const barWidth = Math.max(5, Math.min(100, ((480 - mins) / 480) * 100));

            return (
              <div
                className={`bg-slate-950/90 border rounded-lg p-3.5 flex flex-col justify-between ${
                  isWarn ? 'border-amber-500/50' : 'border-slate-800/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <MetricTooltip metric="ATR" value={maxAtr}>
                      <span className="text-slate-300 font-semibold">4. ОКНО ФАНДИНГА / ATR</span>
                    </MetricTooltip>
                    <span className={`font-bold ${isWarn ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {isWarn ? 'ОКНО < 15 МИН' : 'ОТКРЫТО'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1.5 font-mono tabular-nums">
                    <span className="text-lg font-bold text-white">
                      {mins >= 60 ? `${Math.floor(mins / 60)}ч ${mins % 60}м` : `${mins} мин`}
                    </span>
                    <span className="text-xs text-slate-400">
                      Фильтр: <strong className="text-amber-300">&le;{warnMins} мин</strong>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-2 border border-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isWarn ? 'bg-amber-400' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <MetricTooltip metric="ATR" value={maxAtr} showIcon={false}>
                    <span>Пик волатильности ATR-14:</span>
                  </MetricTooltip>
                  <span className="text-cyan-300 font-semibold">{maxAtr.toFixed(1)}% (Адаптивный SL)</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Live Notification Feed Header & Filters */}
        <div className="pt-1 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Bell className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-bold">Журнал оперативных уведомлений Риск-Файрвола ({visibleNotifications.length})</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              {(
                [
                  { id: 'ALL', label: 'Все события' },
                  { id: 'CRITICAL', label: 'Критические' },
                  { id: 'WARNING', label: 'Предупреждения' },
                  { id: 'SPREAD', label: 'Спред L2' },
                  { id: 'DRAWDOWN', label: 'Просадка 24ч' },
                  { id: 'GUARD_LOG', label: 'Перехваты ботов' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAlertFilter(tab.id)}
                  className={`px-2.5 py-1 rounded border text-[11px] transition whitespace-nowrap shrink-0 ${
                    alertFilter === tab.id
                      ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/40 font-semibold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              {dismissedAlertIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDismissedAlertIds([])}
                  className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-[11px] transition whitespace-nowrap shrink-0"
                >
                  Вернуть скрытые ({dismissedAlertIds.length})
                </button>
              )}
            </div>
          </div>

          {visibleNotifications.length === 0 ? (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5 flex items-center justify-between text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Все параметры рынка и портфеля находятся в пределах норм Риск-Файрвола. Отклонений по спреду L2 или суточной просадке не зафиксировано.
                </span>
              </div>
              <span className="text-emerald-400 font-semibold whitespace-nowrap ml-3">СТАТУС: OK</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {visibleNotifications.map((item) => {
                const isCrit = item.severity === 'CRITICAL';
                const isWarn = item.severity === 'WARNING';

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 flex items-start justify-between gap-3 transition ${
                      isCrit
                        ? 'bg-rose-950/35 border-rose-500/60'
                        : isWarn
                        ? 'bg-amber-950/30 border-amber-500/50'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`mt-0.5 p-1.5 rounded-md border shrink-0 ${
                          isCrit
                            ? 'bg-rose-950 border-rose-500/50 text-rose-400'
                            : isWarn
                            ? 'bg-amber-950 border-amber-500/50 text-amber-300'
                            : 'bg-slate-900 border-slate-700 text-cyan-400'
                        }`}
                      >
                        {isCrit ? (
                          <ShieldAlert className="w-4 h-4" />
                        ) : isWarn ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Activity className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-xs font-bold font-mono ${
                              isCrit ? 'text-rose-200' : isWarn ? 'text-amber-200' : 'text-slate-200'
                            }`}
                          >
                            {item.title}
                          </span>
                          {item.symbol && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-900 border border-slate-700 text-cyan-300 rounded">
                              {item.symbol}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{item.message}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-0.5 tabular-nums">
                          <span>
                            Текущее:{' '}
                            <strong className={isCrit ? 'text-rose-400' : isWarn ? 'text-amber-300' : 'text-cyan-300'}>
                              {item.currentValue}
                            </strong>
                          </span>
                          <span>
                            Лимит: <strong className="text-slate-200">{item.limitValue}</strong>
                          </span>
                          <span>
                            Близость к порогу: <strong className="text-white">{item.proximityPct}%</strong>
                          </span>
                          <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      title="Скрыть уведомление"
                      onClick={() => setDismissedAlertIds((prev) => [...prev, item.id])}
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Recharts Equity Curve & Risk Firewall Protection Chart */}
      <EquityCurveChart
        equityAnalytics={equityAnalytics}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        botFilter={botFilter}
        warningDrawdownPct={riskTelemetry?.drawdown.warningDrawdownPct ?? 3.0}
        maxDailyDrawdownLimitPct={riskTelemetry?.drawdown.maxDailyDrawdownLimitPct ?? 5.0}
        isKillSwitchActive={riskTelemetry?.drawdown.isKillSwitchActive ?? false}
      />

      {/* Sub-Account Breakdown by AI Bot & Deposit Control */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Bot Sub-Accounts Breakdown (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Субсчета ИИ-ботов (нажмите на карточку для фильтрации графика и сделок)
              </h2>
              {botFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setBotFilter('ALL')}
                  className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline"
                >
                  Показать все субсчета
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {agents.map((agent) => {
                const botTrades = closedTrades.filter((t) => t.botId === agent.agentId);
                const botNetPnl = botTrades.reduce((acc, t) => acc + t.netPnlUsdt, 0);
                const botOpenCount = activePositions.filter((p) => p.botId === agent.agentId).length;
                const isSelected = botFilter === agent.agentId;
                const isBotEnabled = agent.isEnabled !== false;

                return (
                  <button
                    key={agent.agentId}
                    type="button"
                    onClick={() => setBotFilter(isSelected ? 'ALL' : agent.agentId)}
                    className={`text-left bg-slate-950 border rounded-lg p-3 font-mono text-xs flex flex-col justify-between transition ${
                      isSelected
                        ? 'border-cyan-500 ring-1 ring-cyan-500/30'
                        : 'border-slate-800/90 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white truncate">{agent.name}</span>
                        <span className={`text-[11px] flex-shrink-0 ${isBotEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {isBotEnabled ? 'АКТИВЕН' : 'ПАУЗА'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Риск: {agent.riskPerTradePct ?? 1.5}% · Плечо: {agent.leverage ?? 10}x · Открыто: {botOpenCount}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 space-y-1 tabular-nums w-full">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Вирт. субсчет:</span>
                        <span className="text-white font-semibold">${agent.virtualBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Чистый PnL ({botTrades.length} сд.):</span>
                        <span className={`font-bold ${botNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {botNetPnl >= 0 ? '+' : ''}${botNetPnl.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Профит-фактор:</span>
                        <span className="text-cyan-300">{agent.profitFactor.toFixed(2)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Virtual Margin Pool Deposit / Reset Manager (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Управление маржинальным пулом (Режим 1)
              </h2>
              <span className="text-xs font-mono text-slate-400">Shadow Pool</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Базовый капитал используется процедурным Риск-Файрволом для расчета объема сделок и автоматически сохраняется на диск сервера.
            </p>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <label htmlFor="deposit-amount-input" className="text-slate-300 block mb-1">
                  Сумма пополнения (USDT)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="deposit-amount-input"
                    type="number"
                    min="10"
                    max="1000000"
                    value={customDeposit}
                    onChange={(e) => setCustomDeposit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white tabular-nums focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    disabled={isAdjusting}
                    onClick={() => handleAdjustBalance('DEPOSIT')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg transition flex items-center gap-1 flex-shrink-0"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Пополнить</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isAdjusting}
                  onClick={() => handleAdjustBalance('DEPOSIT', 1000)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition text-center"
                >
                  +$1,000
                </button>
                <button
                  type="button"
                  disabled={isAdjusting}
                  onClick={() => handleAdjustBalance('DEPOSIT', 5000)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition text-center"
                >
                  +$5,000
                </button>
                <button
                  type="button"
                  disabled={isAdjusting}
                  onClick={() => handleAdjustBalance('RESET')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 rounded-lg transition flex items-center gap-1"
                  title="Сбросить базовый капитал к $10,000 USDT"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сброс $10k</span>
                </button>
              </div>
            </div>
          </div>

          {adjustStatus && (
            <div
              className={`mt-3 p-2 rounded-lg text-xs font-mono ${
                adjustStatus.type === 'success'
                  ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/50 border border-rose-500/30 text-rose-300'
              }`}
            >
              {adjustStatus.text}
            </div>
          )}
        </div>
      </div>

      {/* Main History & Ledger Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
        {/* Sub-Tabs & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          {/* Segmented Control */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveSubTab('trades')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSubTab === 'trades'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5 text-cyan-400" />
              <span>История закрытых сделок ({closedTrades.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('ledger')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSubTab === 'ledger'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Журнал операций по балансу ({ledger.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('open')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSubTab === 'open'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Активные позиции ({activePositions.length})</span>
            </button>
          </div>

          {/* Filters when on Closed Trades tab */}
          {activeSubTab === 'trades' && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {/* Search by Symbol */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                <input
                  type="text"
                  aria-label="Поиск по тикеру или боту"
                  placeholder="Тикер или бот..."
                  value={symbolQuery}
                  onChange={(e) => setSymbolQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-40"
                />
              </div>

              {/* Bot Selector */}
              <select
                aria-label="Фильтр по ИИ-боту"
                value={botFilter}
                onChange={(e) => setBotFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Все боты и оператор</option>
                <option value="agent-onnx-ppo-v2">ONNX PyTorch RL</option>
                <option value="agent-lgbm-nightly">LightGBM Momentum</option>
                <option value="agent-tg-crypto-alpha">TG Alpha Parser</option>
                <option value="manual">Ручные сделки</option>
              </select>

              {/* Outcome Selector */}
              <select
                aria-label="Фильтр по результату сделки"
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as 'ALL' | 'WIN' | 'LOSS')}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Все исходы</option>
                <option value="WIN">Только профит (+PnL)</option>
                <option value="LOSS">Только убыток (-PnL)</option>
              </select>

              {/* Time Window Selector */}
              <select
                aria-label="Фильтр по периоду"
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value as TimeWindowFilter)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">За все время</option>
                <option value="24H">За последние 24 часа</option>
                <option value="7D">За 7 дней</option>
              </select>

              {/* Mode Selector */}
              <select
                aria-label="Фильтр по режиму исполнения"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value as 'ALL' | 'SHADOW' | 'LIVE')}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Все режимы</option>
                <option value="SHADOW">Режим 1 (Shadow)</option>
                <option value="LIVE">Режим 2 (Live)</option>
              </select>

              {/* Reset Filters button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-1 transition"
                  title="Сбросить все активные фильтры"
                >
                  <FilterX className="w-3 h-3" />
                  <span>Сбросить</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sub-Tab 1: Closed Trades History Table */}
        {activeSubTab === 'trades' && (
          <div>
            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs font-mono">
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg px-3 py-2">
                <div className="text-[10px] text-slate-400">Сделок в выборке</div>
                <div className="text-white font-bold text-sm mt-0.5">
                  {filteredTrades.length} <span className="text-xs font-normal text-slate-500">из {closedTrades.length}</span>
                </div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg px-3 py-2">
                <div className="text-[10px] text-slate-400">Винрейт выборки</div>
                <div className="text-cyan-300 font-bold text-sm mt-0.5">
                  {winRatePct}% <span className="text-xs font-normal text-slate-400">({winTradesCount}W / {lossTradesCount}L)</span>
                </div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg px-3 py-2">
                <div className="text-[10px] text-slate-400">Чистый PnL выборки</div>
                <div className={`font-bold text-sm mt-0.5 ${filteredNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {filteredNetPnl >= 0 ? '+' : ''}${filteredNetPnl.toFixed(2)} USDT
                </div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg px-3 py-2">
                <div className="text-[10px] text-slate-400">Ср. прибыль / убыток</div>
                <div className="text-slate-200 font-bold text-sm mt-0.5">
                  <span className="text-emerald-400">+${avgWinUsdt}</span> / <span className="text-rose-400">-${Math.abs(avgLossUsdt)}</span>
                </div>
              </div>
            </div>

            {filteredTrades.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs font-mono">
                По выбранным фильтрам закрытых сделок не найдено.
                {hasActiveFilters && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-cyan-400 hover:underline"
                    >
                      Сбросить фильтры для отображения всех сделок ({closedTrades.length})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs tabular-nums">
                  <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/60">
                    <tr>
                      <th className="py-2.5 px-3">Время закрытия</th>
                      <th className="py-2.5 px-3">Инструмент</th>
                      <th className="py-2.5 px-3">Инициатор / Бот</th>
                      <th className="py-2.5 px-3">Сторона</th>
                      <th className="py-2.5 px-3">Объем</th>
                      <th className="py-2.5 px-3">Вход → Выход (USDT)</th>
                      <th className="py-2.5 px-3">Причина закрытия</th>
                      <th className="py-2.5 px-3">Комиссия</th>
                      <th className="py-2.5 px-3 text-right">Чистый PnL (ROE)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {paginatedTrades.map((trade) => {
                      const isWin = trade.netPnlUsdt > 0;
                      const timeStr = new Date(trade.closedAt).toLocaleTimeString();
                      const durationSec = Math.max(1, Math.round((trade.closedAt - trade.openedAt) / 1000));
                      const durationLabel =
                        durationSec >= 3600
                          ? `${(durationSec / 3600).toFixed(1)}ч`
                          : durationSec >= 60
                          ? `${Math.round(durationSec / 60)}м`
                          : `${durationSec}с`;

                      return (
                        <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-3 text-slate-300">
                            <div>{timeStr}</div>
                            <div className="text-[10px] text-slate-500">Длит.: {durationLabel}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">{trade.symbol}</div>
                            <div className="text-[10px] text-slate-400">
                              {trade.mode === 'SHADOW' ? 'Режим 1 (Shadow)' : 'Режим 2 (Live)'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-cyan-300">{trade.botName}</td>
                          <td className="py-2.5 px-3">
                            <span className={trade.side === 'LONG' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {trade.side} {trade.leverage}x
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-200">{trade.qty}</td>
                          <td className="py-2.5 px-3 text-slate-200">
                            ${trade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} →{' '}
                            <span className="text-white font-semibold">
                              ${trade.exitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={
                                trade.exitReason === 'TP_HIT'
                                  ? 'text-emerald-400'
                                  : trade.exitReason === 'SL_HIT'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                              }
                            >
                              {trade.exitReason === 'TP_HIT'
                                ? 'Take-Profit'
                                : trade.exitReason === 'SL_HIT'
                                ? 'Stop-Loss'
                                : 'Закрыто вручную'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">-${trade.feeUsdt.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}${trade.netPnlUsdt.toFixed(2)} USDT
                            </div>
                            <div className={`text-[10px] ${isWin ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isWin ? '+' : ''}{trade.roePct.toFixed(2)}% ROE
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredTrades.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Показывать по:</span>
                  {([10, 15, 25, 50, 'ALL'] as (number | 'ALL')[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                      className={`px-2 py-0.5 rounded text-xs transition ${
                        pageSize === size
                          ? 'bg-slate-800 text-white font-bold border border-slate-700'
                          : 'bg-slate-950 hover:text-white text-slate-400 border border-slate-800/60'
                      }`}
                    >
                      {size === 'ALL' ? 'Все' : size}
                    </button>
                  ))}
                  <span className="text-slate-500 text-[11px] ml-1">
                    (Показано {paginatedTrades.length} из {filteredTrades.length})
                  </span>
                </div>

                {pageSize !== 'ALL' && totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40 hover:text-white transition"
                      aria-label="Предыдущая страница"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>
                      Стр. <strong className="text-white">{currentPage}</strong> из {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40 hover:text-white transition"
                      aria-label="Следующая страница"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sub-Tab 2: Balance Ledger / Cashflow */}
        {activeSubTab === 'ledger' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs tabular-nums">
              <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/60">
                <tr>
                  <th className="py-2.5 px-3">Время</th>
                  <th className="py-2.5 px-3">Тип операции</th>
                  <th className="py-2.5 px-3">Инструмент</th>
                  <th className="py-2.5 px-3">Описание проводки</th>
                  <th className="py-2.5 px-3 text-right">Изменение (USDT)</th>
                  <th className="py-2.5 px-3 text-right">Баланс после (USDT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ledger.map((item) => {
                  const isPos = item.amountUsdt >= 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">
                        {item.type === 'REALIZED_PNL'
                          ? 'Реализованный PnL'
                          : item.type === 'DEPOSIT_RESET'
                          ? 'Операция с капиталом'
                          : item.type}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">{item.symbol || 'USDT'}</td>
                      <td className="py-2.5 px-3 text-slate-300">{item.description}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}${item.amountUsdt.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-white font-semibold">
                        ${item.balanceAfterUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sub-Tab 3: Active Open Positions with Instant Market Close */}
        {activeSubTab === 'open' && (
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2 px-1">
              <span>
                Открыто позиций в работе: <strong className="text-white">{activePositions.length}</strong>
              </span>
              {activePositions.length > 0 && (
                <button
                  type="button"
                  disabled={isClosingAll}
                  onClick={handleCloseAllPositions}
                  className="px-3 py-1 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 rounded transition text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isClosingAll ? 'Закрытие...' : 'Закрыть все позиции по рынку'}</span>
                </button>
              )}
            </div>

            {activePositions.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs font-mono">
                Нет открытых позиций. Нажмите «Форсировать тик ИИ» выше, чтобы боты проанализировали стакан L2.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs tabular-nums">
                  <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/60">
                    <tr>
                      <th className="py-2.5 px-3">Инструмент</th>
                      <th className="py-2.5 px-3">ИИ-Бот / Инициатор</th>
                      <th className="py-2.5 px-3">Сторона</th>
                      <th className="py-2.5 px-3">Объем</th>
                      <th className="py-2.5 px-3">Цена входа (VWAP)</th>
                      <th className="py-2.5 px-3">Текущая цена</th>
                      <th className="py-2.5 px-3">SL / TP1</th>
                      <th className="py-2.5 px-3">Плавающий PnL</th>
                      <th className="py-2.5 px-3 text-right">Управление</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activePositions.map((pos) => {
                      const isProfit = pos.unrealizedPnl >= 0;
                      return (
                        <tr key={pos.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-bold text-white">{pos.symbol}</td>
                          <td className="py-2.5 px-3 text-cyan-300">{pos.botName || 'Оператор'}</td>
                          <td className="py-2.5 px-3">
                            <span className={pos.side === 'LONG' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {pos.side} {pos.leverage}x
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-200">{pos.qty}</td>
                          <td className="py-2.5 px-3 text-slate-300">${pos.entryVwap.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-white font-semibold">${pos.currentPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-slate-400">
                            SL: ${pos.slPrice.toFixed(1)} · TP: ${pos.tpGrid?.[0]?.price?.toFixed(1) || '—'}
                          </td>
                          <td className={`py-2.5 px-3 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} USDT
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleCloseActivePosition(pos.id)}
                              className="px-3 py-1 bg-slate-800 hover:bg-rose-900/70 hover:text-rose-200 text-slate-200 rounded transition text-xs whitespace-nowrap shrink-0"
                            >
                              Закрыть в кошелек
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
