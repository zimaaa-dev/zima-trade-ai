import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Percent,
  TrendingDown,
  AlertTriangle,
  Flame,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { SystemHealth } from '../types.ts';

interface RiskFirewallViewProps {
  health: SystemHealth | null;
  onKillSwitchTrigger: () => void;
  onKillSwitchReset: () => void;
}

export const RiskFirewallView: React.FC<RiskFirewallViewProps> = ({
  health,
  onKillSwitchTrigger,
  onKillSwitchReset,
}) => {
  const isKillSwitch = health?.isKillSwitchActive ?? false;
  const drawdownPct = health?.drawdownPct ?? -1.42;
  const capital = health?.capitalUsdt ?? 10;

  // Simulator State
  const [simCapital, setSimCapital] = useState<string>('10');
  const [simEntry, setSimEntry] = useState<string>('68500');
  const [simSL, setSimSL] = useState<string>('67500');
  const [simSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [simLeverage, setSimLeverage] = useState<string>('10');
  const [simSpreadPct] = useState<string>('0.15');
  const [simFundingRate] = useState<string>('0.05');
  const [simMinutesToFunding] = useState<string>('20');

  // Compute test verdict
  const testCapital = parseFloat(simCapital) || 10;
  const testEntry = parseFloat(simEntry) || 68500;
  const testSL = parseFloat(simSL) || 67500;
  const testLev = parseInt(simLeverage) || 15;
  const testSpread = parseFloat(simSpreadPct) || 0.15;
  const testFunding = parseFloat(simFundingRate) || 0.05;
  const testMinutes = parseInt(simMinutesToFunding) || 20;

  const slDistance = Math.abs(testEntry - testSL);
  const maxRiskUsdt = testCapital * 0.015;
  const maxQty = slDistance > 0 ? maxRiskUsdt / slDistance : 0;
  const clampedLev = Math.min(testLev, 10);

  const isInvalidDirection =
    (simSide === 'LONG' && testSL >= testEntry) || (simSide === 'SHORT' && testSL <= testEntry);
  const isSpreadBlown = testSpread > 0.25;
  const isFundingAdverse =
    testMinutes <= 15 &&
    ((simSide === 'LONG' && testFunding > 0.1) || (simSide === 'SHORT' && testFunding < -0.1));

  const allPassed = !isKillSwitch && !isInvalidDirection && !isSpreadBlown && !isFundingAdverse && slDistance > 0;
  const actualDrawdownLossPct = drawdownPct < 0 ? Math.abs(drawdownPct) : 0;
  const drawdownBarFillPct = Math.min(100, (actualDrawdownLossPct / 5.0) * 100);

  return (
    <div className="p-3 sm:p-4 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Firewall Master Status Banner */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border ${
          isKillSwitch
            ? 'bg-rose-950/70 border-rose-500/80 shadow-xl shadow-rose-950/50'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${
                isKillSwitch ? 'bg-rose-600 text-white animate-pulse' : 'bg-emerald-950 border border-emerald-500/40 text-emerald-400'
              }`}
            >
              {isKillSwitch ? <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7" /> : <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                  Процедурный Риск-Файрвол (Risk Management Firewall)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0">
                  НЕИЗМЕНЯЕМОЕ ЯДРО PYTHON
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Правила жестко зашиты в процедурный код ядра. Ни одна стратегия или внешняя настройка не может отключить или обойти эту защиту.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
            {isKillSwitch ? (
              <button
                onClick={onKillSwitchReset}
                className="w-full sm:w-auto justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Сбросить аварийную блокировку</span>
              </button>
            ) : (
              <button
                onClick={onKillSwitchTrigger}
                className="w-full sm:w-auto justify-center px-4 py-2.5 bg-rose-900/60 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Тест глобального Стоп-Крана</span>
              </button>
            )}
          </div>
        </div>

        {/* 24h Drawdown Progress Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono mb-2">
            <span className="text-slate-400">Скользящая просадка капитала за 24 часа:</span>
            <div className="flex flex-wrap items-center gap-2">
              {drawdownPct >= 0 ? (
                <>
                  <span className="font-bold text-emerald-400 whitespace-nowrap">
                    0.00% (24ч PnL: +{drawdownPct.toFixed(2)}%)
                  </span>
                  <span className="text-slate-500 whitespace-nowrap">/ Порог блокировки: -5.00%</span>
                </>
              ) : (
                <>
                  <span className={`font-bold whitespace-nowrap ${drawdownPct <= -4.0 ? 'text-rose-400' : 'text-amber-300'}`}>
                    {drawdownPct.toFixed(2)}%
                  </span>
                  <span className="text-slate-500 whitespace-nowrap">/ Порог блокировки: -5.00%</span>
                </>
              )}
            </div>
          </div>
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
            <div
              className={`h-full transition-all duration-300 ${
                drawdownPct <= -4.0 ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
              }`}
              style={{ width: `${drawdownBarFillPct}%` }}
            />
            {/* 5% Kill Marker */}
            <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-rose-500" />
          </div>
        </div>
      </div>

      {/* The 5 Pillars Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Pillar 1 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mb-3">
              <Percent className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              1. Риск 1.5% на сделку
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Объем позиции автоматически масштабируется от дистанции стоп-лосса: <code className="text-cyan-300">max_loss = capital * 0.015</code>.
            </p>
          </div>
          <div className="mt-3 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 p-1.5 rounded border border-emerald-900/40">
            Активно: Макс. ${(capital * 0.015).toFixed(2)} / ${capital.toFixed(0)} USDT
          </div>
        </div>

        {/* Pillar 2 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 rounded-lg bg-rose-950 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-3">
              <TrendingDown className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              2. Стоп-кран при -5.0%
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              При падении PnL за 24ч &ge; 5% мгновенно отменяются все ордера, закрываются боевые позиции и блокируется Режим 2 на 24ч.
            </p>
          </div>
          <div className="mt-3 text-[10px] font-mono text-cyan-400 bg-cyan-950/40 p-1.5 rounded border border-cyan-900/40">
            Авто-триггер взведен
          </div>
        </div>

        {/* Pillar 3 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 rounded-lg bg-amber-950 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              3. Изолированная маржа &le; 10x
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Кросс-маржа строго запрещена для исключения каскадной ликвидации. Плечо аппаратно ограничено до 10x.
            </p>
          </div>
          <div className="mt-3 text-[10px] font-mono text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-900/40">
            Лимит: min(lev, 10x)
          </div>
        </div>

        {/* Pillar 4 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 rounded-lg bg-purple-950 border border-purple-500/30 text-purple-400 flex items-center justify-center mb-3">
              <Flame className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              4. Защита от фандинга
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Блокирует новые входы за 15 минут до клиринга, если ставка финансирования против позиции превышает 0.10%.
            </p>
          </div>
          <div className="mt-3 text-[10px] font-mono text-purple-400 bg-purple-950/40 p-1.5 rounded border border-purple-900/40">
            Фильтр окна 15 мин
          </div>
        </div>

        {/* Pillar 5 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              5. Контроль спреда
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Отклоняет рыночные ордера при спреде (Ask - Bid) / Bid &gt; 0.25% (25 б.п.) для защиты от прострелов в неликвиде.
            </p>
          </div>
          <div className="mt-3 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 p-1.5 rounded border border-emerald-900/40">
            Макс. спред &le; 0.25%
          </div>
        </div>
      </div>

      {/* Interactive Firewall Rule Simulator */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
          Интерактивный симулятор проверки Риск-Файрвола
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Капитал счета (USDT)</label>
            <input
              type="number"
              value={simCapital}
              onChange={(e) => setSimCapital(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Цена входа (USDT)</label>
            <input
              type="number"
              value={simEntry}
              onChange={(e) => setSimEntry(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Цена Стоп-Лосса (USDT)</label>
            <input
              type="number"
              value={simSL}
              onChange={(e) => setSimSL(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Запрошенное плечо</label>
            <input
              type="number"
              value={simLeverage}
              onChange={(e) => setSimLeverage(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
            />
          </div>
        </div>

        {/* Verdict Box */}
        <div
          className={`mt-4 p-4 rounded-xl border text-xs font-mono ${
            allPassed
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 font-bold mb-2">
            {allPassed ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>ОРДЕР ОДОБРЕН РИСК-ФАЙРВОЛОМ</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-rose-400" />
                <span>ОРДЕР ОТКЛОНЕН РИСК-ФАЙРВОЛОМ</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-300 text-[11px] mt-2">
            <div>
              <span className="text-slate-500 block">Допустимый убыток (1.5%)</span>
              <span className="font-bold">${maxRiskUsdt.toFixed(2)} USDT</span>
            </div>
            <div>
              <span className="text-slate-500 block">Расчетный объем позиции</span>
              <span className="font-bold">{maxQty.toFixed(5)} ед.</span>
            </div>
            <div>
              <span className="text-slate-500 block">Итоговое плечо (с учетом лимита)</span>
              <span className="font-bold">{clampedLev}x (Макс. 10x)</span>
            </div>
            <div>
              <span className="text-slate-500 block">Требуемая маржа</span>
              <span className="font-bold">${((maxQty * testEntry) / clampedLev).toFixed(2)} USDT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
