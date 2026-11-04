import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquareText,
  Send,
  Sparkles,
  Bot,
  User,
  TrendingUp,
  ShieldCheck,
  Zap,
  Server,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Cpu,
  PieChart,
  ChevronRight,
  ExternalLink,
  Layers,
  Activity,
  Radio,
  FileCode,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { AiChatMessage, AiQuickPrompt, SystemHealth } from '../types.ts';

interface AiChatViewProps {
  health?: SystemHealth | null;
  isOverlay?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const AiChatView: React.FC<AiChatViewProps> = ({
  health,
  isOverlay = false,
  isOpen = true,
  onClose,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: `👋 Приветствую! Я — **ZimaTrade AI Quantitative Analyst**.\n\nЯ подключен к реальному ядру торговой системы, живым котировкам Bybit v5 и текущему состоянию портфеля.\n\n**Что я умею:**\n• 📊 **Количественный аудит**: анализ открытых позиций, риск-менеджмента, маржи и PnL.\n• 🔥 **Скринер трендов Bybit**: поиск горячих монет, импульсов и аномалий фандинга.\n• 🤖 **Диагностика ИИ-ботов**: разбор текущих весов ONNX RL, LightGBM и LLM Sentiment.\n• 🛡️ **Проверка Риск-Файрвола**: стресс-тест просадки, проверка Kill-Switch и расчет лота.\n• 🚀 **Инструкции по эксплуатации**: запуск на Cloud.ru, Docker, Bybit API и локальное обучение.\n\nНажмите любую кнопку быстрого сценария выше или введите свой вопрос!`,
      timestamp: Date.now(),
      metadata: {
        model: 'gemini-3.8-flash',
        contextIncluded: true,
        suggestedFollowUps: [
          'Проведи полный аудит текущего портфеля и открытых сделок',
          'Какие монеты сейчас показывают максимальный тренд на Bybit?',
          'Как у ботов распределены веса признаков OBI и Momentum?',
          'Пошаговая инструкция по деплою на Cloud.ru',
        ],
      },
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<AiQuickPrompt[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch quick prompts on mount
  useEffect(() => {
    fetch('/api/ai/quick-prompts')
      .then((res) => res.json())
      .then((data) => {
        if (data?.prompts) setQuickPrompts(data.prompts);
      })
      .catch((err) => console.warn('Failed to load quick prompts:', err));
  }, []);

  // Keyboard shortcut: close on Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOverlay && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlay, onClose]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  if (isOverlay && !isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMessage: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const historyToSend = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyToSend,
          contextIncluded: includeContext,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data?.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch (err: any) {
      const errorMsg: AiChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Произошла временная задержка при обращении к квант-модели (${err.message || 'Сетевая ошибка'}). Попробуйте повторить запрос через несколько секунд.`,
        timestamp: Date.now(),
        metadata: {
          model: 'fallback-handler',
        },
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'История очищена. Я готов к новому анализу торговой системы и рынка Bybit!',
        timestamp: Date.now(),
        metadata: { model: 'gemini-3.8-flash' },
      },
    ]);
  };

  // Helper to render formatted markdown
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Code blocks
      if (line.startsWith('```')) {
        return (
          <div key={idx} className="my-1.5 font-mono text-[11px] text-cyan-300 bg-slate-950/80 p-2.5 rounded-lg border border-cyan-500/20 overflow-x-auto">
            {line.replace(/```[a-z]*/g, '')}
          </div>
        );
      }

      // Headers
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-xs font-bold text-white mt-2.5 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('## ') || (line.startsWith('**') && line.endsWith('**') && line.length < 60)) {
        return (
          <h3 key={idx} className="text-xs sm:text-sm font-bold text-slate-100 mt-2.5 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            {line.replace(/^##\s+/, '').replace(/\*\*/g, '')}
          </h3>
        );
      }

      // Bullet items
      if (line.startsWith('• ') || line.startsWith('- ')) {
        const rawText = line.slice(2);
        const parts = rawText.split('**');
        return (
          <div key={idx} className="flex items-start gap-2 my-1 text-xs text-slate-200 leading-relaxed">
            <span className="text-cyan-400 font-bold shrink-0 mt-0.5">•</span>
            <div>
              {parts.map((p, pIdx) =>
                pIdx % 2 === 1 ? (
                  <strong key={pIdx} className="font-semibold text-white">
                    {p}
                  </strong>
                ) : (
                  <span key={pIdx}>{p}</span>
                )
              )}
            </div>
          </div>
        );
      }

      // Numbered lists
      if (/^\d+\.\s/.test(line)) {
        const match = line.match(/^(\d+\.)\s(.*)$/);
        if (match) {
          const num = match[1];
          const text = match[2];
          return (
            <div key={idx} className="flex items-start gap-2 my-1 text-xs text-slate-200 leading-relaxed">
              <span className="text-cyan-400 font-mono font-bold shrink-0">{num}</span>
              <span>{text}</span>
            </div>
          );
        }
      }

      // Empty lines
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }

      // Regular line with bold formatting
      const parts = line.split('**');
      return (
        <p key={idx} className="text-xs text-slate-200 leading-relaxed my-0.5">
          {parts.map((p, pIdx) =>
            pIdx % 2 === 1 ? (
              <strong key={pIdx} className="font-semibold text-white">
                {p}
              </strong>
            ) : (
              <span key={pIdx}>{p}</span>
            )
          )}
        </p>
      );
    });
  };

  const walletBalance = (health?.capitalUsdt ?? 10000) + (health?.totalRealizedPnlUsdt ?? 381.79);

  // Content block containing header, quick chips, messages, and input
  const chatContent = (
    <div className="flex flex-col h-full w-full bg-[#0C111D] text-slate-100 overflow-hidden select-text">
      {/* 1. Modal Top Bar */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-[#090D17] border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600/30 via-cyan-500/20 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-white truncate">
                ИИ-Аналитик ZimaTrade
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Gemini 3.8 Flash
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span>Капитал: ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>·</span>
              <span className={(health?.rolling24hPnlUsdt ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                24h: {(health?.rolling24hPnlUsdt ?? 0) >= 0 ? '+' : ''}${(health?.rolling24hPnlUsdt ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowContextPreview((prev) => !prev)}
            className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg text-[11px] font-medium transition flex items-center gap-1 border ${
              showContextPreview
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
                : 'bg-slate-900/80 text-slate-400 border-white/[0.07] hover:text-white'
            }`}
            title="Показать текущие метрики системы, передаваемые ИИ"
          >
            <Layers className="w-3 h-3 text-cyan-400" />
            <span className="hidden sm:inline">Контекст</span>
          </button>

          <button
            type="button"
            onClick={handleClearHistory}
            className="p-1 sm:p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-white/[0.07] transition"
            title="Очистить историю сообщений"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {isOverlay && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="hidden sm:flex p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/[0.07] transition"
              title={isExpanded ? 'Уменьшить окно' : 'Развернуть на весь экран'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {isOverlay && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 sm:p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 transition"
              title="Закрыть чат (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Optional Collapsible Context Snapshot */}
      {showContextPreview && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/[0.07] bg-slate-950/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] sm:text-[11px] font-mono text-slate-300 shrink-0">
          <div>
            <span className="text-cyan-400 block font-semibold">Баланс:</span>
            <span>${walletBalance.toFixed(2)} USDT</span>
          </div>
          <div>
            <span className="text-emerald-400 block font-semibold">Просадка дня:</span>
            <span>{health?.drawdownPct?.toFixed(2) ?? '0.00'}% (Лимит -3.5%)</span>
          </div>
          <div>
            <span className="text-violet-400 block font-semibold">Боты:</span>
            <span>ONNX RL, LightGBM, LLM</span>
          </div>
          <div>
            <span className="text-blue-400 block font-semibold">Bybit RTT:</span>
            <span>{health?.pings.bybit ?? 24}ms</span>
          </div>
        </div>
      )}

      {/* 3. Horizontal Sleek Quick-Prompts Pill Bar (Front-and-center, NOT pushing chat away) */}
      <div className="px-2.5 sm:px-4 py-1.5 bg-[#090E1A] border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1 shrink-0 pl-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span className="hidden sm:inline">Быстро:</span>
        </span>

        {quickPrompts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSendMessage(p.prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-900/90 hover:bg-cyan-500/15 text-slate-300 hover:text-cyan-200 border border-white/[0.08] hover:border-cyan-400/40 transition whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
          >
            <span>{p.title}</span>
          </button>
        ))}
      </div>

      {/* 4. Main Chat Messages Stream (Takes all remaining vertical space!) */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 scrollbar-thin">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                    : 'bg-gradient-to-br from-violet-600/30 to-blue-600/30 text-violet-300 border border-violet-400/30'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[90%] sm:max-w-[85%] rounded-xl p-3 sm:p-4 text-xs ${
                  isUser
                    ? 'bg-cyan-950/40 border border-cyan-500/30 text-slate-100 shadow-sm'
                    : 'bg-slate-900/95 border border-white/[0.08] text-slate-200 shadow-md'
                }`}
              >
                {/* Role & Timestamp Bar */}
                <div className="flex items-center justify-between gap-3 mb-1.5 pb-1 border-b border-white/[0.05] text-[10px] font-mono text-slate-400">
                  <span className="font-semibold text-slate-300">
                    {isUser ? 'Вы' : 'ZimaTrade AI Analyst'}
                  </span>
                  <div className="flex items-center gap-2">
                    {msg.metadata?.model && (
                      <span className="text-cyan-400 hidden sm:inline">
                        {msg.metadata.model}
                      </span>
                    )}
                    {msg.metadata?.latencyMs !== undefined && (
                      <span className="hidden sm:inline">{msg.metadata.latencyMs}ms</span>
                    )}
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="text-slate-500 hover:text-white transition ml-1"
                        title="Скопировать ответ"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-1">
                  {renderFormattedContent(msg.content)}
                </div>

                {/* Suggested Follow-ups */}
                {msg.metadata?.suggestedFollowUps && msg.metadata.suggestedFollowUps.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/[0.06] space-y-1.5">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                      Рекомендуемые вопросы:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.metadata.suggestedFollowUps.map((fu, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() => handleSendMessage(fu)}
                          disabled={isLoading}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-cyan-500/15 text-slate-300 hover:text-cyan-200 border border-white/[0.06] hover:border-cyan-500/30 transition text-left"
                        >
                          {fu}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-600/20 border border-violet-400/30 flex items-center justify-center text-violet-300 shrink-0">
              <Bot className="w-3.5 h-3.5 animate-bounce" />
            </div>
            <div className="bg-slate-900/90 border border-white/[0.08] rounded-xl p-3 text-xs text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>Анализирую живой стакан Bybit L2 и генерирую ответ...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 5. Bottom Interactive Input Console */}
      <div className="p-2.5 sm:p-3 bg-[#080C15] border-t border-white/[0.08] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="space-y-1.5"
        >
          <div className="relative flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Спросите о портфеле, трендах Bybit, ботах или архитектуре..."
              rows={2}
              className="flex-1 bg-slate-950/90 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40 resize-none scrollbar-thin transition font-sans"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-1.5 shrink-0 ${
                !input.trim() || isLoading
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 active:scale-95'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Отправить</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 px-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-cyan-400 focus:ring-cyan-500/30"
              />
              <span className="truncate">Живой контекст Bybit L2 включен</span>
            </label>

            <span className="hidden sm:inline text-slate-500 text-[10px]">
              Enter — отправить, Shift+Enter — перенос
            </span>
          </div>
        </form>
      </div>
    </div>
  );

  // If rendered as overlay / modal:
  if (isOverlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200">
        {/* Backdrop click to dismiss */}
        <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

        {/* Modal Window Container */}
        <div
          className={`relative z-10 w-full ${
            isExpanded
              ? 'sm:max-w-[95vw] h-[95vh]'
              : 'sm:max-w-3xl lg:max-w-4xl h-[92vh] sm:h-[86vh]'
          } rounded-t-2xl sm:rounded-2xl border border-white/[0.12] shadow-2xl flex flex-col overflow-hidden bg-[#0C111D] animate-in slide-in-from-bottom-4 duration-250`}
        >
          {/* Mobile Drag Indicator */}
          <div className="w-12 h-1 bg-slate-700/80 rounded-full mx-auto my-1.5 sm:hidden shrink-0" />
          {chatContent}
        </div>
      </div>
    );
  }

  // Standalone tab view:
  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-3 h-[calc(100vh-140px)] min-h-[580px]">
      <div className="h-full rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden">
        {chatContent}
      </div>
    </div>
  );
};
