import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
  Sliders,
} from 'lucide-react';
import type { SystemHealth } from '../types.ts';

interface BeginnerGuideBannerProps {
  activeTab: string;
  health: SystemHealth | null;
  isBeginnerMode: boolean;
  onToggleBeginnerMode: () => void;
  onSelectTab: (tab: string) => void;
  onRefreshHealth: () => void;
}

interface SimplePreset {
  id: 'SAFE' | 'BALANCED' | 'ACTIVE';
  title: string;
  tag: string;
  subtitle: string;
  riskPerTradePct: number;
  leverage: number;
  tpSlRatio: number;
  confidenceThreshold: number;
  atrMultiplier: number;
}

const SIMPLE_PRESETS: SimplePreset[] = [
  {
    id: 'SAFE',
    title: 'Консервативный',
    tag: 'Риск 0.8% · 5x',
    subtitle: 'Минимальный риск и редкие, максимально выверенные входы',
    riskPerTradePct: 0.8,
    leverage: 5,
    tpSlRatio: 2.0,
    confidenceThreshold: 0.28,
    atrMultiplier: 1.65,
  },
  {
    id: 'BALANCED',
    title: 'Сбалансированный',
    tag: 'Риск 1.5% · 10x',
    subtitle: 'Оптимальный баланс доходности и защиты капитала',
    riskPerTradePct: 1.5,
    leverage: 10,
    tpSlRatio: 1.8,
    confidenceThreshold: 0.21,
    atrMultiplier: 1.45,
  },
  {
    id: 'ACTIVE',
    title: 'Динамичный',
    tag: 'Риск 2.2% · 12x',
    subtitle: 'Больше сделок на импульсах рынка с коротким стопом',
    riskPerTradePct: 2.2,
    leverage: 12,
    tpSlRatio: 1.6,
    confidenceThreshold: 0.16,
    atrMultiplier: 1.3,
  },
];

const TAB_EXPLANATIONS: Record<string, { title: string; summary: string }> = {
  terminal: {
    title: 'Торговый терминал',
    summary: 'Выберите монету, следите за балансом спроса L2 OBI или откройте сделку с авто-стопом.',
  },
  wallet: {
    title: 'Портфель и Риск-Монитор',
    summary: 'Контроль чистой прибыли, кривой капитала и защитных барьеров счета в реальном времени.',
  },
  arena: {
    title: 'ИИ-Арена и RL-Обучение',
    summary: 'Сравнивайте стратегии на графике A vs B и обучайте нейро-ботов на свечах Bybit.',
  },
  firewall: {
    title: 'Риск-Контроль',
    summary: 'Автоматический предохранитель: лимит риска 1.5% на сделку и 5.0% на день.',
  },
  intelligence: {
    title: 'Сигналы Telegram',
    summary: 'Фильтрация рыночных сигналов и оценка новостного фона с помощью ИИ.',
  },
  topology: {
    title: 'Топология сети',
    summary: 'Мониторинг задержки (пинга) до серверов Bybit и вычислительных узлов.',
  },
  settings: {
    title: 'Ключи API',
    summary: 'Настройка доступа к реальному аккаунту Bybit (для учебного режима не требуется).',
  },
  updates: {
    title: 'Система и Бэкапы',
    summary: 'Управление снапшотами состояния и целостностью модулей.',
  },
  explorer: {
    title: 'Код и Архитектура',
    summary: 'Документация алгоритмов и математического ядра.',
  },
};

const SIMPLE_GLOSSARY = [
  {
    term: 'L2 OBI (Дисбаланс стакана)',
    simple: 'Перевес покупателей (выше +12%) или продавцов (ниже -12%) в очереди заявок биржи.',
  },
  {
    term: 'ATR Стоп-Лосс',
    simple: 'Умная страховка сделки, которая автоматически учитывает текущую волатильность цены.',
  },
  {
    term: 'VWAP (Средняя цена)',
    simple: 'Справедливая цена монеты за сессию с учетом объемов. Помогает не покупать на пике.',
  },
  {
    term: 'Спред (Spread bps)',
    simple: 'Разница между лучшей ценой покупки и продажи. Узкий спред (<10 bps) экономит деньги при входе.',
  },
  {
    term: 'Sharpe Ratio (Стабильность)',
    simple: 'Показывает плавность заработка бота: чем выше (>1.5), тем меньше нервов и просадок.',
  },
  {
    term: 'Profit Factor (Окупаемость)',
    simple: 'Во сколько раз общая сумма прибыли превышает сумму убытков (норма > 1.30).',
  },
];

