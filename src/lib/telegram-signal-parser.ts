/**
 * Institutional Telegram Signal & Market NLP Parser (Russian + English)
 *
 * Specifically engineered to parse both:
 * 1. Structured VIP/quant signals (e.g. `#BTCUSDT LONG Entry: 74500 | SL: 73400 | TP1: 76800`)
 * 2. Natural-language Russian & English trader commentary channels such as `https://t.me/ne_investor`,
 *    `@WatcherGuru`, and `@WuBlockchain` — while strictly filtering out non-trading/lifestyle/promo posts.
 */

export interface ParsedTelegramPostSignal {
  postId?: string;
  publishedAt?: number;
  rawText: string;
  isActionableSignal: boolean;
  skipReason?: string;
  symbol: string;
  mentionedSymbols: string[];
  side: 'LONG' | 'SHORT';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number; // [-0.95 .. +0.95]
  extractedLevels: {
    entryPrice?: number;
    stopLoss?: number;
    tp1?: number;
    referenceLevel?: number;
  };
  matchedBullPhrases: string[];
  matchedBearPhrases: string[];
}

const WHITELISTED_SYMBOLS = new Set<string>([
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
  'NEARUSDT',
  'SUIUSDT',
  'APTUSDT',
  'ARBUSDT',
  'OPUSDT',
  'LTCUSDT',
  'BCHUSDT',
  'UNIUSDT',
  'AAVEUSDT',
  'TONUSDT',
  'XAUUSDT',
]);

