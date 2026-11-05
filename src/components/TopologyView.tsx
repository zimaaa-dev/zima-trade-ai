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
              <h2 className="text-base font-extrabold text-white">Состояние узлов и сетевых шлюзов</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                АКТИВНАЯ СЕТЬ
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Мониторинг задержек до биржевых шлюзов Bybit V5 и состояния серверных сервисов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            Bybit V5 RTT: <strong className="text-emerald-400">{health?.pings?.bybit ?? 24} мс</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            OKX Backup RTT: <strong className="text-cyan-400">{health?.pings?.okx ?? 38} мс</strong>
          </span>
        </div>
      </div>

      {/* Node Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Node A */}
        <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Node A: Боевое ядро терминала (Cloud.ru 24/7)</h3>
                <span className="text-[10px] font-mono text-cyan-400">
                  Зона ru.AZ-1 • 194.113.34.230 • Ubuntu 24.04
                </span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Поток котировок и исполнение:
              </span>
              <p className="text-[11px] text-slate-400">
                Прием стаканов L2-50, расчет VWAP и OBI, исполнение ордеров и контроль стоп-лоссов.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Хранилище и аналитика:
              </span>
              <p className="text-[11px] text-slate-400">
                Журнал сделок, история котировок, парсер каналов и REST API терминала.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>2 vCPU • 4 ГБ ОЗУ • 30 ГБ SSD</span>
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
                <h3 className="font-bold text-sm text-white">Node B: Внешний узел калибровки</h3>
                <span className="text-[10px] font-mono text-purple-400">Вычислительная станция</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
              ПО ЗАПРОСУ
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-amber-400 font-bold block mb-1">
                Назначение:
              </span>
              <p className="text-[11px] text-slate-400">
                Пакетное тестирование исторических свечей Bybit V5 и пересчет весов факторов стратегий.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Синхронизация:
              </span>
              <p className="text-[11px] text-slate-400">
                Обмен параметрами стратегий с основным сервером и проверка контрольных сумм SHA256.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Протокол: HTTPS / WireGuard</span>
            <span className="text-purple-400 font-bold">Режим ожидания</span>
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
                <h3 className="font-bold text-sm text-white">Индекс исторических сетапов</h3>
                <span className="text-[10px] font-mono text-cyan-400">Локальное хранилище</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Архив сделок и сигналов:
              </span>
              <p className="text-[11px] text-slate-400">
                Хранение закрытых позиций, статистики каналов и параметров риска в <code className="text-cyan-300">data/runtime_state.json</code>.
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
                <h3 className="font-bold text-sm text-white">Внешний шлюз Cloudflare</h3>
                <span className="text-[10px] font-mono text-rose-400">Geo-Proxy & Туннель</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-rose-400 font-bold block mb-1">
                Контроль доступности:
              </span>
              <p className="text-[11px] text-slate-400">
                Проверка отклика ядра каждые 60с и доставка уведомлений через резервный контур.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Сбоев подряд: {health?.nodes?.nodeE?.dead_man_failures ?? 0}</span>
            <span className="text-emerald-400 font-bold">Защита активна</span>
          </div>
        </div>
      </div>
    </div>
  );
};
