# ZimaTrade AI — Автономный комплекс криптотрейдинга

Автономный программный комплекс для анализа криптовалютного рынка в реальном времени (Спот и Бессрочные Фьючерсы), парсинга сигналов из Telegram-каналов и новостных лент, симуляции стратегий по живому стакану L2-50 и автоматизированной торговли под управлением ИИ.

## Целевые биржи
* **Bybit (API v5)**: Основной фьючерсный шлюз и ликвидность.
* **OKX / Bitget**: Резервный фьючерсный контур.
* **MEXC**: Спот 0% комиссии и сканирование L2 стакана пампов.

## Принцип двух режимов
1. **Режим 1 — Обучение (Shadow Mode / Forward Testing)**: Полный запрет на исторические бэктесты и демо-счета. Торговля в реальном времени по живому стакану L2-50 с учетом RTT пинга ($t_0 + \text{RTT} + 20\text{ms}$), очереди лимитных заявок (`volume_passed > queue_ahead`), реального VWAP проскальзывания, Taker/Maker комиссий и ставок фандинга.
2. **Режим 2 — Боевой (Live Mode)**: Исполнение реальных ордеров под защитой неизменяемого процедурного риск-менеджера (Risk Management Firewall: Isolated Margin, 1.5% max risk, 5% rolling 24h Kill-Switch, Funding Guard, Spread Guard).

## Распределение узлов
* **Node A (Cloud.ru Linux VM, 2 vCPU, 4GB RAM)**: Process 1 (vCPU 0: WebSocket, SharedMemory, L2-50, Virtual Matching, ONNX CPU), Process 2 (vCPU 1: SQLite WAL, Parquet, Telethon, DuckDB, FastAPI).
* **Node B (Home PC, 8GB GPU)**: Обучение PyTorch RL (PPO/SAC) и LSTM, экспорт ONNX с манифестом SHA256.
* **Node C (Cloud Ollama API)**: 20b/30b для парсинга сигналов в Pydantic JSON, 120b/ultra для макро-аналитики.
* **Node D (Ollama Cloud API - https://docs.ollama.com/cloud)**: Векторная память (RAG), bge-m3 эмбеддинги.
* **Node E (Cloudflare Tunnel + Worker)**: Zero-Trust веб-терминал, 1-мин Dead-Man's Switch.

## Запуск тестов
```bash
pytest zima_trade_ai/tests/
```
