import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTelegramSignalPost,
  parseMarketNewsHeadline,
  extractSignalsFromTelegramWebHtml,
  extractNewsItemsFromTelegramWebHtml,
  parseRssOrAtomFeedXml,
  detectAllSymbolsInText,
  classifyHeadlineRisk,
} from './telegram-signal-parser';

test('parseTelegramSignalPost accurately parses real @ne_investor SOL & XRP LONG signals', () => {
  const solPost =
    'Сейчас хорошая точка зайти в бот по SOL, NVIDIA, XAU У меня бот сейчас в минусе, но у вас будет отличная точка входа. SOLANA XAUt (золото) NVIDIA Все боты.';
  const parsedSol = parseTelegramSignalPost(solPost, { postId: 'ne_investor/15314' });
  assert.equal(parsedSol.isActionableSignal, true);
  assert.equal(parsedSol.symbol, 'SOLUSDT');
  assert.equal(parsedSol.side, 'LONG');
  assert.equal(parsedSol.sentiment, 'BULLISH');
  assert.ok(parsedSol.sentimentScore >= 0.7);

  const xrpPost =
    'Олег, спасибо за твой кол на XRP, заходил в лонг еще месяц назад и сеткой все качели поймал 45% за 35 дней и от тренда еще 15% сверху. кайфую от идеи вот этой сетки';
  const parsedXrp = parseTelegramSignalPost(xrpPost, { postId: 'ne_investor/15312' });
  assert.equal(parsedXrp.isActionableSignal, true);
  assert.equal(parsedXrp.symbol, 'XRPUSDT');
  assert.equal(parsedXrp.side, 'LONG');
  assert.equal(parsedXrp.sentiment, 'BULLISH');
});

test('parseTelegramSignalPost accurately parses real @ne_investor BTC SHORT signals and price levels', () => {
  const btcShort1 =
    'Доброе утро ☀️ За время текущего падения на рынке более $1млрд ликвидаций лонгов, Трампа, его компании и семью начали проверять... Из-за этого негатива $BTC и упал ниже $75к и пока не собирается расти ❗️';
  const res1 = parseTelegramSignalPost(btcShort1, { postId: 'ne_investor/15307' });
  assert.equal(res1.isActionableSignal, true);
  assert.equal(res1.symbol, 'BTCUSDT');
  assert.equal(res1.side, 'SHORT');
  assert.equal(res1.sentiment, 'BEARISH');
  assert.ok(res1.sentimentScore <= -0.7);
  assert.equal(res1.extractedLevels.referenceLevel, 75000);

  const btcShort2 =
    'Взял шорт в пробой уровня, продажи очень сильные, а уровень уже слабый ‼️ • Торгую на бирже BYBIT';
  const res2 = parseTelegramSignalPost(btcShort2, { postId: 'ne_investor/15290' });
  assert.equal(res2.isActionableSignal, true);
  assert.equal(res2.symbol, 'BTCUSDT');
  assert.equal(res2.side, 'SHORT');
  assert.ok(res2.sentimentScore <= -0.8);

  const btcShort3 =
    'Крайне быстро возвращаемся к обозначенному уровню на $76к, как и писал, приоритет на основных активах шортовый 📉';
  const res3 = parseTelegramSignalPost(btcShort3, { postId: 'ne_investor/15284' });
  assert.equal(res3.isActionableSignal, true);
  assert.equal(res3.symbol, 'BTCUSDT');
  assert.equal(res3.side, 'SHORT');
  assert.equal(res3.extractedLevels.referenceLevel, 76000);

  const btcShort4 =
    'Как выросли, так и упали 📉 $BTC продолжает двигаться в нисходящем тренде, слом в районе $82к, пока мы ниже, шорты в приоритете ‼️';
  const res4 = parseTelegramSignalPost(btcShort4, { postId: 'ne_investor/15281' });
  assert.equal(res4.isActionableSignal, true);
  assert.equal(res4.symbol, 'BTCUSDT');
  assert.equal(res4.side, 'SHORT');
  assert.equal(res4.extractedLevels.referenceLevel, 82000);
});