const SYMBOL_PATTERNS: Array<[RegExp, string]> = [
  [/(\$BTC\b|#BTC\b|\bBTCUSDT\b|\bBTC\b|\bBITCOIN\b|БИТКОИН|БИТКА|БИТКУ|БИТОК)/i, 'BTCUSDT'],
  [/(\$ETH\b|#ETH\b|\bETHUSDT\b|\bETH\b|\bETHEREUM\b|ЭФИР)/i, 'ETHUSDT'],
  [/(\$SOL\b|#SOL\b|\bSOLUSDT\b|\bSOLANA\b|\bSOL\b|СОЛАН)/i, 'SOLUSDT'],
  [/(\$XRP\b|#XRP\b|\bXRPUSDT\b|\bXRP\b|\bRIPPLE\b|РИПЛ)/i, 'XRPUSDT'],
  [/(\$BNB\b|#BNB\b|\bBNBUSDT\b|\bBNB\b)/i, 'BNBUSDT'],
  [/(\$DOGE\b|#DOGE\b|\bDOGEUSDT\b|\bDOGECOIN\b|\bDOGE\b|ДОГИ)/i, 'DOGEUSDT'],
  [/(\$TON\b|#TON\b|\bTONUSDT\b|\bTONCOIN\b|\bTON\b)/i, 'TONUSDT'],
  [/(\$SUI\b|#SUI\b|\bSUIUSDT\b|\bSUI\b)/i, 'SUIUSDT'],
  [/(\$NEAR\b|#NEAR\b|\bNEARUSDT\b|\bNEAR\b)/i, 'NEARUSDT'],
  [/(\$AVAX\b|#AVAX\b|\bAVAXUSDT\b|\bAVALANCHE\b|\bAVAX\b)/i, 'AVAXUSDT'],
  [/(\$ADA\b|#ADA\b|\bADAUSDT\b|\bCARDANO\b|\bADA\b)/i, 'ADAUSDT'],
  [/(\$LINK\b|#LINK\b|\bLINKUSDT\b|\bCHAINLINK\b|\bLINK\b)/i, 'LINKUSDT'],
  [/(\$DOT\b|#DOT\b|\bDOTUSDT\b|\bPOLKADOT\b|\bDOT\b)/i, 'DOTUSDT'],
  [/(\$LTC\b|#LTC\b|\bLTCUSDT\b|\bLITECOIN\b|\bLTC\b)/i, 'LTCUSDT'],
  [/(\$BCH\b|#BCH\b|\bBCHUSDT\b|\bBCH\b)/i, 'BCHUSDT'],
  [/(\$UNI\b|#UNI\b|\bUNIUSDT\b|\bUNISWAP\b|\bUNI\b)/i, 'UNIUSDT'],
  [/(\$AAVE\b|#AAVE\b|\bAAVEUSDT\b|\bAAVE\b)/i, 'AAVEUSDT'],
  [/(\$APT\b|#APT\b|\bAPTUSDT\b|\bAPTOS\b|\bAPT\b)/i, 'APTUSDT'],
  [/(\$ARB\b|#ARB\b|\bARBUSDT\b|\bARBITRUM\b|\bARB\b)/i, 'ARBUSDT'],
  [/(\$OP\b|#OP\b|\bOPUSDT\b|\bOPTIMISM\b)/i, 'OPUSDT'],
  [/(\$XAU\b|#XAU\b|\bXAUUSDT\b|\bXAUTUSDT\b|\bXAUT\b|\bXAU\b|\bGOLD\b|ЗОЛОТ)/i, 'XAUUSDT'],
];

/**
 * Off-topic / lifestyle / pure promo patterns that should never be treated as trading signals.
 */
const OFF_TOPIC_PATTERNS: RegExp[] = [
  /безалкогольное пиво/i,
  /благотворител/i,
  /коррекционного центра/i,
  /детей с инвалидностью/i,
  /напомните плиз нормальный впн/i,
  /использую @vushvpnbot/i,
  /плейлист для новичков/i,
  /смотреть ролики/i,
  /подкасты/i,
  /чпокал закупщицу/i,
  /галочки от @major/i,
  /всем нравятся зел[её]ные pnl-ки/i,
  /share\.pionex\.com/i,
  /действующие промоакции|промо и бонусы|действующие предложения bybit|руководство по действующим промоакциям/i,
  /^ты здесь\??$/i,
  /^че-то там зашевелилось\.?$/i,
];

/**
 * Weighted bullish phrases (Russian + English) including natural trader idioms from @ne_investor.
 */
const BULLISH_RULES: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\b(long|buy)\b/i, weight: 2.2, label: 'LONG/BUY' },
  { pattern: /(отличная точка входа|хорошая точка входа|хорошая точка зайти|хорошая точка для входа)/i, weight: 2.8, label: 'точка входа (LONG)' },
  { pattern: /(точка зайти в бот|зайти в бот по)/i, weight: 2.2, label: 'вход в позицию' },
  { pattern: /(взял лонг|открыл лонг|заходил в лонг|зашел в лонг|держим лонг|выставил лонг)/i, weight: 2.8, label: 'открыт лонг' },
  { pattern: /(лонги в приоритете|приоритет лонговый|приоритет на лонг)/i, weight: 2.8, label: 'приоритет лонг' },
  { pattern: /(кол на|спасибо за твой кол)/i, weight: 1.8, label: 'кол на актив' },
  { pattern: /(рынок снова в рост|ожидаем рост|продолжает рост|выкуп лимитной|крупный выкуп|приток в спотовые)/i, weight: 2.0, label: 'импульс роста' },
  { pattern: /(shorts?\s+(?:are\s+|were\s+)?liquidated|short\s+sellers\s+lose|short\s+squeeze|ликвидаци[йя]\s+шорт|вынос\s+шорт)/i, weight: 3.2, label: 'вынос/ликвидация шортов (рост)' },
  { pattern: /\b(bullish|breakout|inflow|accumulation|surge|surges|rally|rallies|massive investment|circuit breaker.*surge)\b/i, weight: 1.9, label: 'bullish flow' },
  { pattern: /(дать отскок|ждем отскок|локальный отскок)/i, weight: 1.1, label: 'ожидание отскока' },
];

/**
 * Weighted bearish phrases (Russian + English) including natural trader idioms from @ne_investor.
 */
const BEARISH_RULES: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\b(short|sell)\b(?!\s+(?:are\s+|were\s+)?liquidated|\s+sellers|\s+squeeze)/i, weight: 2.2, label: 'SHORT/SELL' },
  { pattern: /(взял шорт|открыл шорт|зашел в шорт|держим шорт|удерживаю шорт)/i, weight: 3.0, label: 'взял шорт' },
  { pattern: /(шорты в приоритете|приоритет.*шортовый|шортовый приоритет|приоритет на шорт)/i, weight: 3.0, label: 'приоритет шортовый' },
  { pattern: /(продолжает снижение|продолжает двигаться в нисходящем тренде|нисходящем тренде|продавец очень сильный|продажи очень сильные)/i, weight: 2.6, label: 'сильный продавец / снижение' },
  { pattern: /(покупатели.*держатся из последних сил|уровень уже слабый|в пробой уровня.*продажи)/i, weight: 2.2, label: 'слабость покупателей' },
  { pattern: /(упал ниже|провалился ниже|провалимся еще ниже|не собирается расти|пока не собирается расти)/i, weight: 2.5, label: 'пробой вниз / слабость' },
  { pattern: /(longs?\s+(?:are\s+|were\s+)?liquidated|ликвидаци[йя]\s+лонг|longs rekt)/i, weight: 2.8, label: 'ликвидации лонгов' },
  { pattern: /(чистый недельный отток|идут оттоки|крипта льется|настоящая распродажа|рынок обвалился|попали под распродажу|продавить рыночек|continues to crash|falls under|plunge|selloff)/i, weight: 2.4, label: 'оттоки / распродажа' },
  { pattern: /\b(bearish|outflow|dump|crash)\b/i, weight: 2.0, label: 'bearish flow' },
  { pattern: /(?<!shorts?\s+(?:are\s+|were\s+)?)(?<!шортов\s)\bliquidated\b/i, weight: 1.4, label: 'liquidation pressure' },
];

export interface NewsHeadlineRiskAssessment {
  isCriticalRisk: boolean;
  severity: 'HIGH' | 'MEDIUM' | 'NONE';
  directionImpact: 'BEARISH' | 'BULLISH' | 'NEUTRAL';
  tag?: string;
}

/**
 * Classifies critical security, delisting, regulatory, or sharp market-shock headlines
 * so pre-trade policy can block risky entries on affected symbols.
 */
export function classifyHeadlineRisk(text: string): NewsHeadlineRiskAssessment {
  const raw = String(text || '').trim();
  if (!raw) return { isCriticalRisk: false, severity: 'NONE', directionImpact: 'NEUTRAL' };

  if (/(hack(ed)?|exploit(ed)?|drained|delist(ing|ed)?|bankrupt|insolven|sec sues|trading halt|взлом|делистинг|банкрот|остановк[аи]\s+торгов)/i.test(raw)) {
    return {
      isCriticalRisk: true,
      severity: 'HIGH',
      directionImpact: 'BEARISH',
      tag: 'CRITICAL_SECURITY_OR_DELIST_RISK',
    };
  }

  if (/(continues to crash|market crash|flash crash|falls under|обвалил(ся|ось)|резкий пролив|распродажа)/i.test(raw)) {
    return {
      isCriticalRisk: false,
      severity: 'MEDIUM',
      directionImpact: 'BEARISH',
      tag: 'MARKET_SELLOFF_PRESSURE',
    };
  }

  if (/(shorts?\s+(?:are\s+|were\s+)?liquidated|short\s+squeeze|etf\s+inflow|massive\s+inflow|surges|вынос\s+шорт)/i.test(raw)) {
    return {
      isCriticalRisk: false,
      severity: 'MEDIUM',
      directionImpact: 'BULLISH',
      tag: 'BULLISH_SQUEEZE_OR_INFLOW',
    };
  }

  return { isCriticalRisk: false, severity: 'NONE', directionImpact: 'NEUTRAL' };
}

/**
 * Detects all whitelisted crypto symbols mentioned in the text, in order of appearance.
 */
export function detectAllSymbolsInText(text: string): string[] {
  const found: Array<{ symbol: string; index: number }> = [];
  for (const [regex, sym] of SYMBOL_PATTERNS) {
    const match = regex.exec(text);
    if (match && WHITELISTED_SYMBOLS.has(sym)) {
      found.push({ symbol: sym, index: match.index });
    }
  }

  // Also check generic hashtags like #SOLUSDT or $AVAX
  const tagMatches = [...text.toUpperCase().matchAll(/[#\$]([A-Z]{2,8}?)(?:USDT)?\b/g)];
  for (const m of tagMatches) {
    const candidate = `${m[1]}USDT`;
    if (WHITELISTED_SYMBOLS.has(candidate) && !found.some((f) => f.symbol === candidate)) {
      found.push({ symbol: candidate, index: m.index ?? 9999 });
    }
  }

  found.sort((a, b) => a.index - b.index);
  return Array.from(new Set(found.map((f) => f.symbol)));
}

/**
 * Extracts explicit Entry, Stop-Loss, Take-Profit, or "$75к / $82к" reference levels from signal text.
 */
export function extractPriceLevelsFromText(text: string): {
  entryPrice?: number;
  stopLoss?: number;
  tp1?: number;
  referenceLevel?: number;
} {
  const parseNum = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
    const val = parseFloat(cleaned);
    return Number.isFinite(val) && val > 0 ? val : undefined;
  };

  const entryMatch = text.match(/(?:entry|вход|по цене|от)\s*[:=-]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const slMatch = text.match(/(?:stop\s*loss|sl|стоп(?:-лосс)?)\s*[:=-]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const tpMatch = text.match(/(?:take\s*profit|tp1?|тейк|цель)\s*[:=-]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i);

  // Russian shorthand levels like "$75к", "$76k", "$82к", "$77 000" (note: \b does not match after Cyrillic 'к')
  let referenceLevel: number | undefined;
  const kMatch = text.match(/\$\s*([0-9]{1,3}(?:[.,][0-9]+)?)\s*(?:к|k)(?![а-яa-z0-9])/i);
  if (kMatch && kMatch[1]) {
    const base = parseFloat(kMatch[1].replace(',', '.'));
    if (Number.isFinite(base) && base > 0) {
      referenceLevel = base * 1000;
    }
  } else {
    const thousandsMatch = text.match(/\$\s*([0-9]{2,3}\s+[0-9]{3})\b/);
    if (thousandsMatch && thousandsMatch[1]) {
      referenceLevel = parseNum(thousandsMatch[1]);
    }
  }

  return {
    entryPrice: parseNum(entryMatch?.[1]),
    stopLoss: parseNum(slMatch?.[1]),
    tp1: parseNum(tpMatch?.[1]),
    referenceLevel,
  };
}

/**
 * Parses a single Telegram post (from HTML scraping or API) into a structured trading signal.
 * Marks conversational, promotional, or off-topic posts with `isActionableSignal = false`.
 */
export function parseTelegramSignalPost(
  rawInput: string,
  options?: { postId?: string; publishedAt?: number; fallbackSymbol?: string }
): ParsedTelegramPostSignal {
  const cleaned = rawInput
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#036;/g, '$')
    .replace(/&#33;/g, '!')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s+/g, ' ')
    .trim();

  const fallbackSymbol = options?.fallbackSymbol || 'BTCUSDT';

  if (cleaned.length < 18) {
    return {
      postId: options?.postId,
      publishedAt: options?.publishedAt,
      rawText: cleaned,
      isActionableSignal: false,
      skipReason: 'Короткое информационное сообщение без торгового сетапа',
      symbol: fallbackSymbol,
      mentionedSymbols: [],
      side: 'LONG',
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
      extractedLevels: {},
      matchedBullPhrases: [],
      matchedBearPhrases: [],
    };
  }

  for (const offPattern of OFF_TOPIC_PATTERNS) {
    if (offPattern.test(cleaned)) {
      return {
        postId: options?.postId,
        publishedAt: options?.publishedAt,
        rawText: cleaned,
        isActionableSignal: false,
        skipReason: 'Нерыночный/бытовой пост канала (отфильтрован NLP-фильтром)',
        symbol: fallbackSymbol,
        mentionedSymbols: [],
        side: 'LONG',
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        extractedLevels: {},
        matchedBullPhrases: [],
        matchedBearPhrases: [],
      };
    }
  }

  // Handle cautious wait / past-closed-position posts so they don't trigger false entries
  if (
    /руки чешутся лонги набирать.*пока подожду/i.test(cleaned) ||
    /хорошо, что закрыл вчера лонги/i.test(cleaned) ||
    /крупнейшие криптобиржи одна за другой ограничивают/i.test(cleaned) ||
    /mexc уходит из рф/i.test(cleaned) ||
    /спасибо за инфу, прошёл обучение/i.test(cleaned) ||
    /подвели итоги октября в клубе/i.test(cleaned)
  ) {
    return {
      postId: options?.postId,
      publishedAt: options?.publishedAt,
      rawText: cleaned,
      isActionableSignal: false,
      skipReason: 'Обзорный/ретроспективный пост без сигнала на вход',
      symbol: fallbackSymbol,
      mentionedSymbols: [],
      side: 'LONG',
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
      extractedLevels: {},
      matchedBullPhrases: [],
      matchedBearPhrases: [],
    };
  }

  const mentionedSymbols = detectAllSymbolsInText(cleaned);
  const extractedLevels = extractPriceLevelsFromText(cleaned);

  let bullScore = 0;
  let bearScore = 0;
  const matchedBullPhrases: string[] = [];
  const matchedBearPhrases: string[] = [];

  for (const rule of BULLISH_RULES) {
    if (rule.pattern.test(cleaned)) {
      bullScore += rule.weight;
      matchedBullPhrases.push(rule.label);
    }
  }

  for (const rule of BEARISH_RULES) {
    if (rule.pattern.test(cleaned)) {
      bearScore += rule.weight;
      matchedBearPhrases.push(rule.label);
    }
  }

  // Emoji directional cues used in Russian Telegram channels (📉 vs 🚀/📈)
  if (cleaned.includes('📉') || cleaned.includes('🔻') || cleaned.includes('🔴')) {
    bearScore += 0.8;
  }
  if (cleaned.includes('🚀') && !/в нашем канале по золоту/i.test(cleaned)) {
    bullScore += 0.6;
  }

  const totalDirectionalWeight = bullScore + bearScore;
  const netScore = bullScore - bearScore;

  // Require clear market/trading intent
  if (totalDirectionalWeight < 1.5 || Math.abs(netScore) < 0.7) {
    return {
      postId: options?.postId,
      publishedAt: options?.publishedAt,
      rawText: cleaned,
      isActionableSignal: false,
      skipReason: 'Нейтральный пост без выраженного направления LONG/SHORT',
      symbol: mentionedSymbols[0] || fallbackSymbol,
      mentionedSymbols,
      side: 'LONG',
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
      extractedLevels,
      matchedBullPhrases,
      matchedBearPhrases,
    };
  }

  const primarySymbol = mentionedSymbols[0] || fallbackSymbol;
  const isBullish = netScore > 0;
  const side: 'LONG' | 'SHORT' = isBullish ? 'LONG' : 'SHORT';
  const sentiment: 'BULLISH' | 'BEARISH' = isBullish ? 'BULLISH' : 'BEARISH';

  const rawMagnitude = Math.min(0.94, 0.56 + Math.abs(netScore) * 0.1);
  const sentimentScore = Number((isBullish ? rawMagnitude : -rawMagnitude).toFixed(2));

  return {
    postId: options?.postId,
    publishedAt: options?.publishedAt,
    rawText: cleaned.slice(0, 360),
    isActionableSignal: true,
    symbol: primarySymbol,
    mentionedSymbols: mentionedSymbols.length > 0 ? mentionedSymbols : [primarySymbol],
    side,
    sentiment,
    sentimentScore,
    extractedLevels,
    matchedBullPhrases,
    matchedBearPhrases,
  };
}

/**
 * Extracts all messages from a Telegram web preview HTML document (`https://t.me/s/<channel>`)
 * and returns parsed actionable signals in reverse-chronological order (newest first).
 */
export function extractSignalsFromTelegramWebHtml(
  html: string,
  channelSlug: string
): ParsedTelegramPostSignal[] {
  const results: ParsedTelegramPostSignal[] = [];

  // Split by individual message blocks so image-only posts never bleed into the next message's text/time
  const blocks = html.split(/(?=<div class="tgme_widget_message\b)/i);
  for (const block of blocks) {
    const postMatch = block.match(/data-post="[^"/]+\/(\d+)"/i);
    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch || !textMatch[1]) continue;

    const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/i);
    const postId = postMatch?.[1] ? `${channelSlug}/${postMatch[1]}` : undefined;
    const publishedAt = timeMatch?.[1] ? Date.parse(timeMatch[1]) : undefined;

    const parsed = parseTelegramSignalPost(textMatch[1], {
      postId,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
    });
    if (parsed.isActionableSignal) {
      results.push(parsed);
    }
  }

  if (results.length === 0) {
    const msgRegex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const matches = [...html.matchAll(msgRegex)];
    matches.forEach((m, idx) => {
      const parsed = parseTelegramSignalPost(m[1], {
        postId: `${channelSlug}/idx-${idx}`,
      });
      if (parsed.isActionableSignal) {
        results.push(parsed);
      }
    });
  }

  return results.reverse();
}
