import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, TrendingUp, ShieldAlert, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';

export type MetricId =
  | 'OBI'
  | 'SPREAD_BPS'
  | 'VWAP'
  | 'ATR'
  | 'RSI_EMA'
  | 'SENTIMENT_LLM'
  | 'SHARPE'
  | 'PROFIT_FACTOR'
  | 'MAX_DRAWDOWN'
  | 'DAILY_DRAWDOWN'
  | 'QUARANTINE_TRADES'
  | 'CONFIDENCE_THRESHOLD'
  | 'LEARNING_RATE'
  | 'LEVERAGE'
  | 'TP_SL_RATIO'
  | 'WIN_RATE'
  | 'TOTAL_EQUITY'
  | 'FREE_MARGIN'
  | 'REALIZED_PNL'
  | 'UNREALIZED_PNL'
  | 'REWARD_CURVE'
  | 'STRATEGY_DELTA'
  | 'CONSECUTIVE_LOSSES'
  | 'MARGIN_UTIL'
  | 'BYBIT_FEE';

export interface MetricDefinition {
  title: string;
  shortTag: string;
  plainDefinition: string;
  tradingImpact: string;
  benchmarkRange: string;
  evaluateLiveValue?: (val: number) => {
    tone: 'positive' | 'warning' | 'danger' | 'neutral';
    verdict: string;
  };
}

