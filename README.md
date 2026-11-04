# ZIMA-TRADE-AI v4.0 — Autonomous Crypto Quant & AI Bot Arena

Автономный алгоритмический комплекс для высокочастотного анализа стакана **L2-50**, парсинга новостных потоков и Telegram-каналов, самообучения ансамбля ИИ-стратегий и автоматического исполнения сделок на **Bybit API v5** (Spot & USDT Perpetual) под защитой неизменяемого процедурного **Risk Management Firewall**.

---

## Архитектура 3 узлов (Cloud.ru + Home PC + Cloudflare)

1. **Узел 1 (`Node A — web-app-prod, Cloud.ru ru.AZ-1`)**: Боевой сервер 24/7 (2 vCPU 1:10, 4 ГБ RAM, 30 ГБ SSD, Ubuntu 24.04, `194.113.34.230` / `10.0.0.5`), запущенный через `PM2` с выделенным лимитом 2048 МБ heap, подключенный к живому стакану Bybit V5, исполняющий ордера с подписью `HMAC-SHA256`, парсящий новости и отправляющий алерты в `@zimatradeai_bot`.
2. **Узел 2 (`Node B — Домашний ПК с GPU`)**: Станция периодического обучения (`scripts/train-pc.sh`, `zima_trade_ai/trainer_forge/`) для прогона эпох по историческим свечам Bybit, обучения нейросети `PyTorch PPO+LSTM`, экспорта весов в `.onnx` с манифестом `SHA-256` и локального запуска LLM через `Ollama`.
3. **Узел 3 (`Node C — Cloudflare Worker + R2`)**: Внешний сторожевой таймер живучести (`Dead-Man's Switch` каждую минуту в `zima_trade_ai/watchdog_cf/worker.js`), реверс-прокси для обхода гео-блокировок CloudFront/Bybit и Telegram с российских IP Cloud.ru, а также шлюз выгрузки архивов стакана в бесплатные 10 ГБ Cloudflare R2.

---

## Быстрый старт из GitHub

### 1. Развертывание и обновление на сервере Cloud.ru (одной командой)
```bash
git clone https://github.com/<ВАШ_ЛОГИН>/zima-trade-ai.git /opt/zima-trade-ai
cd /opt/zima-trade-ai
bash scripts/deploy-cloudru.sh
```
Скрипт `scripts/deploy-cloudru.sh` автоматически настроит умеренный сжатый своп `ZRAM` (50% RAM = 2 ГБ) без перегрузки vCPU, установит Node.js 20, прогонит все **31 предрелизный автотест** (`npm test`), соберет продакшн-бандл и запустит сервер через `PM2` с оптимальным лимитом памяти `--max-old-space-size=2048`.

### 2. Запуск обучения на домашнем ПК
```bash
git clone https://github.com/<ВАШ_ЛОГИН>/zima-trade-ai.git
cd zima-trade-ai
bash scripts/train-pc.sh http://<IP_СЕРВЕРА_CLOUD_RU>:3000
```

### 3. Деплой сторожевого модуля в Cloudflare Workers
```bash
cd zima_trade_ai/watchdog_cf
npx wrangler deploy
```

---

## Полная инструкция для ИИ и разработчиков
Полное описание математического ядра, принципов работы Risk Firewall и пошаговые инструкции по GitHub-деплою находятся в файле **[`AI_SYSTEM_INSTRUCTIONS.md`](./AI_SYSTEM_INSTRUCTIONS.md)**.