test('parseTelegramSignalPost filters out off-topic, charity, lifestyle, and wait posts from @ne_investor', () => {
  const offTopicPosts = [
    'Ты здесь?',
    'Как вы относитесь к благотворительности?',
    'Я уже дважды проводил благотворительные сборы в поддержку коррекционного центра для детей с инвалидностью «Кубики»...',
    'Открыл для себя безалкогольное пиво🍺 Вкусно, ощущения такие же, только не пьяный и можно ехать за рулем :)',
    'Руки чешутся лонги набирать. Пока подожду. Завтра будет отчёт по рынку труда США.',
    'Как же хорошо, что закрыл вчера лонги по жирными позициям. И все докладывал вам о своих действиях',
    'Доброго дня, Олег. Напомните плиз нормальный впн) мой умер, год отработал) Я использую @vushvpnbot',
  ];

  for (const post of offTopicPosts) {
    const parsed = parseTelegramSignalPost(post);
    assert.equal(parsed.isActionableSignal, false, `Expected post to be filtered out: ${post}`);
  }
});

test('extractSignalsFromTelegramWebHtml extracts only actionable signals in newest-first order', () => {
  const sampleHtml = `
    <div class="tgme_widget_message" data-post="ne_investor/15290">
      <div class="tgme_widget_message_text">Взял шорт в пробой уровня, продажи очень сильные, а уровень уже слабый ‼️</div>
      <time datetime="2026-11-06T08:02:41+00:00"></time>
    </div>
    <div class="tgme_widget_message" data-post="ne_investor/15301">
      <div class="tgme_widget_message_text">Ты здесь?</div>
      <time datetime="2026-11-08T09:38:32+00:00"></time>
    </div>
    <div class="tgme_widget_message" data-post="ne_investor/15314">
      <div class="tgme_widget_message_text">Сейчас хорошая точка зайти в бот по SOL, NVIDIA, XAU. У вас будет отличная точка входа. SOLANA</div>
      <time datetime="2026-11-09T16:41:43+00:00"></time>
    </div>
  `;
  const signals = extractSignalsFromTelegramWebHtml(sampleHtml, 'ne_investor');
  assert.equal(signals.length, 2);
  assert.equal(signals[0].postId, 'ne_investor/15314');
  assert.equal(signals[0].symbol, 'SOLUSDT');
  assert.equal(signals[0].side, 'LONG');
  assert.equal(signals[1].postId, 'ne_investor/15290');
  assert.equal(signals[1].symbol, 'BTCUSDT');
  assert.equal(signals[1].side, 'SHORT');
  assert.deepEqual(detectAllSymbolsInText('Торгуем $SOL и #BTCUSDT'), ['SOLUSDT', 'BTCUSDT']);
});

test('parseTelegramSignalPost recognizes XAU / XAUt / Золото as XAUUSDT', () => {
  const goldPost = 'По золоту XAU (XAUt) отличная точка входа, беру лонг сеткой на откат';
  const parsed = parseTelegramSignalPost(goldPost, { postId: 'ne_investor/15400' });
  assert.equal(parsed.isActionableSignal, true);
  assert.equal(parsed.symbol, 'XAUUSDT');
  assert.equal(parsed.side, 'LONG');
});

test('WatcherGuru short-liquidation squeeze headlines classify as BULLISH and hack/crash risks are flagged accurately', () => {
  const shortSqueeze = parseTelegramSignalPost(
    'JUST IN: Bitcoin surges to $63,000 as $250,000,000 in shorts are liquidated from the crypto market.'
  );
  assert.equal(shortSqueeze.isActionableSignal, true);
  assert.equal(shortSqueeze.sentiment, 'BULLISH');
  assert.ok(shortSqueeze.sentimentScore > 0.5);

  const crashNews = parseTelegramSignalPost(
    'JUST IN: Crypto continues to crash $BTC falls under $56,000 $ETH falls under $1,550'
  );
  assert.equal(crashNews.isActionableSignal, true);
  assert.equal(crashNews.sentiment, 'BEARISH');
  assert.ok(crashNews.sentimentScore < -0.5);

  const hackRisk = classifyHeadlineRisk('ALERT: Major bridge protocol exploited and $120M drained');
  assert.equal(hackRisk.isCriticalRisk, true);
  assert.equal(hackRisk.severity, 'HIGH');
  assert.equal(hackRisk.directionImpact, 'BEARISH');
});

