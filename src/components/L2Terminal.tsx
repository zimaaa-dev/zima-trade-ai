import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  ArrowRight,
  Shield,
  Zap,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  Bot,
  Play,
  Pause,
  RefreshCw,
  Cpu,
  Radio,
  Sparkles,
} from 'lucide-react';
import { Tooltip } from './Tooltip.tsx';
import { MetricTooltip } from './MetricTooltip.tsx';
import type { OrderbookData, ScreenerPair, Position, LimitOrder, ExecutionMode, ExchangeId, BotLogEntry, AgentItem } from '../types.ts';

interface L2TerminalProps {
  mode: ExecutionMode;
  isKillSwitchActive: boolean;
  activeExchange?: ExchangeId;
  onRefreshHealth: () => void;
}

export const L2Terminal: React.FC<L2TerminalProps> = ({
  mode,
  isKillSwitchActive,
  activeExchange = 'BYBIT',
  onRefreshHealth,
}) => {
  const exchangeLabel = activeExchange === 'OKX' ? 'OKX' : 'Bybit';
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [screener, setScreener] = useState<ScreenerPair[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [limitOrders, setLimitOrders] = useState<LimitOrder[]>([]);
  const [botsState, setBotsState] = useState<{
    isRunning: boolean;
    speedMs: number;
    bots: AgentItem[];
    recentLogs: BotLogEntry[];
    activePositionsCount: number;
  } | null>(null);
  const [tickingBot, setTickingBot] = useState<boolean>(false);

  // Form State
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [qty, setQty] = useState<string>('0.0001');
  const [limitPrice, setLimitPrice] = useState<string>('68500.0');
  const [stopLoss, setStopLoss] = useState<string>('67500.0');
  const [tp1, setTp1] = useState<string>('69800.0');
  const [tp2, setTp2] = useState<string>('71200.0');
  const [tp3, setTp3] = useState<string>('72500.0');
  const [autoRisk15, setAutoRisk15] = useState<boolean>(true);

  // Execution Feedback
  const [executing, setExecuting] = useState<boolean>(false);
  const [lastExecution, setLastExecution] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Safe JSON parser to avoid "Unexpected token '<'" when dev server or proxies return HTML
  const safeJson = async (res: Response | null) => {
    if (!res) return null;
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      try {
        return await res.json();
      } catch {
        return null;
      }
    }
    return null;
  };

  // Fetch Orderbook, Screener, Positions, and Bot State
  const fetchMarketData = async () => {
    try {
      const [bookRes, screenerRes, posRes, botsRes] = await Promise.all([
        fetch(`/api/market/orderbook?symbol=${selectedSymbol}`).catch(() => null),
        fetch('/api/market/screener').catch(() => null),
        fetch('/api/positions').catch(() => null),
        fetch('/api/bots/state').catch(() => null),
      ]);

      const [bookData, screenerData, posData, botsData] = await Promise.all([
        safeJson(bookRes),
        safeJson(screenerRes),
        safeJson(posRes),
        safeJson(botsRes),
      ]);

      if (bookData) setOrderbook(bookData);
      if (screenerData) setScreener(screenerData);
      if (posData) {
        setPositions(posData.positions || []);
        setLimitOrders(posData.limitOrders || []);
      }
      if (botsData) {
        setBotsState(botsData);
      }
    } catch {
      // Graceful degradation: never crash or log unhandled SyntaxError
    }
  };

  const handleToggleBots = async () => {
    try {
      const res = await fetch('/api/bots/toggle', { method: 'POST' });
      if (res.ok) {
        fetchMarketData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerBotTick = async () => {
    setTickingBot(true);
    try {
      const res = await fetch('/api/bots/tick', { method: 'POST' });
      if (res.ok) {
        fetchMarketData();
        onRefreshHealth();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setTickingBot(false), 500);
    }
  };

  const handleToggleSingleBot = async (agentId: string, currentlyEnabled: boolean) => {
    try {
      const res = await fetch('/api/bots/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, isEnabled: !currentlyEnabled }),
      });
      if (res.ok) {
        fetchMarketData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 2000);
    return () => clearInterval(interval);
  }, [selectedSymbol, activeExchange]);

  // Auto-calibrate order entry form (limitPrice, SL, TP1/TP2/TP3) to live exchange price when symbol or side changes
  const [lastSyncedKey, setLastSyncedKey] = useState<string>('');
  useEffect(() => {
    const livePair = screener.find((s) => s.symbol === selectedSymbol);
    const refPrice =
      (side === 'LONG' ? orderbook?.asks[0]?.price : orderbook?.bids[0]?.price) ||
      livePair?.price ||
      0;
    if (!refPrice || refPrice <= 0) return;

    const syncKey = `${selectedSymbol}_${side}`;
    const currentSlNum = parseFloat(stopLoss) || 0;
    const isDrifted = Math.abs(refPrice - currentSlNum) / refPrice > 0.12;

    if (lastSyncedKey !== syncKey || isDrifted) {
      const dec = refPrice >= 1000 ? 1 : refPrice >= 10 ? 2 : 4;
      const dir = side === 'LONG' ? 1 : -1;
      setLimitPrice((refPrice * (1 - 0.002 * dir)).toFixed(dec));
      setStopLoss((refPrice * (1 - 0.015 * dir)).toFixed(dec));
      setTp1((refPrice * (1 + 0.018 * dir)).toFixed(dec));
      setTp2((refPrice * (1 + 0.032 * dir)).toFixed(dec));
      setTp3((refPrice * (1 + 0.048 * dir)).toFixed(dec));
      setLastSyncedKey(syncKey);
    }
  }, [selectedSymbol, side, screener, orderbook?.timestamp]);

  // Handle auto risk size calculation
  useEffect(() => {
    if (!autoRisk15 || !stopLoss || !orderbook) return;

    const currentPrice = side === 'LONG' ? orderbook.asks[0]?.price : orderbook.bids[0]?.price;
    if (!currentPrice) return;

    const entry = orderType === 'MARKET' ? currentPrice : parseFloat(limitPrice) || currentPrice;
    const sl = parseFloat(stopLoss);

    fetch('/api/risk/calculate-size', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedSymbol,
        side,
        entryPrice: entry,
        stopLossPrice: sl,
        requestedLeverage: 10,
      }),
    })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        return res.ok && ct.includes('application/json') ? res.json() : null;
      })
      .then((data) => {
        if (data && data.allowed && data.qty) {
          setQty(data.qty.toString());
        }
      })
      .catch(() => {});
  }, [selectedSymbol, side, stopLoss, limitPrice, orderType, autoRisk15, orderbook?.timestamp]);

  // Execute Order
  const handleExecute = async () => {
    setErrorMsg(null);
    setExecuting(true);

    try {
      const tpGrid = [
        { price: parseFloat(tp1), share: 0.5 },
        { price: parseFloat(tp2), share: 0.3 },
        { price: parseFloat(tp3), share: 0.2 },
      ].filter((t) => !isNaN(t.price) && t.price > 0);

      const res = await fetch('/api/orders/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          orderType,
          qty: parseFloat(qty),
          limitPrice: parseFloat(limitPrice),
          stopLossPrice: parseFloat(stopLoss),
          tpGrid,
        }),
      });

      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : null;
      if (!res.ok || !data || !data.success) {
        setErrorMsg(data?.reason || `Ошибка исполнения ордера (HTTP ${res.status})`);
      } else {
        setLastExecution(data);
        fetchMarketData();
        onRefreshHealth();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка сети');
    } finally {
      setExecuting(false);
    }
  };

  const handleClosePosition = async (id: string) => {
    try {
      const res = await fetch('/api/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        fetchMarketData();
        onRefreshHealth();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Orderbook metrics
  const bestBid = orderbook?.bids[0]?.price ?? 0;
  const bestAsk = orderbook?.asks[0]?.price ?? 0;
  const spread = bestAsk - bestBid;
  const spreadBps = bestBid > 0 ? (spread / bestBid) * 10000 : 0;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  // Live L2 OBI (Orderbook Imbalance across top 25 levels) & VWAP
  const topBids = orderbook?.bids.slice(0, 25) || [];
  const topAsks = orderbook?.asks.slice(0, 25) || [];
  const sumBidVol = topBids.reduce((acc, lvl) => acc + lvl.qty, 0);
  const sumAskVol = topAsks.reduce((acc, lvl) => acc + lvl.qty, 0);
  const totalBookVol = sumBidVol + sumAskVol;
  const liveObiPct = totalBookVol > 0 ? ((sumBidVol - sumAskVol) / totalBookVol) * 100 : 0;

  const totalNotional =
    topBids.reduce((acc, lvl) => acc + lvl.price * lvl.qty, 0) +
    topAsks.reduce((acc, lvl) => acc + lvl.price * lvl.qty, 0);
  const liveVwap = totalBookVol > 0 ? totalNotional / totalBookVol : bestBid;

  return (
    <div className="p-3 sm:p-4 space-y-4 w-full max-w-[1600px] mx-auto overflow-x-hidden">
      {/* 5-Min Screener Top Active Pool */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 leading-snug">
              Шаг 1. Выберите монету для наблюдения или сделки (Лучшие активные монеты)
            </span>
            <Tooltip
              title="Автоматический отбор лучших монет"
              text="Система каждые 5 минут выбирает самые надежные и популярные монеты с большим торговым оборотом и минимальной разницей цен (узким спредом), чтобы вы и роботы не торговали сомнительными активами."
            />
          </div>
          <span className="text-[11px] text-slate-400 leading-snug">
            Нажмите или наведите на любой показатель с пунктиром, чтобы прочитать простое объяснение
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
          {screener.map((item) => {
            const isSelected = item.symbol === selectedSymbol;
            return (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setSelectedSymbol(item.symbol)}
                className={`px-3 py-2 rounded-lg border text-left flex-shrink-0 transition-all font-mono ${
                  isSelected
                    ? 'bg-cyan-950/60 border-cyan-500/50 text-white shadow-md shadow-cyan-950'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-xs font-bold">
                  <span className={isSelected ? 'text-cyan-300' : 'text-slate-200'}>{item.symbol}</span>
                  <div className="flex items-center gap-1.5">
                    {item.priceChangePct !== undefined && (
                      <span className={`text-[10px] font-mono font-semibold ${item.priceChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {item.priceChangePct >= 0 ? '+' : ''}{item.priceChangePct.toFixed(1)}%
                      </span>
                    )}
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-sans ${
                        item.isTrendHot || item.status === 'TREND'
                          ? 'bg-rose-950 text-rose-300 border border-rose-700/60 font-bold'
                          : item.status === 'READY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-amber-950 text-amber-400 border border-amber-800/40 animate-pulse'
                      }`}
                    >
                      {item.isTrendHot || item.status === 'TREND' ? '🔥 ТРЕНД' : item.status === 'READY' ? 'АКТИВНА' : 'АНАЛИЗ'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                  <span className="text-white font-semibold">${item.price.toLocaleString()}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-emerald-400">Оборот ${(item.turnover24h / 1e6).toFixed(0)} млн</span>
                  <span className="text-slate-500">•</span>
                  <MetricTooltip metric="SPREAD_BPS" value={item.spreadBps} showIcon={false}>
                    <span>Спред {item.spreadBps.toFixed(1)} б.п.</span>
                  </MetricTooltip>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: L2 Orderbook + Order Entry Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Orderbook L2-50 View (7 cols) */}
        <div className="lg:col-span-7 min-w-0 bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3 border-b border-slate-800 pb-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-white text-base font-mono">{selectedSymbol}</span>
                  <span className="text-xs text-slate-300 font-semibold leading-snug">
                    Живая очередь заявок с биржи {exchangeLabel} (Биржевой стакан L2)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 font-bold inline-flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {exchangeLabel.toUpperCase()} LIVE
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Красные строки сверху — продавцы (хотят продать дороже). Зеленые снизу — покупатели (хотят купить дешевле).
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Отклик:</span> <strong className="text-cyan-300">~44 мс</strong>
                  <Tooltip
                    title="Реалистичная скорость сделки"
                    text={`Даже на учебном счете сделка открывается с учетом реального времени прохождения сигнала до сервера биржи ${exchangeLabel} (~44 миллисекунды).`}
                  />
                </span>
              </div>
            </div>

            {/* Live Technical Metrics Bar with Context-Aware Tooltips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3 p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-lg font-mono text-xs tabular-nums">
              <div className="min-w-0">
                <MetricTooltip metric="OBI" value={liveObiPct}>
                  <span className="text-[10px] text-slate-400 truncate">Дисбаланс L2 OBI</span>
                </MetricTooltip>
                <div
                  className={`font-bold mt-0.5 truncate ${
                    liveObiPct > 10
                      ? 'text-emerald-400'
                      : liveObiPct < -10
                      ? 'text-rose-400'
                      : 'text-cyan-300'
                  }`}
                >
                  {liveObiPct >= 0 ? '+' : ''}
                  {liveObiPct.toFixed(1)}%{' '}
                  <span className="text-[10px] font-normal text-slate-400">
                    ({liveObiPct > 10 ? 'Спрос ▲' : liveObiPct < -10 ? 'Продажи ▼' : 'Баланс'})
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <MetricTooltip metric="VWAP" value={liveVwap}>
                  <span className="text-[10px] text-slate-400 truncate">Средняя VWAP</span>
                </MetricTooltip>
                <div className="font-bold text-white mt-0.5 truncate">
                  ${liveVwap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="min-w-0">
                <MetricTooltip metric="SPREAD_BPS" value={spreadBps}>
                  <span className="text-[10px] text-slate-400 truncate">Спред (bps)</span>
                </MetricTooltip>
                <div className={`font-bold mt-0.5 truncate ${spreadBps > 15 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {spreadBps.toFixed(2)} bps
                </div>
              </div>

              <div className="min-w-0">
                <MetricTooltip metric="ATR" value={1.45}>
                  <span className="text-[10px] text-slate-400 truncate">Защита ATR-Стоп</span>
                </MetricTooltip>
                <div className="font-bold text-amber-300 mt-0.5 truncate">1.45x ATR (Авто)</div>
              </div>
            </div>

            {/* Depth Table Header */}
            <div className="grid grid-cols-3 gap-1 text-[10px] sm:text-[11px] font-mono text-slate-400 px-2 py-1.5 bg-slate-950/60 rounded">
              <span className="truncate">Цена (USDT)</span>
              <span className="text-right truncate">Объем ({selectedSymbol.replace('USDT', '')})</span>
              <span className="text-right truncate">Сумма (USDT)</span>
            </div>

            {/* Asks (Red) */}
            <div className="text-[10px] font-mono text-rose-400/90 px-2 pt-1.5 flex items-center justify-between gap-2">
              <span className="truncate">▼ ПРОДАВЦЫ (Продажа / Ask)</span>
              <span className="hidden sm:inline text-slate-500">Чем шире полоса, тем крупнее объем</span>
            </div>
            <div className="space-y-0.5 my-1.5 max-h-48 overflow-y-auto font-mono text-xs scrollbar-none">
              {(orderbook?.asks.slice(0, 8) || [])
                .slice()
                .reverse()
                .map((lvl, idx) => {
                  const depthWidth = Math.min(100, lvl.qty * 30);
                  return (
                    <div
                      key={`ask-${idx}`}
                      className="grid grid-cols-3 gap-1 px-2 py-0.5 rounded relative hover:bg-rose-950/30 group tabular-nums"
                    >
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none"
                        style={{ width: `${depthWidth}%` }}
                      />
                      <span className="text-rose-400 font-semibold relative z-10 truncate">{lvl.price.toFixed(2)}</span>
                      <span className="text-right text-slate-300 relative z-10 truncate">{lvl.qty.toFixed(3)}</span>
                      <span className="text-right text-slate-400 relative z-10 truncate">
                        ${(lvl.price * lvl.qty).toFixed(0)}
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Spread Indicator */}
            <div className="my-2 py-1.5 px-2.5 sm:px-3 bg-slate-950 border-y border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2">
                <MetricTooltip metric="SPREAD_BPS" value={spreadBps}>
                  <span className="text-slate-300 font-sans">Разница цен (Спред):</span>
                </MetricTooltip>
                <span className="font-bold text-white">${spread.toFixed(2)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${spreadPct > 0.25 ? 'bg-rose-900 text-rose-300' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'}`}>
                  {spreadBps.toFixed(1)} б.п. ({spreadPct <= 0.15 ? 'Выгодно' : 'Повышенный'})
                </span>
              </div>
              {spreadPct > 0.25 && (
                <span className="text-rose-400 font-bold flex items-center gap-1 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> СПРЕД ШИРОКИЙ — БЛОКИРОВКА ВХОДА
                </span>
              )}
            </div>

            {/* Bids (Green) */}
            <div className="text-[10px] font-mono text-emerald-400/90 px-2 pb-0.5 flex items-center justify-between gap-2">
              <span className="truncate">▲ ПОКУПАТЕЛИ (Покупка / Bid)</span>
              <span className="hidden sm:inline text-slate-500">Чем шире полоса, тем крупнее объем</span>
            </div>
            <div className="space-y-0.5 my-1.5 max-h-48 overflow-y-auto font-mono text-xs scrollbar-none">
              {(orderbook?.bids.slice(0, 8) || []).map((lvl, idx) => {
                const depthWidth = Math.min(100, lvl.qty * 30);
                return (
                  <div
                    key={`bid-${idx}`}
                    className="grid grid-cols-3 gap-1 px-2 py-0.5 rounded relative hover:bg-emerald-950/30 group tabular-nums"
                  >
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none"
                      style={{ width: `${depthWidth}%` }}
                    />
                    <span className="text-emerald-400 font-semibold relative z-10 truncate">{lvl.price.toFixed(2)}</span>
                    <span className="text-right text-slate-300 relative z-10 truncate">{lvl.qty.toFixed(3)}</span>
                    <span className="text-right text-slate-400 relative z-10 truncate">
                      ${(lvl.price * lvl.qty).toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Last Execution VWAP Card */}
          {lastExecution && (
            <div className="mt-3 p-3 bg-slate-950 border border-cyan-500/30 rounded-lg text-xs font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2 text-cyan-400 font-bold mb-1">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Сделка открыта ({mode === 'SHADOW' ? 'Учебный счет' : 'Реальный счет'})</span>
                </span>
                <span>Скорость: {lastExecution.simulatedDelayMs ?? 44} мс</span>
              </div>
              {lastExecution.execution && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300 mt-2">
                  <div>
                    <MetricTooltip metric="VWAP" value={lastExecution.execution.vwapPrice}>
                      <span className="text-slate-400 block text-[10px]">Средняя (VWAP)</span>
                    </MetricTooltip>
                    <span className="font-bold text-white">${lastExecution.execution.vwapPrice?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Отклонение</span>
                    <span className="text-amber-400">
                      {(lastExecution.execution.slippagePct * 100).toFixed(4)}%
                    </span>
                  </div>
                  <div>
                    <MetricTooltip metric="BYBIT_FEE">
                      <span className="text-slate-400 block text-[10px]">Комиссия</span>
                    </MetricTooltip>
                    <span className="text-slate-300">${lastExecution.execution.feeUsdt?.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Уровней стакана</span>
                    <span className="text-slate-300">{lastExecution.execution.levelsWalked ?? 1}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order Placement & Risk Firewall Auto-Sizer (5 cols) */}
        <div className="lg:col-span-5 min-w-0 bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Ручное открытие сделки (Для практики)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Роботы торгуют сами, но здесь вы можете открыть свою сделку с авто-защитой от убытка.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 shrink-0">
                Макс. риск 1.5%
              </span>
            </div>

            {/* Side & Type Switchers */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSide('LONG')}
                  className={`py-1.5 px-2 rounded-md text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 ${
                    side === 'LONG'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">КУПИТЬ / ЛОНГ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SHORT')}
                  className={`py-1.5 px-2 rounded-md text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 ${
                    side === 'SHORT'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">ПРОДАТЬ / ШОРТ</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrderType('MARKET')}
                  className={`py-1.5 px-2 rounded-md text-[11px] sm:text-xs font-bold transition truncate ${
                    orderType === 'MARKET' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  По рынку (Сразу)
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('LIMIT')}
                  className={`py-1.5 px-2 rounded-md text-[11px] sm:text-xs font-bold transition truncate ${
                    orderType === 'LIMIT' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Лимитный (По цене)
                </button>
              </div>
            </div>

            {/* Inputs: Limit Price (if LIMIT), Stop Loss, Quantity */}
            {orderType === 'LIMIT' && (
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">
                  Желаемая цена покупки/продажи (USDT)
                </label>
                <input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <MetricTooltip metric="ATR" value={1.45}>
                  <label className="text-[11px] text-slate-300 cursor-help">
                    Защитный Стоп-Лосс (ATR, USDT)
                  </label>
                </MetricTooltip>
                <label className="text-[10px] text-cyan-400 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRisk15}
                    onChange={(e) => setAutoRisk15(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-cyan-500"
                  />
                  <span>Авто-объем (Риск 1.5%)</span>
                </label>
              </div>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <label className="text-[11px] text-slate-300">
                  Количество монет ({selectedSymbol.replace('USDT', '')})
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  Сумма: ${(parseFloat(qty || '0') * (bestBid || 1)).toFixed(1)} USDT
                </span>
              </div>
              <input
                type="number"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setAutoRisk15(false);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Dynamic TP Collapse Grid Preview */}
            <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
              <div className="flex items-center justify-between mb-1.5">
                <MetricTooltip metric="TP_SL_RATIO" value={1.8}>
                  <span className="text-[11px] font-bold text-slate-300">
                    Цели фиксации прибыли (Take-Profit)
                  </span>
                </MetricTooltip>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block">Цель 1 (50% объема)</span>
                  <input
                    type="number"
                    value={tp1}
                    onChange={(e) => setTp1(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Цель 2 (30% объема)</span>
                  <input
                    type="number"
                    value={tp2}
                    onChange={(e) => setTp2(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Цель 3 (20% объема)</span>
                  <input
                    type="number"
                    value={tp3}
                    onChange={(e) => setTp3(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleExecute}
              disabled={executing || isKillSwitchActive}
              className={`w-full py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 ${
                isKillSwitchActive
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : side === 'LONG'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-900/40'
                  : 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-rose-900/40'
              }`}
            >
              {executing ? (
                <span>Открытие сделки ({mode})...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>
                    Открыть сделку {side === 'LONG' ? 'НА РОСТ (ЛОНГ)' : 'НА ПАДЕНИЕ (ШОРТ)'} ({mode === 'SHADOW' ? 'Учебный счет' : 'Реальный счет'})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Autonomous Bot Trading Engine Panel (Mode 1: Shadow Forward-Test) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-4 min-w-0">
        {/* Header & Controls */}
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-950 shrink-0">
              <Bot className="w-5 h-5 text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider">
                  Автономные торговые боты (Форвард-Тест)
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold inline-flex items-center gap-1.5 shrink-0 ${
                  botsState?.isRunning
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                    : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${botsState?.isRunning ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                  {botsState?.isRunning ? 'ОНЛАЙН • 3 БОТА' : 'НА ПАУЗЕ'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5 leading-snug">
                Боты непрерывно сканируют стакан {exchangeLabel} L2, открывают сделки и фиксируют TP/SL под защитой Risk Firewall.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleTriggerBotTick}
              disabled={tickingBot}
              className="flex-1 sm:flex-initial justify-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 border border-slate-700"
              title="Форсировать немедленный тик анализа рынка и генерацию сделки"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${tickingBot ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{tickingBot ? 'Анализ...' : 'Сделать тик'}</span>
            </button>

            <button
              onClick={handleToggleBots}
              className={`flex-1 sm:flex-initial justify-center px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                botsState?.isRunning
                  ? 'bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-600/40'
                  : 'bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-600/40'
              }`}
            >
              {botsState?.isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5 shrink-0" />
                  <span>Пауза ботов</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>Включить авто-торговлю</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3 Active Bot Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(botsState?.bots || []).map((botItem, idx) => {
            const isBotEnabled = botItem.isEnabled !== false;
            const iconBg =
              idx === 0
                ? 'bg-purple-950 text-purple-400'
                : idx === 1
                ? 'bg-amber-950 text-amber-400'
                : 'bg-blue-950 text-blue-400';

            return (
              <div
                key={botItem.agentId}
                className={`bg-slate-950 p-3 rounded-lg border transition min-w-0 ${
                  isBotEnabled
                    ? 'border-slate-800/80 hover:border-cyan-500/30'
                    : 'border-slate-800/50 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${iconBg}`}>
                      {idx === 0 ? (
                        <Cpu className="w-3.5 h-3.5" />
                      ) : idx === 1 ? (
                        <Zap className="w-3.5 h-3.5" />
                      ) : (
                        <Radio className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-white truncate">{botItem.name}</h4>
                      <span className="text-[10px] text-slate-400 font-mono block truncate">
                        Риск {botItem.riskPerTradePct ?? 1.5}% · {botItem.leverage ?? 10}x · RR 1:{botItem.tpSlRatio ?? 1.8}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSingleBot(botItem.agentId, isBotEnabled)}
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border transition whitespace-nowrap shrink-0 ${
                      isBotEnabled
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800/40 hover:bg-amber-950 hover:text-amber-300'
                        : 'bg-amber-950 text-amber-400 border-amber-800/40 hover:bg-emerald-950 hover:text-emerald-300'
                    }`}
                    title={isBotEnabled ? 'Поставить бота на паузу' : 'Возобновить работу бота'}
                  >
                    {isBotEnabled ? 'АКТИВЕН' : 'ПАУЗА'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono bg-slate-900/60 p-1.5 rounded mb-2 tabular-nums">
                  <div className="min-w-0">
                    <MetricTooltip metric="QUARANTINE_TRADES" value={botItem.tradesCount} showIcon={false}>
                      <span className="text-slate-400 block truncate">Сделок</span>
                    </MetricTooltip>
                    <span className="text-white font-bold block mt-0.5">{botItem.tradesCount}</span>
                  </div>
                  <div className="min-w-0">
                    <MetricTooltip metric="PROFIT_FACTOR" value={botItem.profitFactor} showIcon={false}>
                      <span className="text-slate-400 block truncate">Окупаемость</span>
                    </MetricTooltip>
                    <span className="text-emerald-400 font-bold block mt-0.5">x{botItem.profitFactor.toFixed(2)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block truncate">Субсчет</span>
                    <span className="text-cyan-400 font-bold block mt-0.5 truncate">${botItem.virtualBalance.toFixed(0)}</span>
                  </div>
                </div>

                <span className="text-[10px] text-slate-400 font-mono block truncate">
                  Пары: {(botItem.allowedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']).join(' · ')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live Bot Execution Feed (Terminal Style) */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <span className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wide">
                Живая лента действий и решений торговых ботов
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Обновление каждые 3.5 сек
            </span>
          </div>

          <div className="bg-slate-950 rounded-lg border border-slate-800 p-3 max-h-48 overflow-y-auto space-y-2 font-mono text-xs scrollbar-thin">
            {botsState?.recentLogs && botsState.recentLogs.length > 0 ? (
              botsState.recentLogs.slice(0, 8).map((log) => {
                const dateStr = new Date(log.timestamp).toLocaleTimeString();
                const isEntry = log.action === 'ORDER_OPEN';
                const isTp = log.action === 'TP_HIT';
                const isSl = log.action === 'SL_HIT';
                const isLimit = log.action === 'LIMIT_FILL';

                return (
                  <div key={log.id} className="flex flex-wrap sm:flex-nowrap items-start gap-1.5 sm:gap-2.5 text-[11px] leading-relaxed border-b border-slate-900/80 pb-1.5 last:border-0 last:pb-0">
                    <span className="text-slate-500 flex-shrink-0 text-[10px]">[{dateStr}]</span>

                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold flex-shrink-0 ${
                        isEntry
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40'
                          : isTp
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                          : isSl
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/40'
                          : isLimit
                          ? 'bg-purple-950 text-purple-300 border border-purple-800/40'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isEntry ? 'ВХОД' : isTp ? 'ТЕЙК' : isSl ? 'СТОП' : isLimit ? 'ЛИМИТ' : log.action}
                    </span>

                    <span className="font-semibold flex-shrink-0 text-cyan-400">
                      {log.botName}:
                    </span>

                    <span className="text-slate-300 flex-1 min-w-[180px] break-words">{log.message}</span>

                    <span className="text-slate-500 text-[10px] flex-shrink-0 ml-auto">
                      {log.rttMs}мс
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-slate-500 text-center py-2 text-[11px]">
                Инициализация потока решений ботов...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Positions & Limit Orders Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Активные позиции ({positions.length}) и очередь заявок ({limitOrders.length})
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Режим: {mode === 'SHADOW' ? 'Учебный (Forward-Test)' : 'Реальный (LIVE)'} •{' '}
            <MetricTooltip metric="BYBIT_FEE" showIcon={false}>
              <span>{exchangeLabel} Taker 0.055%</span>
            </MetricTooltip>
          </span>
        </div>

        {positions.length === 0 && limitOrders.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs font-mono">
            Нет открытых позиций. Боты сканируют рынок и откроют сделку при появлении дисбаланса L2 или сигнала.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[11px] text-slate-400 border-b border-slate-800 bg-slate-950/40">
                <tr>
                  <th className="py-2 px-3">Пара</th>
                  <th className="py-2 px-3">Инициатор / Стратегия</th>
                  <th className="py-2 px-3">Сторона</th>
                  <th className="py-2 px-3">Объем</th>
                  <th className="py-2 px-3">
                    <MetricTooltip metric="VWAP">
                      <span>Цена входа (VWAP)</span>
                    </MetricTooltip>
                  </th>
                  <th className="py-2 px-3">Текущая цена ({exchangeLabel})</th>
                  <th className="py-2 px-3">
                    <MetricTooltip metric="UNREALIZED_PNL">
                      <span>Нереализ. PnL</span>
                    </MetricTooltip>
                  </th>
                  <th className="py-2 px-3">
                    <MetricTooltip metric="ATR">
                      <span>Цели SL / TP</span>
                    </MetricTooltip>
                  </th>
                  <th className="py-2 px-3">Фандинг</th>
                  <th className="py-2 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.map((pos) => {
                  const isProfit = pos.unrealizedPnl >= 0;
                  const botLabel = pos.botName || (
                    pos.botId === 'agent-onnx-ppo-v2'
                      ? 'ONNX PyTorch RL'
                      : pos.botId === 'agent-lgbm-nightly'
                      ? 'LightGBM Momentum'
                      : pos.botId === 'agent-tg-crypto-alpha'
                      ? 'TG Alpha Parser'
                      : 'Ручной ордер'
                  );

                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white">{pos.symbol}</div>
                        <span className="text-[10px] text-cyan-400">{pos.mode === 'SHADOW' ? 'РЕЖИМ 1 (SHADOW)' : 'РЕЖИМ 2 (LIVE)'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                            pos.botId?.includes('onnx')
                              ? 'bg-purple-950 text-purple-300 border border-purple-800/40'
                              : pos.botId?.includes('lgbm')
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                              : pos.botId?.includes('tg')
                              ? 'bg-blue-950 text-blue-300 border border-blue-800/40'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-800/40'
                          }`}
                        >
                          <Bot className="w-3 h-3" />
                          <span>{botLabel}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pos.side === 'LONG'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/30'
                              : 'bg-rose-950 text-rose-400 border border-rose-800/30'
                          }`}
                        >
                          {pos.side} {pos.leverage}x
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">{pos.qty}</td>
                      <td className="py-2.5 px-3 text-slate-300">${pos.entryVwap.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-white font-semibold">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          ${pos.currentPrice.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">
                        <div>SL: ${pos.slPrice.toFixed(1)}</div>
                        <div className="text-[10px] text-cyan-300">
                          {pos.tpGrid?.length ? `${pos.tpGrid.length} ур. TP ($${pos.tpGrid[0]?.price?.toFixed(1) || '0'})` : 'Без TP'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">${pos.fundingPaid.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleClosePosition(pos.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/60 hover:text-rose-300 text-slate-300 rounded text-[11px] transition"
                        >
                          Закрыть
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
    </div>
  );
};