export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  OBI: {
    title: 'Дисбаланс стакана заявок (L2 OBI — 25 уровней)',
    shortTag: 'Баланс покупателей и продавцов',
    plainDefinition:
      'Показывает, чьих лимитных заявок в биржевом стакане сейчас больше: покупателей (зеленые Биды) или продавцов (красные Аски) на 25 ближайших уровнях цены.',
    tradingImpact:
      'Главный опережающий сигнал для торговых алгоритмов. Если покупателей значительно больше (> +12%), цена с высокой вероятностью пойдет вверх (сигнал в ЛОНГ). Если давят продавцы (< -12%) — сигнал в ШОРТ.',
    benchmarkRange: 'От -15% до +15% — штиль (флэт) · Выше +15% — сильный спрос · Ниже -15% — давление продаж',
    evaluateLiveValue: (val: number) => {
      if (val >= 15) {
        return {
          tone: 'positive',
          verdict: `Сейчас +${val.toFixed(1)}%: сильный перевес покупателей в стакане — поиск точки входа в ЛОНГ.`,
        };
      }
      if (val <= -15) {
        return {
          tone: 'danger',
          verdict: `Сейчас ${val.toFixed(1)}%: сильное давление продавцов — поиск точки входа в ШОРТ.`,
        };
      }
      return {
        tone: 'neutral',
        verdict: `Сейчас ${val >= 0 ? '+' : ''}${val.toFixed(1)}%: силы покупателей и продавцов примерно равны.`,
      };
    },
  },
  SPREAD_BPS: {
    title: 'Биржевой спред в базисных пунктах (Spread bps)',
    shortTag: 'Разница лучших цен (10 bps = 0.10%)',
    plainDefinition:
      'Зазор между самой выгодной ценой продажи и самой выгодной ценой покупки в стакане. Чем меньше спред, тем дешевле и выгоднее мгновенный вход в сделку.',
    tradingImpact:
      'Защитный фильтр ликвидности. Если спред расширяется выше лимита (например, > 18 bps во время резких новостей), Риск-Файрвол блокирует новые входы ботов, чтобы вы не теряли деньги на проскальзывании.',
    benchmarkRange: '1–8 bps — идеальная ликвидность · 9–15 bps — умеренно · > 18 bps — опасно (вход блокируется)',
    evaluateLiveValue: (val: number) => {
      if (val >= 18) {
        return {
          tone: 'danger',
          verdict: `Спред ${val.toFixed(2)} bps слишком широкий! Защита блокирует рыночные входы, чтобы избежать скрытых потерь.`,
        };
      }
      if (val >= 11) {
        return {
          tone: 'warning',
          verdict: `Спред ${val.toFixed(2)} bps повышен: ликвидность ниже обычной, боты входят только при высокой уверенности.`,
        };
      }
      return {
        tone: 'positive',
        verdict: `Спред ${val.toFixed(2)} bps узкий: отличная ликвидность, минимальные издержки при входе в сделку.`,
      };
    },
  },
  VWAP: {
    title: 'Средневзвешенная по объему цена (VWAP)',
    shortTag: 'Справедливая средняя цена дня',
    plainDefinition:
      'Истинная средняя цена монеты за сессию с учетом того, на каких именно отметках проходили самые крупные объемы покупок и продаж.',
    tradingImpact:
      'Помогает не покупать на самом пике. Если цена сильно ушла вверх от VWAP, покупка становится рискованной (рынок перегрет). Боты предпочитают покупать вблизи или чуть ниже VWAP с возвратом к справедливой цене.',
    benchmarkRange: 'Отклонение в пределах ±0.35% — справедливая цена · > 0.80% — рынок перегрет (ожидание отката)',
    evaluateLiveValue: (val: number) => {
      if (Math.abs(val) > 50) {
        return {
          tone: 'neutral',
          verdict: `Справедливый ориентир VWAP: $${val.toLocaleString('en-US', { maximumFractionDigits: 2 })}. Покупка выгоднее вблизи или ниже этой линии.`,
        };
      }
      return {
        tone: 'neutral',
        verdict: `Вес фактора VWAP (${(val * 100).toFixed(0)}%) определяет, насколько сильно бот ищет скидку относительно средней цены.`,
      };
    },
  },
  ATR: {
    title: 'Индикатор волатильности и адаптивный Стоп-Лосс (ATR-14)',
    shortTag: 'Размах колебаний цены',
    plainDefinition:
      'Average True Range — показывает, насколько сильно «качает» цену монеты за последние 14 свечей. Позволяет адаптировать защиту под текущую нервозность рынка.',
    tradingImpact:
      'Вместо жесткого шаблона 1.2% боты ставят защитный Стоп-Лосс на расстоянии (ATR × множитель). Если на рынке шторм, стоп автоматически отодвигается чуть дальше, чтобы сделку не выбило случайным секундным шумом.',
    benchmarkRange: 'Множитель 1.2x–1.5x ATR — быстрый скальпинг · 1.6x–2.2x ATR — спокойное удержание без ложных выбиваний',
    evaluateLiveValue: (val: number) => {
      if (val <= 3.5) {
        return {
          tone: 'neutral',
          verdict: `Множитель ${val.toFixed(2)}x ATR: ${val >= 1.65 ? 'широкий защитный буфер против рыночного шума' : 'компактный стоп-лосс для быстрых сделок'}.`,
        };
      }
      return {
        tone: 'neutral',
        verdict: `Дистанция адаптивного стопа рассчитывается автоматически от текущей волатильности свечей Bybit.`,
      };
    },
  },
  RSI_EMA: {
    title: 'Импульс и скорость тренда (RSI-14 + EMA 9/21)',
    shortTag: 'Сила разгона и перегретость цены',
    plainDefinition:
      'Комбинация двух индикаторов: EMA показывает направление краткосрочного тренда, а RSI (от 0 до 100) измеряет, не устал ли рынок расти или падать.',
    tradingImpact:
      'Запрещает ботам покупать на самой вершине (когда RSI > 72 — рынок «перекуплен») или продавать на самом дне (RSI < 28 — рынок «перепродан»). Подтверждает, что тренд действительно идет в сторону сделки.',
    benchmarkRange: 'RSI 30–70 — здоровая зона для входа по тренду · > 70 — риск разворота вниз · < 30 — риск отскока вверх',
  },
  SENTIMENT_LLM: {
    title: 'Индекс новостного фона и Telegram-сигналов',
    shortTag: 'Настроение новостей и сигналов',
    plainDefinition:
      'Парсер в реальном времени проверяет подключенные каналы и новостные ленты, оценивая общий настрой рынка: позитивный (бычий) или негативный (медвежий).',
    tradingImpact:
      'Усиливает уверенность стратегии при совпадении графика с позитивными новостями и мгновенно удерживает от покупок при выходе негативных событий.',
    benchmarkRange: 'Вес 15–35% для базовых стратегий · До 45–60% для сигнального модуля',
  },
  SHARPE: {
    title: 'Коэффициент стабильности Шарпа (Sharpe Ratio)',
    shortTag: 'Плавность прибыли без нервов',
    plainDefinition:
      'Главный мировой показатель качества торговли: показывает, сколько чистой прибыли приносит бот на каждую единицу риска и колебаний счета.',
    tradingImpact:
      'Если Sharpe высокий (> 1.5), бот зарабатывает ровно и предсказуемо. Если Sharpe падает ниже 1.0, система безопасности может перевести бота из реальной торговли в учебный Карантин до переобучения.',
    benchmarkRange: '< 1.0 — нестабильно · 1.2–1.8 — хороший профи-уровень · > 2.0 — выдающаяся стабильность',
    evaluateLiveValue: (val: number) => {
      if (val >= 1.8) {
        return {
          tone: 'positive',
          verdict: `Sharpe ${val.toFixed(2)}: отличная стабильность! Прибыль растет плавно при минимальном риске.`,
        };
      }
      if (val >= 1.2) {
        return {
          tone: 'neutral',
          verdict: `Sharpe ${val.toFixed(2)}: уверенная рабочая норма для алгоритмической торговли.`,
        };
      }
      return {
        tone: 'warning',
        verdict: `Sharpe ${val.toFixed(2)}: повышенная качка доходности — рекомендуется запустить эпоху обучения на истории Bybit.`,
      };
    },
  },
  PROFIT_FACTOR: {
    title: 'Коэффициент окупаемости (Profit Factor / PF)',
    shortTag: 'Во сколько раз доходы больше расходов',
    plainDefinition:
      'Вся сумма заработанных денег, деленная на всю сумму убытков. Например, PF = 2.10 означает, что на каждый $1 убытка стратегия приносит $2.10 прибыли.',
    tradingImpact:
      'Для допуска стратегии к реальным деньгам (LIVE) требуется Profit Factor не ниже 1.30. Если показатель падает к 1.0, стратегия работает в ноль и требует корректировки весов.',
    benchmarkRange: '< 1.0 — работа в минус · 1.30–1.70 — надежная прибыль · > 1.80 — высокая рентабельность',
    evaluateLiveValue: (val: number) => {
      if (val >= 1.6) {
        return {
          tone: 'positive',
          verdict: `Окупаемость x${val.toFixed(2)}: на каждый $1 риска система зарабатывает $${val.toFixed(2)} прибыли.`,
        };
      }
      if (val >= 1.15) {
        return {
          tone: 'neutral',
          verdict: `Окупаемость x${val.toFixed(2)}: стратегия стабильно перекрывает убытки и комиссии биржи.`,
        };
      }
      return {
        tone: 'danger',
        verdict: `Окупаемость x${val.toFixed(2)}: близко к порогу безубыточности (1.00).`,
      };
    },
  },
  MAX_DRAWDOWN: {
    title: 'Максимальная просадка (Max Drawdown %)',
    shortTag: 'Временный спад от рекорда счета',
    plainDefinition:
      'Показывает самое глубокое временное снижение баланса от его предыдущей максимальной точки (в процентах).',
    tradingImpact:
      'Позволяет оценить психологическую комфортность бота. Чем меньше просадка, тем спокойнее спит инвестор. При приближении к 5% включается жесткий контроль рисков.',
    benchmarkRange: '0%–2.5% — очень бережная торговля · 2.5%–4.5% — умеренный риск · ≥ 5.0% — срабатывание стоп-лимита',
    evaluateLiveValue: (val: number) => {
      if (val >= 4.2) {
        return {
          tone: 'danger',
          verdict: `Просадка ${val.toFixed(1)}% близка к защитному порогу 5.0%! Рекомендуется снизить риск на сделку.`,
        };
      }
      if (val >= 2.5) {
        return {
          tone: 'warning',
          verdict: `Просадка ${val.toFixed(1)}% в пределах рабочей нормы, но требует внимания.`,
        };
      }
      return {
        tone: 'positive',
        verdict: `Просадка всего ${val.toFixed(1)}%: капитал надежно защищен.`,
      };
    },
  },
  DAILY_DRAWDOWN: {
    title: 'Дневной лимит потерь (MAX_DAILY_DRAWDOWN — 5.0%)',
    shortTag: 'Несгораемый предохранитель счета на день',
    plainDefinition:
      'Главное правило безопасности профессиональных трейдеров: сколько максимум процентов от счета допустимо потерять за одни сутки при самом неудачном рынке.',
    tradingImpact:
      'Как только дневная просадка достигает 5.0%, аппаратный Риск-Файрвол мгновенно закрывает все открытые сделки и отключает торговлю до следующего дня, сохраняя 95% вашего капитала.',
    benchmarkRange: '0%–2.5% — зеленая зона · 3.5%–4.5% — предупреждение · 5.0% — автоматическая блокировка (Kill-Switch)',
    evaluateLiveValue: (val: number) => {
      if (val >= 4.0) {
        return {
          tone: 'danger',
          verdict: `Внимание: использовано ${val.toFixed(2)}% из 5.0% дневного лимита! Еще немного, и сработает авто-стоп.`,
        };
      }
      return {
        tone: 'positive',
        verdict: `Текущая просадка ${val.toFixed(2)}% из 5.0%: до защитного отключения большой запас прочности.`,
      };
    },
  },
  QUARANTINE_TRADES: {
    title: 'Квалификационный опыт бота (Минимум 30 сделок)',
    shortTag: 'Экзамен бота перед реальным счетом',
    plainDefinition:
      'Счетчик проверочных сделок, которые бот обязан совершить на учебном счете (Shadow / Карантин), прежде чем система разрешит ему торговать реальными деньгами.',
    tradingImpact:
      'Защищает от «случайного везения» на 2–3 сделках. Только после 30 закрытых сделок с положительной окупаемостью (PF > 1.3) кнопку допуска в LIVE можно активировать.',
    benchmarkRange: '< 30 сделок — проходит проверку в Карантине · ≥ 30 сделок — экзамен сдан, готов к LIVE',
    evaluateLiveValue: (val: number) => {
      if (val >= 30) {
        return {
          tone: 'positive',
          verdict: `Выполнено ${val} из 30 сделок: статистическая проверка пройдена полностью!`,
        };
      }
      return {
        tone: 'warning',
        verdict: `Выполнено ${val} из 30 сделок: осталось еще ${30 - val} проверочных сделок для полного допуска.`,
      };
    },
  },
  CONFIDENCE_THRESHOLD: {
    title: 'Порог уверенности для входа (Confidence Threshold)',
    shortTag: 'Минимальная сила сигнала для сделки',
    plainDefinition:
      'Минимальная сила суммарного сигнала (от 10% до 60%), при которой стратегия считает сделку достаточно надежной для открытия.',
    tradingImpact:
      'Если поднять порог (например, до 28–35%), стратегия будет входить редко, но только в самые очевидные движения рынка. Если снизить (до 15–18%) — сделок станет больше, но вырастет и число мелких стопов.',
    benchmarkRange: '14%–18% — частые сделки (Активный) · 20%–24% — баланс · 26%–35% — снайперский вход (Спокойный)',
  },
  LEARNING_RATE: {
    title: 'Шаг адаптации весов (Learning Rate α)',
    shortTag: 'Быстрота подстройки под рынок',
    plainDefinition:
      'Определяет, насколько сильно стратегия корректирует внутренние веса факторов после каждой прибыльной или убыточной сделки.',
    tradingImpact:
      'При высоком шаге (0.08–0.12) алгоритм быстро подстраивается под смену тренда. Низкий шаг (0.03–0.05) сохраняет веса более плавными и стабильными.',
    benchmarkRange: '0.03–0.05 — плавная подстройка · 0.06–0.08 — оптимальная адаптация · > 0.10 — быстрая перестройка',
  },
  LEVERAGE: {
    title: 'Кредитное плечо (Leverage x1 – x25)',
    shortTag: 'Ускоритель прибыли и риска',
    plainDefinition:
      'Позволяет открывать сделку на сумму, в несколько раз превышающую ваш залог. С плечом x10 движение цены монеты на 1% дает +10% (или -10%) к залогу сделки.',
    tradingImpact:
      'Увеличивает потенциальный доход, но приближает цену принудительного закрытия (ликвидации). Для безопасной торговли новичкам рекомендуется плечо от x3 до x10.',
    benchmarkRange: 'x2–x5 — консервативно и безопасно · x8–x10 — рабочий стандарт · > x15 — высокий риск',
    evaluateLiveValue: (val: number) => {
      if (val > 15) {
        return {
          tone: 'warning',
          verdict: `Плечо x${val}: повышенная чувствительность к колебаниям цены. Обязателен защитный Стоп-Лосс.`,
        };
      }
      return {
        tone: 'positive',
        verdict: `Плечо x${val}: сбалансированная нагрузка на капитал.`,
      };
    },
  },
  TP_SL_RATIO: {
    title: 'Соотношение Тейк-Профита к Стоп-Лоссу (Risk / Reward Ratio)',
    shortTag: 'Во сколько раз цель прибыли больше риска',
    plainDefinition:
      'Показывает, сколько долларов прибыли бот планирует забрать на каждый $1 возможного убытка в одной сделке.',
    tradingImpact:
      'При коэффициенте 2.0x целевой Тейк-Профит ставится в 2 раза дальше, чем защитный Стоп-Лосс. Это позволяет зарабатывать даже в том случае, если половина сделок закрывается по стопу.',
    benchmarkRange: '1.5x — быстрая фиксация прибыли · 1.8x–2.2x — золотой стандарт · > 2.5x — ожидание длинных трендов',
  },
  WIN_RATE: {
    title: 'Процент успешных сделок (Win Rate %)',
    shortTag: 'Доля побед из всех закрытых сделок',
    plainDefinition:
      'Какой процент ваших закрытых сделок принес чистую прибыль (с учетом биржевых комиссий Bybit).',
    tradingImpact:
      'В паре с соотношением прибыли к риску (TP/SL) определяет скорость роста кошелька. При TP/SL = 2.0x достаточно даже 45–50% успешных сделок, чтобы счет уверенно рос.',
    benchmarkRange: '45%–55% — норма для трендовых ботов · 55%–68% — отличный результат · > 70% — высокий снайперский показатель',
  },
  TOTAL_EQUITY: {
    title: 'Итоговый капитал счета (Total Equity)',
    shortTag: 'Полная стоимость портфеля сейчас',
    plainDefinition:
      'Все ваши деньги в системе: зафиксированный баланс кошелька плюс текущая (плавающая) прибыль или убыток по всем открытым в данный момент сделкам.',
    tradingImpact:
      'Именно от этой суммы рассчитывается размер новых позиций ботов (в % риска) и отслеживается дневной защитный лимит просадки.',
    benchmarkRange: 'Стартовый учебный капитал: $10,000.00 USDT',
  },
  FREE_MARGIN: {
    title: 'Доступная свободная маржа (Free Margin)',
    shortTag: 'Деньги, свободные для новых сделок',
    plainDefinition:
      'Часть вашего капитала, которая сейчас не заблокирована в качестве залога под открытые позиции и готова к новым покупкам или продажам.',
    tradingImpact:
      'Если загрузка маржи превышает 70–80%, Риск-Файрвол запрещает открывать новые сделки, чтобы на счете всегда оставался запас прочности.',
    benchmarkRange: 'Занято 0%–40% — безопасно · 45%–70% — умеренная нагрузка · > 75% — высокая загрузка счета',
  },
  REALIZED_PNL: {
    title: 'Чистая зафиксированная прибыль (Realized PnL)',
    shortTag: 'Деньги, уже зачисленные в кошелек',
    plainDefinition:
      'Итоговый финансовый результат по всем уже закрытым сделкам за вычетом комиссии биржи Bybit (0.055% за вход и выход).',
    tradingImpact:
      'Отражает реальный заработок стратегии, который уже не зависит от текущих колебаний цен на графике.',
    benchmarkRange: '> $0.00 — счет в чистом плюсе · < $0.00 — чистый убыток по закрытым сделкам',
  },
  UNREALIZED_PNL: {
    title: 'Текущий плавающий результат (Unrealized PnL)',
    shortTag: 'Прибыль/убыток по открытым сделкам',
    plainDefinition:
      'Сколько вы заработаете или потеряете прямо сейчас, если в эту секунду закроете все активные сделки по текущей рыночной цене.',
    tradingImpact:
      'Меняется каждую секунду вместе с ценой в стакане. Превращается в реальные деньги на балансе только после закрытия сделки (по Тейк-Профиту, Стоп-Лоссу или вручную).',
    benchmarkRange: 'Зеленый (+) — открытые позиции в плюсе · Красный (-) — позиции временно в минусе',
  },
  REWARD_CURVE: {
    title: 'Кривая эффективности калибровки (ΣR)',
    shortTag: 'Накопленный индекс результативности весов',
    plainDefinition:
      'График калибровки весов на сделках: за каждую прибыльную сделку с низким риском начисляется положительный балл (+R), а за стоп-лосс или просадку — отрицательный (-R).',
    tradingImpact:
      'Растущая вверх кривая означает, что стратегия подобрала веса под текущий рынок и с каждым прогоном показывает более высокое матожидание.',
    benchmarkRange: 'Рост вправо-вверх — успешная калибровка · Спад — требуется смена режима или прогон по свечам Bybit',
  },
  STRATEGY_DELTA: {
    title: 'Сравнительный перевес стратегий (Дельта A − B)',
    shortTag: 'Какая из двух стратегий эффективнее и на сколько',
    plainDefinition:
      'Прямая разница в доходности или результативности между первой выбранной стратегией (A) и второй стратегией (B) в одних и тех же рыночных условиях.',
    tradingImpact:
      'Помогает сразу понять, какую стратегию лучше включить для текущего рынка (например, во флэте выигрывает Delta-L2 по стакану, а при сильном импульсе — Momentum).',
    benchmarkRange: '> 0 — лидирует Стратегия A · < 0 — лидирует Стратегия B',
  },
  CONSECUTIVE_LOSSES: {
    title: 'Серия убыточных сделок подряд (Loss Streak Breaker)',
    shortTag: 'Защита от полосы неудач и тильта',
    plainDefinition:
      'Счетчик того, сколько раз подряд сделки закрылись в минус без единой прибыльной сделки между ними.',
    tradingImpact:
      'Если рынок стал непредсказуемым и боты получили 4–5 стоп-лоссов подряд, система автоматически ставит торговлю на паузу и запускает внеочередное переобучение весов.',
    benchmarkRange: '0–2 подряд — рабочая ситуация · 3–4 — внимание · 5 подряд — авто-пауза и переобучение',
  },
  MARGIN_UTIL: {
    title: 'Коэффициент загрузки маржи (Margin Utilization %)',
    shortTag: 'Какая доля счета сейчас в сделках',
    plainDefinition:
      'Процент вашего общего капитала, который прямо сейчас задействован в открытых сделках.',
    tradingImpact:
      'Контролирует, чтобы боты не вложили все деньги одновременно. При превышении 80% новые сигналы на вход игнорируются до разгрузки портфеля.',
    benchmarkRange: 'До 35% — консервативно · 35%–65% — активно · Свыше 80% — лимит безопасности',
  },
  BYBIT_FEE: {
    title: 'Комиссия исполнения биржи (Bybit Taker Fee 0.055%)',
    shortTag: 'Реальная комиссия биржи за сделку',
    plainDefinition:
      'Стандартная комиссия биржи Bybit за мгновенное исполнение рыночной заявки (0.055% при открытии и 0.055% при закрытии позиции).',
    tradingImpact:
      'Вшита во все расчеты ZimaTrade: стратегии открывают сделку только тогда, когда ожидаемая прибыль значительно превышает двойную комиссию и спред.',
    benchmarkRange: '0.055% за рыночный ордер (учитывается автоматически в чистом PnL)',
  },
};