export const BeginnerGuideBanner: React.FC<BeginnerGuideBannerProps> = ({
  activeTab,
  health,
  isBeginnerMode,
  onToggleBeginnerMode,
  onRefreshHealth,
}) => {
  const [optimisticPreset, setOptimisticPreset] = useState<'SAFE' | 'BALANCED' | 'ACTIVE' | null>(null);
  const [applyingPreset, setApplyingPreset] = useState<boolean>(false);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState<boolean>(false);

  const backendProfile = health?.activeBotProfile;
  const activePresetId: 'SAFE' | 'BALANCED' | 'ACTIVE' | 'CUSTOM' =
    optimisticPreset ?? backendProfile?.id ?? 'BALANCED';

  const tabInfo = TAB_EXPLANATIONS[activeTab] || TAB_EXPLANATIONS.terminal;

  const handleApplySimplePreset = async (preset: SimplePreset) => {
    setApplyingPreset(true);
    setPresetFeedback(null);
    setOptimisticPreset(preset.id);

    const botIds = ['agent-onnx-ppo-v2', 'agent-lgbm-nightly', 'agent-tg-crypto-alpha'];
    try {
      await Promise.all(
        botIds.map((agentId) =>
          fetch('/api/bots/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId,
              isEnabled: true,
              riskPerTradePct: preset.riskPerTradePct,
              leverage: preset.leverage,
              tpSlRatio: preset.tpSlRatio,
              confidenceThreshold: preset.confidenceThreshold,
              atrMultiplier: preset.atrMultiplier,
            }),
          })
        )
      );
      setPresetFeedback(`Режим «${preset.title} (${preset.tag})» активирован`);
      await onRefreshHealth();
      setOptimisticPreset(null);
      setTimeout(() => setPresetFeedback(null), 4000);
    } catch (err) {
      console.error('Failed to apply preset:', err);
      setOptimisticPreset(null);
    } finally {
      setApplyingPreset(false);
    }
  };

  return (
    <div className="w-full bg-[#0B0F1A]/95 border-b border-white/[0.08] px-3 sm:px-4 py-2">
      <div className="max-w-[1600px] mx-auto space-y-2">
        {/* Always-Visible Active Bot Mode Bar + Optional Contextual Hint */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          {/* Left: Active Mode Status & Contextual Hint */}
          {isBeginnerMode ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs min-w-0">
              <span className="font-semibold text-white shrink-0">{tabInfo.title}</span>
              <span className="hidden sm:inline text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-400 leading-snug">{tabInfo.summary}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Активный профиль ИИ-ботов:
              </span>
              <span className="font-semibold text-white">
                {backendProfile?.label || 'Сбалансированный'}
              </span>
              <span className="font-mono text-[11px] text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded border border-white/10">
                Риск {backendProfile?.riskPerTradePct ?? 1.5}% · Плечо {backendProfile?.leverage ?? 10}x
              </span>
            </div>
          )}

          {/* Right: Always-Visible 1-Click Bot Profile Switcher with Strong Active Highlight */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 w-full xl:w-auto">
            <div className="grid grid-cols-3 sm:flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/[0.1] w-full sm:w-auto shadow-inner">
              <span className="hidden md:flex text-[11px] font-medium text-slate-300 px-2 items-center gap-1.5 shrink-0">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Режим ИИ:</span>
              </span>
              {SIMPLE_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={applyingPreset}
                    onClick={() => handleApplySimplePreset(preset)}
                    title={`${preset.subtitle} (${preset.tag})`}
                    aria-pressed={isSelected}
                    className={`relative px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-500/30 via-sky-500/25 to-blue-600/30 text-white font-bold border-2 border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.3)] ring-1 ring-cyan-300/40'
                        : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-white/[0.05]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {isSelected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                      )}
                      <span className="truncate">{preset.title}</span>
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                        isSelected
                          ? 'bg-cyan-400/25 text-cyan-200 border border-cyan-300/40 font-semibold'
                          : 'bg-slate-950/70 text-slate-500'
                      }`}
                    >
                      {preset.riskPerTradePct}% · {preset.leverage}x
                    </span>
                    {isSelected && (
                      <span className="hidden lg:inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/25 text-emerald-300 border border-emerald-400/40">
                        Активен
                      </span>
                    )}
                  </button>
                );
              })}

              {activePresetId === 'CUSTOM' && backendProfile && (
                <div className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-200 border-2 border-amber-400/80 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Свой ({backendProfile.riskPerTradePct}% · {backendProfile.leverage}x)</span>
                </div>
              )}
            </div>

            {presetFeedback && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{presetFeedback}</span>
              </span>
            )}

            {isBeginnerMode && (
              <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                <button
                  type="button"
                  onClick={() => setShowGlossary(!showGlossary)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                    showGlossary
                      ? 'bg-slate-800 text-white border-white/15'
                      : 'bg-slate-950/80 text-slate-300 border-white/[0.07] hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Шпаргалка</span>
                  {showGlossary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                <button
                  type="button"
                  onClick={onToggleBeginnerMode}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition"
                  title="Свернуть подсказки (панель режимов останется видимой)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Minimalist Glossary */}
        {isBeginnerMode && showGlossary && (
          <div className="pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {SIMPLE_GLOSSARY.map((item) => (
              <div
                key={item.term}
                className="bg-slate-950/70 border border-white/[0.05] rounded-lg p-2.5 text-xs"
              >
                <div className="font-semibold text-cyan-300 mb-0.5">{item.term}</div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{item.simple}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

