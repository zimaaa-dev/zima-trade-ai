import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  Shield,
  Activity,
  Radio,
  Zap,
  Server,
  Key,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
}

const STEPS = [
  {
    id: 'intro',
    tab: 'terminal',
    title: '1. Концепция двух режимов на едином ядре',
    badge: 'Основа ZimaTrade AI',
    icon: Activity,
    content: (
      <div className="space-y-3 text-xs leading-relaxed text-slate-300">
        <p>
          В отличие от обычных ботов, в <strong className="text-white">ZimaTrade AI полностью запрещены синтетические бэктесты</strong> и стандартные демо-счета бирж, так как они создают иллюзию 90% прибыльности, игнорируя реальную биржевую микроструктуру.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px] mt-2">
          <div className="bg-slate-950 p-3 rounded-xl border border-cyan-500/30">
            <span className="text-cyan-400 font-bold block mb-1">MODE 1: SHADOW MODE</span>
            <span className="text-slate-400">
              Виртуальная торговля по <strong>живому стакану Bybit L2-50</strong> в реальном времени. Учитывает реальный сетевой пинг, очередь заявок и комиссии. Ключи биржи не требуются.
            </span>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/30">
            <span className="text-emerald-400 font-bold block mb-1">MODE 2: LIVE MODE</span>
            <span className="text-slate-400">
              Исполнение настоящих ордеров на Bybit через API под контролем неизменяемого процедурного риск-файрвола.
            </span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'l2-engine',
    tab: 'terminal',
    title: '2. Как работает L2-50 и VWAP-проскальзывание',
    badge: 'Биржевая микроструктура',
    icon: Activity,
    content: (
      <div className="space-y-3 text-xs leading-relaxed text-slate-300">
        <p>
          При отправке рыночного ордера движок рассчитывает исполнение не по идеальной цене Last Price, а с симуляцией реальной физической задержки:
        </p>
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-cyan-300 text-center font-bold">
          Время исполнения = t0 + RTT_live + 20ms
        </div>
        <ul className="space-y-1.5 list-disc list-inside text-slate-400 text-[11px]">
          <li>
            <strong className="text-slate-200">VWAP-проскальзывание:</strong> ордер выкупает доступные уровни стакана уровень за уровнем, высчитывая средневзвешенную цену.
          </li>
          <li>
            <strong className="text-slate-200">Очередь лимиток:</strong> лимитная заявка считается исполненной только если цена полностью пробила уровень или объем реальных сделок в ленте превысил объем очереди перед вами (<code className="text-cyan-400">volume_passed &gt; queue_ahead</code>).
          </li>
          <li>
            <strong className="text-slate-200">Dynamic TP Collapse:</strong> доли тейк-профитов меньше 5.5 USDT автоматически объединяются, чтобы не нарушать лимиты биржи.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'risk',
    tab: 'firewall',
    title: '3. Неизменяемый Risk Management Firewall',
    badge: 'Защита депозита',
    icon: Shield,
    content: (
      <div className="space-y-3 text-xs leading-relaxed text-slate-300">
        <p>
          Брандмауэр риска — это процедурный модуль на Python, правила которого <strong className="text-rose-400">не могут быть отключены или изменены ни одной нейросетью</strong>:
        </p>
        <div className="space-y-2 text-[11px] font-mono">
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">1. Лимит риска на сделку:</span>
            <span className="text-emerald-400 font-bold">&le; 1.5% от депозита (авто-расчет объема от SL)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">2. Дневной рубильник (Kill-Switch):</span>
            <span className="text-rose-400 font-bold">При просадке &ge; 5.0% за 24ч — отмена ордеров и лок на 24ч</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">3. Изолированная маржа:</span>
            <span className="text-amber-400 font-bold">Кросс-маржа запрещена, плечо жестко &le; 10x</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">4. Funding Guard:</span>
            <span className="text-cyan-400 font-bold">Блокировка входов за 15 мин при невыгодной ставке &gt; 0.10%</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'intelligence',
    tab: 'intelligence',
    title: '4. Telegram UserBot и двухступенчатая воронка',
    badge: 'Внешняя разведка',
    icon: Radio,
    content: (
      <div className="space-y-3 text-xs leading-relaxed text-slate-300">
        <p>
          Парсинг сигналов из Telegram защищен от спама, рекламы и фейковых редакторов каналов:
        </p>
        <ol className="space-y-2 list-decimal list-inside text-slate-400 text-[11px]">
          <li>
            <strong className="text-white">Ступень 1 (Regex Gate за 0 мс):</strong> локальный фильтр мгновенно отсекает 85% шума, мемов и рекламы без вызовов API.
          </li>
          <li>
            <strong className="text-white">Ступень 2 (Ollama Cloud API):</strong> извлекает структуру сигнала в строгий Pydantic JSON через облачный сервис Ollama Cloud (модели gpt-oss и векторные эмбеддинги bge-m3).
          </li>
          <li>
            <strong className="text-white">Фильтр устаревших цен (Stale Signal):</strong> если цена уже прошла более 30% пути к TP1 или соотношение риск/прибыль (R:R) меньше 1.2 — сигнал автоматически отклоняется.
          </li>
          <li>
            <strong className="text-white">Анти-скам детектор (SCAM_EDIT):</strong> если автор канала редактирует цифры входа или стопа спустя более 180 секунд после публикации, канал получает штраф -35 баллов доверия.
          </li>
        </ol>
      </div>
    ),
  },
  {
    id: 'arena',
    tab: 'arena',
    title: '5. AI Arena и 14-дневный карантин',
    badge: 'Валидация моделей',
    icon: Zap,
    content: (
      <div className="space-y-3 text-xs leading-relaxed text-slate-300">
        <p>
          Любая модель машинного обучения (PyTorch RL, ONNX, LightGBM) или новый Telegram-канал при попадании в систему помещаются в статус <strong className="text-amber-400">QUARANTINE</strong>:
        </p>
        <div className="bg-slate-950 p-3 rounded-xl border border-amber-500/30 text-amber-200 text-[11px] font-mono space-y-1">
          <div className="font-bold text-amber-400">Условия перевода в боевой LIVE режим:</div>
          <div>✓ Минимум 30 закрытых сделок на живом стакане в Режиме 1</div>
          <div>✓ Profit Factor &ge; 1.50</div>
          <div>✓ Максимальная просадка Max Drawdown &lt; 5.0%</div>
          <div>✓ Совпадение криптографического хэша SHA256 с манифестом домашней станции Node B</div>
        </div>
      </div>
    ),
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
}) => {
  const [stepIdx, setStepIdx] = useState<number>(0);

  if (!isOpen) return null;

  const currentStep = STEPS[stepIdx];
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (stepIdx > 0) {
      setStepIdx(stepIdx - 1);
    }
  };

  const handleGoToTab = () => {
    onSelectTab(currentStep.tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col justify-between">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                Интерактивное руководство ZimaTrade AI
              </h2>
              <span className="text-[10px] font-mono text-slate-400">
                Шаг {stepIdx + 1} из {STEPS.length} • {currentStep.badge}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-base text-white">{currentStep.title}</h3>
          </div>

          <div className="min-h-[180px]">{currentStep.content}</div>
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={handleGoToTab}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
          >
            <span>Перейти к разделу &quot;{currentStep.tab.toUpperCase()}&quot;</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Назад</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-900/40 flex items-center gap-1 transition"
            >
              <span>{stepIdx === STEPS.length - 1 ? 'Завершить обучение' : 'Далее'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
