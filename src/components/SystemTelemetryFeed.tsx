import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Activity,
  ShieldCheck,
  Radio,
  Cpu,
  Database,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Clock,
} from 'lucide-react';

export interface TelemetryLog {
  id: string;
  timestamp: string;
  module: 'INGESTOR' | 'FIREWALL' | 'ARENA' | 'TELEGRAM' | 'CORE_IPC' | 'STORAGE';
  level: 'INFO' | 'SUCCESS' | 'WARN';
  message: string;
}

const MODULE_COLORS = {
  INGESTOR: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40',
  FIREWALL: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40',
  ARENA: 'text-purple-400 border-purple-500/30 bg-purple-950/40',
  TELEGRAM: 'text-blue-400 border-blue-500/30 bg-blue-950/40',
  CORE_IPC: 'text-amber-400 border-amber-500/30 bg-amber-950/40',
  STORAGE: 'text-slate-400 border-slate-700 bg-slate-900',
};

const SAMPLE_EVENTS: Omit<TelemetryLog, 'id' | 'timestamp'>[] = [
  { module: 'INGESTOR', level: 'INFO', message: 'Получен пакет дельт стакана Bybit Linear L2-50 (RTT 24мс, OBI +0.14, BestAsk $77,488.10)' },
  { module: 'FIREWALL', level: 'SUCCESS', message: 'Проверка Риск-Файрвола: изолированная маржа активна, просадка 24ч -1.43% (Лимит > -5.00%)' },
  { module: 'CORE_IPC', level: 'INFO', message: 'Процесс 1 (vCPU 0) -> Процесс 2: сброс слота ShmRingBuffer (4096 байт zero-copy)' },
  { module: 'INGESTOR', level: 'INFO', message: 'Динамический 5-мин скринер: отобрано 40 ликвидных пар (Оборот $3.8 млрд, ATR 3.4%)' },
  { module: 'TELEGRAM', level: 'INFO', message: 'Telethon Read-Only: опрос 3 каналов. Кэш сообщений синхронизирован, 0 фейк-правок' },
  { module: 'ARENA', level: 'INFO', message: 'Событийный инференс onnx_ppo_v2: закрытие 1с свечи -> УДЕРЖАНИЕ (уверенность 0.82)' },
  { module: 'STORAGE', level: 'SUCCESS', message: 'Запись Parquet: 5-мин срез стакана сохранен в data/parquet/date=2026-10-31/ (ZSTD 1.2 МБ)' },
  { module: 'FIREWALL', level: 'INFO', message: 'Контроль фандинга: 42 мин до клиринга Bybit (прогноз ставки +0.0100%, в пределах нормы)' },
  { module: 'INGESTOR', level: 'INFO', message: 'Резервные контуры OKX и MEXC: пинг в норме (OKX 36мс, MEXC 31мс)' },
  { module: 'ARENA', level: 'INFO', message: 'Ночной планировщик LightGBM: ожидание низкоприоритетного окна (nice -n 19, 1 поток)' },
  { module: 'CORE_IPC', level: 'SUCCESS', message: 'Синхронизация часов NTP с сервером Bybit: смещение -2.8мс' },
  { module: 'TELEGRAM', level: 'INFO', message: 'Этап 1 Regex-фильтр: проверено 14 постов Telegram, 12 отсеяно как шум/реклама (экономия 85%)' },
];

export const SystemTelemetryFeed: React.FC = () => {
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize and stream real-time events
  useEffect(() => {
    // Initial logs
    const now = new Date();
    const initial: TelemetryLog[] = SAMPLE_EVENTS.slice(0, 5).map((e, idx) => ({
      ...e,
      id: `log-init-${idx}`,
      timestamp: new Date(now.getTime() - (5 - idx) * 3000).toLocaleTimeString(),
    }));
    setLogs(initial);

    // Live event interval every 2.5s
    const timer = setInterval(() => {
      if (isPaused) return;

      const randomEvent = SAMPLE_EVENTS[Math.floor(Math.random() * SAMPLE_EVENTS.length)];
      const newLog: TelemetryLog = {
        ...randomEvent,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
      };

      setLogs((prev) => [...prev.slice(-80), newLog]);
    }, 2400);

    return () => clearInterval(timer);
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused && logsEndRef.current && isExpanded) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused, isExpanded]);

  const filteredLogs = logs.filter((l) => (filter === 'ALL' ? true : l.module === filter));
  const latestLog = logs[logs.length - 1];

  return (
    <div className="fixed bottom-9 right-4 z-40 max-w-lg w-full transition-all">
      {/* Compact Banner / Toggle Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-slate-900/95 border border-cyan-500/40 rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur-md cursor-pointer hover:border-cyan-400 flex items-center justify-between gap-3 text-xs font-mono"
      >
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="font-extrabold text-cyan-300 flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5" />
            ТЕЛЕМЕТРИЯ:
          </span>
          <span className="text-slate-300 truncate text-[11px]">
            {latestLog ? `[${latestLog.module}] ${latestLog.message}` : 'Подключение к процессам Node A...'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {logs.length} сообщ.
          </span>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-cyan-400" />}
        </div>
      </div>

      {/* Expanded Console Window */}
      {isExpanded && (
        <div className="mt-2 bg-slate-950/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-80 backdrop-blur-lg animate-fade-in">
          {/* Controls Bar */}
          <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-2 text-[11px] font-mono">
            {/* Filter pills */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {['ALL', 'INGESTOR', 'FIREWALL', 'TELEGRAM', 'ARENA', 'CORE_IPC'].map((cat) => (
                <button
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilter(cat);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] transition ${
                    filter === cat ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat === 'ALL' ? 'ВСЕ' : cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused(!isPaused);
                }}
                title={isPaused ? 'Возобновить поток' : 'Приостановить'}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                {isPaused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLogs([]);
                }}
                title="Очистить лог"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Log Stream */}
          <div className="flex-1 p-3 overflow-y-auto space-y-1.5 font-mono text-[11px] scrollbar-thin">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 hover:bg-slate-900/50 px-1.5 py-0.5 rounded transition"
              >
                <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{log.timestamp}</span>
                <span
                  className={`px-1 rounded text-[9px] font-bold border flex-shrink-0 mt-0.5 ${
                    MODULE_COLORS[log.module]
                  }`}
                >
                  {log.module}
                </span>
                <span
                  className={`leading-relaxed break-words ${
                    log.level === 'SUCCESS' ? 'text-emerald-300' : log.level === 'WARN' ? 'text-amber-300' : 'text-slate-300'
                  }`}
                >
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};
