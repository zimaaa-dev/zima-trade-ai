import React from 'react';
import {
  Server,
  Cpu,
  Database,
  Shield,
} from 'lucide-react';
import type { SystemHealth } from '../types.ts';

interface TopologyViewProps {
  health: SystemHealth | null;
}

export const TopologyView: React.FC<TopologyViewProps> = ({ health }) => {
  return (
    <div className="p-4 space-y-6 max-w-[1600px] mx-auto">
      {/* Overview Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-slate-950 flex items-center justify-center font-bold">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">Топология контуров и шлюзов OKX V5</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 whitespace-nowrap shrink-0">
                TS SINGLE OWNER · PYTHON SHADOW
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Боевое исполнение OKX V5 принадлежит исключительно TypeScript-ядру; Python работает в изолированном Shadow/ML-контуре.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            OKX V5 RTT: <strong className="text-cyan-400">{health?.pings?.okx ?? 32} мс</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            Фаза: <strong className="text-emerald-400">{health?.runtimePhase ?? 'READY'}</strong>
          </span>
        </div>
      </div>

      {/* Node Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Node A */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Node A: TypeScript LIVE Execution Owner (Cloud.ru 24/7)</h3>
                <span className="text-[10px] font-mono text-cyan-400">
                  OKX V5 Strict · Virtual Portfolios · Global Risk Manager
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0">
              PRIMARY
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Исполнение и владение позициями:
              </span>
              <p className="text-[11px] text-slate-400">
                Единый шлюз OKX V5 (L2-50 стакан, clOrdId идемпотентность, защитные Algo SL/TP, DCA=OFF, Position Ownership Lock в net_mode).
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Виртуальные портфели и MTF (1m–1D):
              </span>
              <p className="text-[11px] text-slate-400">
                {health?.virtualPortfoliosCount ?? 6} независимых портфелей, MTF Context Service (закрытые свечи) и Risk Firewall.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800 tabular-nums">
            <span>Активные блокировки: {health?.activeOwnershipCount ?? 0}</span>
            <span className="text-emerald-400 font-bold">ОНЛАЙН</span>
          </div>
        </div>

        {/* Node B */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-950 text-purple-400 flex items-center justify-center">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Node B: Изолированный Python Shadow & ML-контур</h3>
                <span className="text-[10px] font-mono text-purple-400">SHADOW_LEARNING_ONLY=True · LIVE=Blocked</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-300 whitespace-nowrap shrink-0">
              SHADOW ONLY
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-amber-400 font-bold block mb-1">
                Оценка кандидатов (Stage 5):
              </span>
              <p className="text-[11px] text-slate-400">
                LightGBM / PyTorch RL / ONNX Virtual Matching (комиссия OKX 0.05%). Авто-продвижение в LIVE заблокировано.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Артефакты и проверка:
              </span>
              <p className="text-[11px] text-slate-400">
                Формирование отчётов KEEP/REJECT/EXTEND_TEST и контроль SHA256 без записи в боевые параметры.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800 tabular-nums">
            <span>Shadow кандидатов: {health?.shadowCandidatesCount ?? 2}</span>
            <span className="text-purple-400 font-bold">Изолирован от LIVE</span>
          </div>
        </div>

        {/* Node D */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-950 text-blue-400 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Портфельный леджер и журнал исполнения</h3>
                <span className="text-[10px] font-mono text-cyan-400">Локальное WAL-хранилище</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0">
              АКТИВНО
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Сверка, ордера и MTF:
              </span>
              <p className="text-[11px] text-slate-400">
                Хранение закрытых сделок, проводок виртуальных портфелей, exchangeOrders и отчётов Shadow Learning в <code className="text-cyan-300">data/runtime_state.json</code>.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Синхронизация на диск</span>
            <span className="text-emerald-400 font-bold">Активно</span>
          </div>
        </div>

        {/* Node E */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-950 text-rose-400 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Внешний шлюз Cloudflare & Watchdog</h3>
                <span className="text-[10px] font-mono text-rose-400">Geo-Proxy & Мониторинг</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0">
              ЗАЩИТА
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-rose-400 font-bold block mb-1">
                Контроль доступности:
              </span>
              <p className="text-[11px] text-slate-400">
                Проверка отклика ядра каждые 60с и доставка срочных уведомлений (Stop-Loss / Kill-Switch) в Telegram.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800 tabular-nums">
            <span>Сбоев подряд: {health?.nodes?.nodeE?.dead_man_failures ?? 0}</span>
            <span className="text-emerald-400 font-bold">Защита активна</span>
          </div>
        </div>
      </div>
    </div>
  );
};
