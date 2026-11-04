import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Zap,
  Flame,
  Radio,
  Server,
  RefreshCw,
  Key,
  BookOpen,
  Wallet,
  Sparkles,
  Power,
  Bot,
  Lock,
} from 'lucide-react';
import { MetricTooltip } from './MetricTooltip.tsx';
import type { SystemHealth, ExecutionMode } from '../types.ts';

interface HeaderProps {
  health: SystemHealth | null;
  onModeChange: (mode: ExecutionMode) => void;
  onKillSwitchTrigger: () => void;
  onKillSwitchReset: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenGuide: () => void;
  isBeginnerMode?: boolean;
  onToggleBeginnerMode?: () => void;
  onOpenAiChat?: () => void;
  operatorUsername?: string;
  onOpenAuthSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  onModeChange,
  onKillSwitchTrigger,
  onKillSwitchReset,
  activeTab,
  onSelectTab,
  onOpenGuide,
  isBeginnerMode = true,
  onToggleBeginnerMode,
  onOpenAiChat,
  operatorUsername,
  onOpenAuthSettings,
}) => {
  const isKillSwitch = health?.isKillSwitchActive ?? false;
  const currentMode = health?.mode ?? 'SHADOW';
  const drawdown = health?.drawdownPct ?? -1.42;
  const walletBalance = (health?.capitalUsdt ?? 10000) + (health?.totalRealizedPnlUsdt ?? 381.79);

  const tabs = [
    {
      id: 'terminal',
      label: 'Терминал',
      icon: Activity,
      hint: 'График, стакан заявок Bybit и открытие сделок',
    },
    {
      id: 'wallet',
      label: 'Портфель',
      icon: Wallet,
      hint: 'Баланс, кривая капитала, PnL и контроль рисков',
    },
    {
      id: 'arena',
      label: 'ИИ-Арена',
      icon: Zap,
      hint: 'Управление 3 нейро-ботами, RL-обучение и сравнение стратегий',
    },
    {
      id: 'aichat',
      label: 'ИИ-Аналитик',
      icon: Bot,
      badge: 'AI',
      hint: 'Чат-аналитик: аудит портфеля, сканер трендов Bybit и ответы о системе',
    },
    {
      id: 'firewall',
      label: 'Риск-Контроль',
      icon: isKillSwitch ? ShieldAlert : ShieldCheck,
      hint: 'Защитные лимиты просадки и безопасности счета',
    },
    {
      id: 'intelligence',
      label: 'Сигналы TG',
      icon: Radio,
      hint: 'Анализ и фильтрация сигналов из Telegram-каналов',
    },
    {
      id: 'topology',
      label: 'Сеть',
      icon: Server,
      hint: 'Состояние узлов и задержка до биржи Bybit',
    },
    {
      id: 'settings',
      label: 'ТГ-Бот & API',
      icon: Key,
      hint: 'Уведомления в Telegram (@zimatradeai_bot) и ключи API Bybit',
    },
    {
      id: 'updates',
      label: 'Система',
      icon: RefreshCw,
      hint: 'Резервные копии и версии модулей',
    },
    {
      id: 'explorer',
      label: 'Код',
      icon: Flame,
      hint: 'Исходная архитектура и формулы',
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#070A12]/90 backdrop-blur-xl border-b border-white/[0.07]">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4">
        {/* Top Row: Minimalist Brand, Segmented Account Mode, Balance & Safety Controls */}
        <div className="min-h-14 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-sm sm:text-[15px] text-white whitespace-nowrap">
                ZimaTrade <span className="text-cyan-400 font-semibold">AI</span>
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Bybit {health?.pings.bybit ?? 24}ms
              </span>
            </div>
          </div>

          {/* Center: Strongly Highlighted Account Mode Switcher + Active Bot Profile Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/[0.1] shrink-0 shadow-inner">
              <button
                type="button"
                onClick={() => onModeChange('SHADOW')}
                aria-pressed={currentMode === 'SHADOW'}
                title="Безопасная торговля на виртуальные $10,000 по реальным котировкам Bybit"
                className={`px-2.5 sm:px-3.5 py-1 rounded-lg text-[11px] sm:text-xs transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  currentMode === 'SHADOW'
                    ? 'bg-gradient-to-r from-cyan-500/30 to-blue-600/30 text-white font-bold border-2 border-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.28)]'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent opacity-75 hover:opacity-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${currentMode === 'SHADOW' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="sm:hidden">Учебный</span>
                <span className="hidden sm:inline">Учебный счет</span>
                <span className={`hidden md:inline text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  currentMode === 'SHADOW' ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-300/30' : 'text-slate-500'
                }`}>
                  $10k
                </span>
                {currentMode === 'SHADOW' && (
                  <span className="hidden xl:inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/25 text-emerald-300 border border-emerald-400/40">
                    Активен
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onModeChange('LIVE')}
                disabled={isKillSwitch}
                aria-pressed={currentMode === 'LIVE'}
                title="Торговля реальными средствами через API Bybit"
                className={`px-2.5 sm:px-3.5 py-1 rounded-lg text-[11px] sm:text-xs transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isKillSwitch
                    ? 'opacity-40 cursor-not-allowed text-slate-600 border border-transparent'
                    : currentMode === 'LIVE'
                    ? 'bg-gradient-to-r from-rose-500/35 to-orange-600/30 text-white font-bold border-2 border-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.35)]'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent opacity-75 hover:opacity-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${currentMode === 'LIVE' ? 'bg-rose-400 animate-ping' : 'bg-slate-600'}`} />
                <span className="sm:hidden">LIVE</span>
                <span className="hidden sm:inline">Реальный LIVE</span>
                {currentMode === 'LIVE' && (
                  <span className="hidden xl:inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/30 text-rose-200 border border-rose-400/50">
                    Активен
                  </span>
                )}
              </button>
            </div>

            {health?.activeBotProfile && (
              <button
                type="button"
                onClick={() => onSelectTab('arena')}
                title="Текущий активный профиль всех ИИ-ботов (нажмите для тонкой настройки в ИИ-Арене)"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/35 text-xs transition shrink-0"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-slate-300 font-medium">{health.activeBotProfile.label}</span>
                <span className="font-mono font-bold text-cyan-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-cyan-400/30 text-[11px]">
                  {health.activeBotProfile.riskPerTradePct}% · {health.activeBotProfile.leverage}x
                </span>
              </button>
            )}
          </div>

          {/* Right: Clean Metrics & Minimalist Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Balance & Drawdown inline */}
            <div className="hidden lg:flex items-center gap-3 text-xs font-mono tabular-nums pr-2 border-r border-white/[0.07]">
              <button
                type="button"
                onClick={() => onSelectTab('wallet')}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <span className="text-slate-500 font-sans">Баланс:</span>
                <span className="font-semibold text-white">
                  ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </button>

              <span className="text-slate-700" aria-hidden="true">·</span>

              <MetricTooltip metric="DAILY_DRAWDOWN" value={Math.abs(drawdown)} showIcon={false}>
                <span className="text-slate-400">
                  Риск дня:{' '}
                  <strong className={drawdown <= -4.0 ? 'text-rose-400' : 'text-emerald-400'}>
                    {drawdown >= 0 ? '0.0%' : `${drawdown.toFixed(2)}%`}
                  </strong>
                </span>
              </MetricTooltip>
            </div>

            {/* Quick AI Analyst Launcher */}
            <button
              type="button"
              onClick={() => (onOpenAiChat ? onOpenAiChat() : onSelectTab('aichat'))}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border ${
                activeTab === 'aichat'
                  ? 'bg-gradient-to-r from-cyan-500/25 to-blue-600/25 text-cyan-200 border-cyan-400/50 shadow-sm'
                  : 'bg-slate-900/80 text-slate-300 border-white/[0.07] hover:bg-slate-800 hover:text-white'
              }`}
              title="Открыть ИИ-Аналитик поверх текущего экрана: аудит портфеля и ответы на вопросы"
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">ИИ-Чат</span>
            </button>

            {/* Smart Assistant Toggle */}
            {onToggleBeginnerMode && (
              <button
                type="button"
                onClick={onToggleBeginnerMode}
                className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border ${
                  isBeginnerMode
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/15'
                    : 'bg-slate-900/80 text-slate-400 border-white/[0.07] hover:text-slate-200'
                }`}
                title="Показать или скрыть быстрые пресеты и подсказки"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Помощник</span>
              </button>
            )}

            {/* Guide Modal */}
            <button
              type="button"
              onClick={onOpenGuide}
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/[0.07] transition"
              title="Открыть краткую инструкцию по платформе"
            >
              <BookOpen className="w-4 h-4" />
            </button>

            {/* Operator Security & Auth Settings Button */}
            {onOpenAuthSettings && (
              <button
                type="button"
                onClick={onOpenAuthSettings}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-medium transition flex items-center gap-1.5"
                title="Безопасность, смена пароля/PIN-кода и блокировка терминала"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">{operatorUsername || 'admin'}</span>
              </button>
            )}

            {/* Kill-Switch Status / Emergency Stop */}
            {isKillSwitch ? (
              <button
                type="button"
                onClick={onKillSwitchReset}
                className="px-2 sm:px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-200 text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
                title="Снять аварийную блокировку и возобновить работу"
              >
                <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Разблокировать</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onKillSwitchTrigger}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900/90 hover:bg-rose-950/70 text-slate-400 hover:text-rose-300 border border-white/[0.07] hover:border-rose-500/40 text-xs font-medium transition flex items-center gap-1.5"
                title="Экстренно закрыть все сделки и поставить ботов на паузу"
              >
                <Power className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden md:inline">Стоп</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Sleek Minimalist Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none -mb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'aichat' && onOpenAiChat) {
                    onOpenAiChat();
                  } else {
                    onSelectTab(tab.id);
                  }
                }}
                title={tab.hint}
                className={`px-3 sm:px-3.5 py-2.5 text-xs font-medium transition-all flex items-center gap-1.5 sm:gap-2 border-b-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-cyan-400 text-white bg-white/[0.03]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.015]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {(tab as any).badge && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                    {(tab as any).badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