interface MetricTooltipProps {
  metric: MetricId;
  /** Optional live numerical value to provide dynamic real-time interpretation */
  value?: number;
  /** Custom trigger content (if omitted, renders a small info badge) */
  children?: React.ReactNode;
  /** Show a subtle help icon next to the children */
  showIcon?: boolean;
  /** Optional extra className for the wrapper */
  className?: string;
}

export const MetricTooltip: React.FC<MetricTooltipProps> = ({
  metric,
  value,
  children,
  showIcon = true,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'top' | 'bottom';
  }>({
    top: 0,
    left: 12,
    width: 320,
    placement: 'top',
  });
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  const def = METRIC_DEFINITIONS[metric];
  if (!def) {
    return <span className={className}>{children}</span>;
  }

  const liveEval =
    typeof value === 'number' && !Number.isNaN(value) && def.evaluateLiveValue
      ? def.evaluateLiveValue(value)
      : null;

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const tooltipWidth = Math.min(340, Math.max(240, viewportWidth - 24));
    const estimatedHeight = liveEval ? 250 : 205;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (left < 12) left = 12;
    if (left + tooltipWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - tooltipWidth - 12);
    }

    const spaceAbove = rect.top;
    const placement: 'top' | 'bottom' = spaceAbove > estimatedHeight + 16 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 10 : rect.bottom + 10;

    setCoords({ top, left, width: tooltipWidth, placement });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    const handleOutsideTouch = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('touchstart', handleOutsideTouch);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('touchstart', handleOutsideTouch);
    };
  }, [isOpen, value]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        onMouseEnter={() => {
          updatePosition();
          setIsOpen(true);
        }}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          updatePosition();
          setIsOpen((prev) => !prev);
        }}
        onFocus={() => {
          updatePosition();
          setIsOpen(true);
        }}
        onBlur={() => setIsOpen(false)}
        className={`inline-flex items-center gap-1 cursor-help border-b border-dotted border-slate-500/70 hover:border-cyan-400 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 rounded-sm max-w-full ${className}`}
      >
        {children}
        {showIcon && (
          <HelpCircle className="w-3 h-3 text-slate-400 hover:text-cyan-300 shrink-0 transition-colors" />
        )}
      </span>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: coords.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
              width: `${coords.width}px`,
              maxWidth: 'calc(100vw - 24px)',
              zIndex: 9999,
            }}
            className="pointer-events-none select-none bg-slate-950/98 border border-cyan-500/40 rounded-xl p-3.5 shadow-[0_14px_40px_rgba(0,0,0,0.85)] text-left font-sans"
          >
            {/* Header */}
            <div className="pb-2 mb-2 border-b border-slate-800">
              <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                {def.shortTag}
              </div>
              <div className="text-xs font-bold text-white leading-snug mt-0.5">
                {def.title}
              </div>
            </div>

            {/* Plain-Language Definition */}
            <div className="space-y-2 text-[11px] leading-relaxed">
              <div>
                <span className="font-semibold text-slate-200 block mb-0.5">
                  Простыми словами:
                </span>
                <p className="text-slate-300">{def.plainDefinition}</p>
              </div>

              {/* How It Affects Trading Decisions */}
              <div className="bg-slate-900/90 border border-slate-800/90 rounded-lg p-2">
                <span className="font-semibold text-emerald-300 flex items-center gap-1 mb-0.5">
                  <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Как влияет на решение о сделке:</span>
                </span>
                <p className="text-slate-300">{def.tradingImpact}</p>
              </div>

              {/* Dynamic Live Value Evaluation if provided */}
              {liveEval && (
                <div
                  className={`rounded-lg p-2 border flex items-start gap-1.5 ${
                    liveEval.tone === 'positive'
                      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                      : liveEval.tone === 'danger'
                      ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                      : liveEval.tone === 'warning'
                      ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                      : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
                  }`}
                >
                  {liveEval.tone === 'positive' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : liveEval.tone === 'danger' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  ) : liveEval.tone === 'warning' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  )}
                  <span>{liveEval.verdict}</span>
                </div>
              )}

              {/* Benchmark / Reference Range */}
              <div className="pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                <span className="text-slate-300 font-semibold">Ориентир: </span>
                {def.benchmarkRange}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
