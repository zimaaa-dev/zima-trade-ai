import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { EquityCurveAnalytics, TimeWindowFilter } from '../lib/wallet-math.ts';

interface EquityCurveChartProps {
  equityAnalytics: EquityCurveAnalytics;
  timeWindow: TimeWindowFilter;
  onTimeWindowChange: (tw: TimeWindowFilter) => void;
  botFilter: string;
  warningDrawdownPct?: number;
  maxDailyDrawdownLimitPct?: number;
  isKillSwitchActive?: boolean;
}

type ChartDisplayMode = 'EQUITY' | 'COMBINED' | 'DRAWDOWN';

interface ChartDataRow {
  index: number;
  timestamp: number;
  timeFormatted: string;
  fullDateFormatted: string;
  label: string;
  equityUsdt: number;
  highWaterMarkUsdt: number;
  drawdownPct: number;
  signedDrawdownPct: number;
  deltaUsdt: number;
  warningFloorUsdt: number;
  killSwitchFloorUsdt: number;
  safetyBufferUsdt: number;
  eventType: 'START' | 'TRADE' | 'LIVE';
  symbol?: string;
  botId?: string;
  botName?: string;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  equityAnalytics,
  timeWindow,
  onTimeWindowChange,
  botFilter,
  warningDrawdownPct = 3.0,
  maxDailyDrawdownLimitPct = 5.0,
  isKillSwitchActive = false,
}) => {
  const [chartMode, setChartMode] = useState<ChartDisplayMode>('EQUITY');
  const [showFirewallBarriers, setShowFirewallBarriers] = useState<boolean>(true);

  const chartData: ChartDataRow[] = useMemo(() => {
    return equityAnalytics.points.map((pt) => {
      const d = new Date(pt.timestamp);
      const timeFormatted = d.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const fullDateFormatted = d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const warningFloorUsdt = Number(
        (pt.highWaterMarkUsdt * (1 - warningDrawdownPct / 100)).toFixed(2)
      );
      const killSwitchFloorUsdt = Number(
        (pt.highWaterMarkUsdt * (1 - maxDailyDrawdownLimitPct / 100)).toFixed(2)
      );
      const safetyBufferUsdt = Number(
        Math.max(0, pt.equityUsdt - killSwitchFloorUsdt).toFixed(2)
      );

      return {
        index: pt.index,
        timestamp: pt.timestamp,
        timeFormatted:
          pt.eventType === 'START'
            ? 'Старт'
            : pt.eventType === 'LIVE'
            ? 'Live'
            : timeFormatted,
        fullDateFormatted,
        label: pt.label,
        equityUsdt: pt.equityUsdt,
        highWaterMarkUsdt: pt.highWaterMarkUsdt,
        drawdownPct: pt.drawdownPct,
        signedDrawdownPct: Number((-Math.abs(pt.drawdownPct)).toFixed(2)),
        deltaUsdt: pt.deltaUsdt,
        warningFloorUsdt,
        killSwitchFloorUsdt,
        safetyBufferUsdt,
        eventType: pt.eventType,
        symbol: pt.symbol,
        botId: pt.botId,
        botName: pt.botName,
      };
    });
  }, [equityAnalytics.points, warningDrawdownPct, maxDailyDrawdownLimitPct]);

  const latestRow = chartData[chartData.length - 1];
  const currentKillSwitchFloorUsdt = useMemo(() => {
    return Number(
      (equityAnalytics.peakEquityUsdt * (1 - maxDailyDrawdownLimitPct / 100)).toFixed(2)
    );
  }, [equityAnalytics.peakEquityUsdt, maxDailyDrawdownLimitPct]);

  const currentWarningFloorUsdt = useMemo(() => {
    return Number(
      (equityAnalytics.peakEquityUsdt * (1 - warningDrawdownPct / 100)).toFixed(2)
    );
  }, [equityAnalytics.peakEquityUsdt, warningDrawdownPct]);

  const currentSafetyBufferUsdt = useMemo(() => {
    return Number(
      Math.max(0, equityAnalytics.currentEquityUsdt - currentKillSwitchFloorUsdt).toFixed(2)
    );
  }, [equityAnalytics.currentEquityUsdt, currentKillSwitchFloorUsdt]);

  const yDomainEquity = useMemo((): [number, number] => {
    if (chartData.length === 0) return [9500, 10500];
    const equities = chartData.map((d) => d.equityUsdt);
    const hwms = chartData.map((d) => d.highWaterMarkUsdt);
    let minVal = Math.min(...equities);
    const maxVal = Math.max(...hwms, ...equities);

    if (showFirewallBarriers) {
      minVal = Math.min(minVal, currentWarningFloorUsdt, currentKillSwitchFloorUsdt);
    }

    const span = Math.max(25, maxVal - minVal);
    return [
      Math.floor(minVal - span * 0.08),
      Math.ceil(maxVal + span * 0.08),
    ];
  }, [chartData, showFirewallBarriers, currentWarningFloorUsdt, currentKillSwitchFloorUsdt]);

  const yDomainDrawdown = useMemo((): [number, number] => {
    const minSigned = Math.min(
      -maxDailyDrawdownLimitPct * 1.15,
      ...chartData.map((d) => d.signedDrawdownPct)
    );
    return [Number(minSigned.toFixed(1)), 0.2];
  }, [chartData, maxDailyDrawdownLimitPct]);

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row: ChartDataRow | undefined = payload[0]?.payload;
    if (!row) return null;

    const isPositiveDelta = row.deltaUsdt >= 0;

    return (
      <div className="bg-slate-950/95 border border-slate-700/90 rounded-xl p-3.5 shadow-2xl font-mono text-xs space-y-2 min-w-[270px] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
          <span className="text-slate-400 text-[11px]">{row.fullDateFormatted}</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              row.eventType === 'LIVE'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : row.eventType === 'START'
                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                : isPositiveDelta
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {row.eventType === 'LIVE'
              ? 'LIVE MARK'
              : row.eventType === 'START'
              ? 'ТОЧКА ОТСЧЕТА'
              : row.symbol || 'СДЕЛКА'}
          </span>
        </div>

        <div className="text-white font-semibold text-xs leading-snug">{row.label}</div>
        {row.botName && (
          <div className="text-[11px] text-cyan-400 flex items-center gap-1.5">
            <span>Стратегия:</span>
            <strong className="text-cyan-300">{row.botName}</strong>
          </div>
        )}

        <div className="space-y-1 pt-1 border-t border-slate-800/80 tabular-nums">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Капитал (Equity):</span>
            <span className="text-white font-bold">
              ${row.equityUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Пик капитала (HWM):</span>
            <span className="text-cyan-300 font-semibold">
              ${row.highWaterMarkUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </span>
          </div>

          {row.eventType !== 'START' && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">
                {row.eventType === 'LIVE' ? 'Плавающий PnL:' : 'Результат сделки:'}
              </span>
              <span className={`font-bold ${isPositiveDelta ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositiveDelta ? '+' : ''}${row.deltaUsdt.toFixed(2)} USDT
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Просадка от HWM:</span>
            <span className={row.drawdownPct > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
              -{row.drawdownPct.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="pt-1.5 border-t border-slate-800/80 space-y-1 text-[11px] tabular-nums">
          <div className="flex items-center justify-between gap-4">
            <span className="text-amber-300/90">Порог внимания (-{warningDrawdownPct.toFixed(1)}%):</span>
            <span className="text-amber-300 font-semibold">
              ${row.warningFloorUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-rose-300/90">Барьер Kill-Switch (-{maxDailyDrawdownLimitPct.toFixed(1)}%):</span>
            <span className="text-rose-400 font-semibold">
              ${row.killSwitchFloorUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-emerald-300/90">Буфер безопасности:</span>
            <span className="text-emerald-400 font-bold">
              +${row.safetyBufferUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3.5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Кривая Доходности (Equity Curve) и Защитный Коридор Риск-Файрвола</span>
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Recharts Real-Time
            </span>
            {botFilter !== 'ALL' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                Фильтр по субсчету: {botFilter}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Визуализация роста капитала, пиковых отметок High-Water Mark и защитных порогов отсечения убытков (-{warningDrawdownPct}% / -{maxDailyDrawdownLimitPct}%)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Firewall Barrier Lines Toggle */}
          {chartMode !== 'DRAWDOWN' && (
            <button
              type="button"
              onClick={() => setShowFirewallBarriers((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition flex items-center gap-1.5 ${
                showFirewallBarriers
                  ? 'bg-amber-950/60 text-amber-200 border-amber-500/40 font-semibold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Показать или скрыть горизонтальные линии защитных порогов Риск-Файрвола (-3% и -5%) на графике капитала"
            >
              {showFirewallBarriers ? (
                <Eye className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>Барьеры Риск-Файрвола</span>
            </button>
          )}

          {/* Time Window Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xs">
            {(['ALL', '7D', '24H'] as TimeWindowFilter[]).map((tw) => (
              <button
                key={tw}
                type="button"
                onClick={() => onTimeWindowChange(tw)}
                className={`px-2.5 py-1 rounded-md transition whitespace-nowrap shrink-0 ${
                  timeWindow === tw
                    ? 'bg-slate-800 text-white font-semibold border border-white/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tw === 'ALL' ? 'Все время' : tw === '7D' ? 'За 7 дней' : 'За 24 часа'}
              </button>
            ))}
          </div>

          {/* Chart Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xs">
            <button
              type="button"
              onClick={() => setChartMode('EQUITY')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                chartMode === 'EQUITY'
                  ? 'bg-emerald-950/90 text-emerald-300 font-semibold border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Кривая Equity</span>
            </button>

            <button
              type="button"
              onClick={() => setChartMode('COMBINED')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                chartMode === 'COMBINED'
                  ? 'bg-cyan-950/90 text-cyan-300 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Equity + Дельта сделок</span>
            </button>

            <button
              type="button"
              onClick={() => setChartMode('DRAWDOWN')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                chartMode === 'DRAWDOWN'
                  ? 'bg-rose-950/90 text-rose-300 font-semibold border border-rose-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Просадка (%)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Summary Cards: Equity Growth & Risk Firewall Protection Impact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs tabular-nums">
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-slate-400 text-[11px]">Текущий капитал vs Старт периода</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-base font-bold text-white">
              ${equityAnalytics.currentEquityUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span
              className={`font-semibold ${
                equityAnalytics.periodNetChangeUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {equityAnalytics.periodNetChangeUsdt >= 0 ? '+' : ''}
              ${equityAnalytics.periodNetChangeUsdt.toFixed(2)} ({equityAnalytics.periodReturnPct >= 0 ? '+' : ''}
              {equityAnalytics.periodReturnPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-slate-400 text-[11px]">Пик капитала (High-Water Mark)</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-base font-bold text-cyan-300">
              ${equityAnalytics.peakEquityUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-400 text-[11px]">
              Точек на кривой: <strong className="text-white">{chartData.length}</strong>
            </span>
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-slate-400 text-[11px]">Удержание просадки Риск-Файрволом</span>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-base font-bold ${
                equityAnalytics.maxDrawdownPct >= warningDrawdownPct ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              -{equityAnalytics.maxDrawdownPct.toFixed(2)}% макс.
            </span>
            <span className="text-slate-400 text-[11px]">
              Лимит: <strong className="text-rose-400">-{maxDailyDrawdownLimitPct.toFixed(1)}%</strong>
            </span>
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[11px]">Защищенный уровень Kill-Switch</span>
            {isKillSwitchActive ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-base font-bold text-rose-300">
              ${currentKillSwitchFloorUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-emerald-400 text-[11px] font-semibold">
              Запас: +${currentSafetyBufferUsdt.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Recharts Canvas */}
      <div className="w-full h-80 bg-slate-950/90 rounded-xl border border-slate-800/90 p-3">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'DRAWDOWN' ? (
            <ComposedChart data={chartData} margin={{ top: 12, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="rechartsDrawdownGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="timeFormatted"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                domain={yDomainDrawdown}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `${Number(val).toFixed(1)}%`}
                width={58}
              />
              <Tooltip content={renderCustomTooltip} />
              <ReferenceLine
                y={0}
                stroke="#06b6d4"
                strokeDasharray="3 3"
                label={{
                  value: 'Пик HWM (0.0%)',
                  position: 'insideTopRight',
                  fill: '#22d3ee',
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={-warningDrawdownPct}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `Предупреждение Риск-Файрвола (-${warningDrawdownPct.toFixed(1)}%)`,
                  position: 'insideBottomLeft',
                  fill: '#fbbf24',
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={-maxDailyDrawdownLimitPct}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `Лимит Kill-Switch (-${maxDailyDrawdownLimitPct.toFixed(1)}%)`,
                  position: 'insideTopLeft',
                  fill: '#fb7185',
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="signedDrawdownPct"
                name="Просадка (%)"
                stroke="#f43f5e"
                strokeWidth={2.5}
                fill="url(#rechartsDrawdownGrad)"
                baseValue={0}
                dot={{ r: 3.5, fill: '#f43f5e', stroke: '#020617', strokeWidth: 1.5 }}
                activeDot={{ r: 6, fill: '#fb7185', stroke: '#ffffff', strokeWidth: 1.5 }}
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={chartData} margin={{ top: 12, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="rechartsEquityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.36} />
                  <stop offset="65%" stopColor="#06b6d4" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="timeFormatted"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="equity"
                domain={yDomainEquity}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `$${Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                width={68}
              />
              {chartMode === 'COMBINED' && (
                <YAxis
                  yAxisId="delta"
                  orientation="right"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
                  tickFormatter={(val) => `${val >= 0 ? '+' : ''}$${Number(val).toFixed(0)}`}
                  width={54}
                />
              )}
              <Tooltip content={renderCustomTooltip} />

              {/* Starting Equity Baseline */}
              <ReferenceLine
                yAxisId="equity"
                y={equityAnalytics.startEquityUsdt}
                stroke="#475569"
                strokeDasharray="3 3"
                label={{
                  value: `Старт ($${equityAnalytics.startEquityUsdt.toLocaleString('en-US')})`,
                  position: 'insideBottomRight',
                  fill: '#94a3b8',
                  fontSize: 10,
                }}
              />

              {/* Risk Firewall Threshold Lines in Dollars */}
              {showFirewallBarriers && (
                <>
                  <ReferenceLine
                    yAxisId="equity"
                    y={currentWarningFloorUsdt}
                    stroke="#f59e0b"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{
                      value: `Порог внимания -${warningDrawdownPct}% ($${currentWarningFloorUsdt.toLocaleString('en-US')})`,
                      position: 'insideBottomLeft',
                      fill: '#fbbf24',
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    yAxisId="equity"
                    y={currentKillSwitchFloorUsdt}
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    strokeWidth={1.8}
                    label={{
                      value: `Защита Kill-Switch -${maxDailyDrawdownLimitPct}% ($${currentKillSwitchFloorUsdt.toLocaleString('en-US')})`,
                      position: 'insideTopLeft',
                      fill: '#fb7185',
                      fontSize: 10,
                    }}
                  />
                </>
              )}

              {/* Per-trade PnL bars when in COMBINED mode */}
              {chartMode === 'COMBINED' && (
                <Bar yAxisId="delta" dataKey="deltaUsdt" name="PnL сделки" barSize={14} radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        entry.eventType === 'START'
                          ? 'transparent'
                          : entry.deltaUsdt >= 0
                          ? 'rgba(16, 185, 129, 0.45)'
                          : 'rgba(244, 63, 94, 0.5)'
                      }
                    />
                  ))}
                </Bar>
              )}

              {/* High-Water Mark Line */}
              <Line
                yAxisId="equity"
                type="stepAfter"
                dataKey="highWaterMarkUsdt"
                name="Пик HWM"
                stroke="#22d3ee"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4, fill: '#22d3ee' }}
              />

              {/* Main Equity Curve Area */}
              <Area
                yAxisId="equity"
                type="monotone"
                dataKey="equityUsdt"
                name="Итоговый капитал"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#rechartsEquityGrad)"
                dot={{ r: 3.5, fill: '#10b981', stroke: '#020617', strokeWidth: 1.5 }}
                activeDot={{ r: 6, fill: '#34d399', stroke: '#ffffff', strokeWidth: 1.5 }}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Latest Point Status Footer */}
      <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span>Кривая Капитала (Equity)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-0.5 border-b-2 border-dashed border-cyan-400 inline-block" />
            <span>Пик High-Water Mark</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-0.5 border-b-2 border-dashed border-amber-400 inline-block" />
            <span>Предупреждение (-{warningDrawdownPct.toFixed(1)}%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-0.5 border-b-2 border-dashed border-rose-400 inline-block" />
            <span>Стоп-барьер Kill-Switch (-{maxDailyDrawdownLimitPct.toFixed(1)}%)</span>
          </span>
        </div>

        {latestRow && (
          <div className="flex items-center gap-2 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Live отметка:{' '}
              <strong className="text-white">
                ${latestRow.equityUsdt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
