import React from 'react';
import {
  Server,
  Cpu,
  Database,
  Cloud,
  Shield,
  Radio,
  ArrowRight,
  Wifi,
  HardDrive,
  Activity,
  CheckCircle2,
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
              <h2 className="text-base font-extrabold text-white">Распределенная топология инфраструктуры из 5 узлов</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                АКТИВНАЯ СЕТЬ
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Многоуровневая архитектура, разделяющая боевое ядро реального времени (Node A), GPU-обучение (Node B), облачный NLP и память (Node C/D) и внешний контур безопасности (Node E).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            Туннель: <strong className="text-emerald-400">WireGuard & cloudflared</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            DCP: <strong className="text-cyan-400">Авто-отмена ордеров при обрыве &gt; 10с</strong>
          </span>
        </div>
      </div>

      {/* The 5 Node Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Node A */}
        <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Node A: web-app-prod (Cloud.ru 24/7)</h3>
                <span className="text-[10px] font-mono text-cyan-400">
                  Зона ru.AZ-1 • 194.113.34.230 / 10.0.0.5 • Ubuntu 24.04
                </span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Процесс 1 (привязан к vCPU 0):
              </span>
              <p className="text-[11px] text-slate-400">
                Прием WebSocket, сборка стаканов L2-50 в SharedMemory, Виртуальный движок (Режим 1), Боевой роутер, быстрый инференс onnxruntime на CPU.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Процесс 2 (привязан к vCPU 1):
              </span>
              <p className="text-[11px] text-slate-400">
                База SQLite WAL, кольцевой буфер Parquet (квота 10 ГБ), Telethon UserBot, аналитика DuckDB (лимит 768 МБ), FastAPI и ночной LightGBM.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>2 vCPU (1:10) • 4 ГБ ОЗУ (2 ГБ Heap) • 30 ГБ SSD</span>
            <span className="text-emerald-400 font-bold">100% SLA</span>
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
                <h3 className="font-bold text-sm text-white">Node B: Кузница ИИ (Спящий узел)</h3>
                <span className="text-[10px] font-mono text-purple-400">Домашняя GPU-станция</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
              ПО РАСПИСАНИЮ (30-60 мин/день)
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-amber-400 font-bold block mb-1">
                Аппаратные характеристики:
              </span>
              <p className="text-[11px] text-slate-400">
                AMD Ryzen 5 5600X (6C/12T), 32 ГБ ОЗУ, видеокарта NVIDIA 8 ГБ VRAM.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Автоматический цикл обучения:
              </span>
              <p className="text-[11px] text-slate-400">
                Скачивает архивы Parquet по WireGuard (<code className="text-cyan-300">bwlimit=5MB/s, ionice -c 3</code>), обучает PyTorch PPO/SAC и LSTM, выгружает веса .onnx с манифестом SHA256.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Сеть: WireGuard / Tailscale</span>
            <span className="text-purple-400 font-bold">Режим ожидания</span>
          </div>
        </div>

        {/* Node C */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-950 text-amber-400 flex items-center justify-center">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Node C: Пул Cloud Ollama</h3>
                <span className="text-[10px] font-mono text-amber-400">Мульти-аккаунт ротация</span>
              </div>
            </div>
            {health?.nodes?.nodeC?.status === 'READY' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Ollama Cloud активен" />
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950 text-amber-400 border border-amber-800/40">
                НЕТ КЛЮЧА
              </span>
            )}
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Уровень 1: Быстрый NLP-парсер (20b / 30b):
              </span>
              <p className="text-[11px] text-slate-400">
                Модели gpt-oss:20b / nemotron-3-nano:30b переводят отфильтрованные сигналы Telegram в строгий Pydantic JSON за &lt;500 мс.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-amber-400 font-bold block mb-1">
                Уровень 2: Макро-Аналитика (120b / ultra):
              </span>
              <p className="text-[11px] text-slate-400">
                Модели gpt-oss:120b / nemotron-3-ultra анализируют макро-новости, сентимент и корректируют глобальные веса стратегий.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Отказоустойчивость: Ротация при HTTP 429</span>
            <span className={health?.nodes?.nodeC?.status === 'READY' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {health?.nodes?.nodeC?.status === 'READY' ? 'Активный пул' : 'Не настроен (требуется ключ)'}
            </span>
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
                <h3 className="font-bold text-sm text-white">Node D: Семантическая память (RAG)</h3>
                <span className="text-[10px] font-mono text-cyan-400">Ollama Cloud API</span>
              </div>
            </div>
            {health?.nodes?.nodeD?.status === 'ACTIVE' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Семантическая память активна" />
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950 text-amber-400 border border-amber-800/40">
                ОЖИДАНИЕ КЛЮЧА
              </span>
            )}
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-cyan-400 font-bold block mb-1">
                Векторные эмбеддинги (bge-m3):
              </span>
              <p className="text-[11px] text-slate-400">
                Генерация 1024-мерных векторов через <code className="text-cyan-300">bge-m3</code> в Ollama Cloud для разбора сделок и кластеризации каналов.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-purple-400 font-bold block mb-1">
                Локальный индекс DuckDB VSS:
              </span>
              <p className="text-[11px] text-slate-400">
                Локальный векторный поиск HNSW для мгновенного нахождения исторических прецедентов без сетевых задержек внешних БД.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Модели: bge-m3 + gpt-oss:20b / 120b</span>
            <span className={health?.nodes?.nodeD?.status === 'ACTIVE' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {health?.nodes?.nodeD?.status === 'ACTIVE' ? 'Память активна' : 'Ожидание ключа'}
            </span>
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
                <h3 className="font-bold text-sm text-white">Node E: Внешний Щит Cloudflare</h3>
                <span className="text-[10px] font-mono text-rose-400">Zero-Trust и Dead-Man&apos;s Switch</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300 my-4">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-rose-400 font-bold block mb-1">
                Dead-Man&apos;s Switch (Cron каждую 1 мин):
              </span>
              <p className="text-[11px] text-slate-400">
                Cloudflare Worker пингует /health на Node A каждые 60с. Если цикл vCPU 0 завис &gt; 5с, шлет экстренный алерт в Telegram и отменяет ордера Bybit.
              </p>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-amber-400 font-bold block mb-1">
                Безопасный доступ Zero-Trust:
              </span>
              <p className="text-[11px] text-slate-400">
                Шифрованный туннель Cloudflare (<code className="text-cyan-300">cloudflared</code>) для управления со смартфона без открытия портов на сервере.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <span>Сбоев подряд: 0</span>
            <span className="text-emerald-400 font-bold">Защита активна</span>
          </div>
        </div>
      </div>
    </div>
  );
};