test('parseMarketNewsHeadline, extractNewsItemsFromTelegramWebHtml, and parseRssOrAtomFeedXml preserve macro/ETF/Fed news without LONG/SHORT keywords', () => {
  const etfInflow = parseMarketNewsHeadline(
    'BlackRock Spot Bitcoin ETF records $420M net inflows on institutional accumulation'
  );
  assert.equal(etfInflow.isRelevantNews, true);
  assert.equal(etfInflow.symbol, 'BTCUSDT');
  assert.equal(etfInflow.sentiment, 'BULLISH');
  assert.ok(etfInflow.sentimentScore > 0.4);

  const fedRatePause = parseMarketNewsHeadline(
    'Federal Reserve holds interest rates steady at 4.25%-4.50% as Powell monitors inflation'
  );
  assert.equal(fedRatePause.isRelevantNews, true);
  assert.equal(fedRatePause.sentiment, 'NEUTRAL');

  const macroBear = parseMarketNewsHeadline(
    'US SEC files lawsuit and delays spot Ethereum ETF decision amid tightening tariffs'
  );
  assert.equal(macroBear.isRelevantNews, true);
  assert.equal(macroBear.symbol, 'ETHUSDT');
  assert.equal(macroBear.sentiment, 'BEARISH');
  assert.ok(macroBear.sentimentScore < -0.4);

  const watcherHtml = `
    <div class="tgme_widget_message" data-post="WatcherGuru/9001">
      <div class="tgme_widget_message_text">Federal Reserve holds interest rates steady at 4.25%-4.50% ahead of CPI release</div>
      <time datetime="2026-11-24T10:00:00+00:00"></time>
    </div>
    <div class="tgme_widget_message" data-post="WatcherGuru/9002">
      <div class="tgme_widget_message_text">JUST IN: Spot Bitcoin ETF sees $450M inflows today</div>
      <time datetime="2026-11-24T12:00:00+00:00"></time>
    </div>
  `;
  const tgNews = extractNewsItemsFromTelegramWebHtml(watcherHtml, 'WatcherGuru');
  assert.equal(tgNews.length, 2);
  assert.equal(tgNews[0].postId, 'WatcherGuru/9002');
  assert.equal(tgNews[0].sentiment, 'BULLISH');
  assert.equal(tgNews[1].postId, 'WatcherGuru/9001');
  assert.equal(tgNews[1].sentiment, 'NEUTRAL');

  const rssXml = `
    <rss version="2.0"><channel>
      <item>
        <title><![CDATA[Bitcoin ETF inflows surge as institutions buy BTC dip]]></title>
        <description><![CDATA[Strong spot ETF demand pushes BTC sentiment higher.]]></description>
        <pubDate>Tue, 24 Nov 2026 11:30:00 +0000</pubDate>
        <link>https://www.coindesk.com/markets/btc-etf</link>
      </item>
      <item>
        <title>Fed minutes flag hawkish rate path and ETF outflow pressure on SOL</title>
        <pubDate>Tue, 24 Nov 2026 09:00:00 +0000</pubDate>
        <link>https://www.coindesk.com/markets/fed-minutes</link>
      </item>
    </channel></rss>
  `;
  const nowTs = Date.UTC(2026, 10, 24, 14, 0, 0);
  const rssItems = parseRssOrAtomFeedXml(rssXml, 'CoinDesk News RSS', 'https://coindesk.com/rss', nowTs);
  assert.equal(rssItems.length, 2);
  assert.equal(rssItems[0].publishedAt, Date.UTC(2026, 10, 24, 11, 30, 0));
  assert.equal(rssItems[0].sentiment, 'BULLISH');
  assert.equal(rssItems[1].sentiment, 'BEARISH');

  const etfOutflowRecord = parseMarketNewsHeadline(
    'Bitcoin drops as November spot ETF outflows increase to record $4.71 billion'
  );
  assert.equal(etfOutflowRecord.sentiment, 'BEARISH');
  assert.ok(etfOutflowRecord.sentimentScore < -0.4);

  const handsBackGains = parseMarketNewsHeadline(
    "Bitcoin hands back Monday's Nvidia-driven gains, liquidations triple"
  );
  assert.equal(handsBackGains.sentiment, 'BEARISH');

  const personalWalletRisk = classifyHeadlineRisk(
    'Crypto trader Ansem says his wallet was hacked as $2 million in memecoins were sold'
  );
  assert.equal(personalWalletRisk.isCriticalRisk, false);
});

