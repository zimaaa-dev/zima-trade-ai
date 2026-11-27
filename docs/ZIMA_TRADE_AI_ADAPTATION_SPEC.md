# Техническое задание на адаптацию ZIMA-TRADE-AI

**Целевая архитектура:** автономная мультистратегийная система торговли OKX Futures с ИИ-координацией, виртуальными портфелями и единым исполнительным контуром на TypeScript.

## Зафиксированные архитектурные решения

| Параметр | Решение | Статус в коде |
| --- | --- | --- |
| Биржа | OKX Futures (`USDT-SWAP`) | Зафиксировано (`ACTIVE_EXCHANGE = OKX`) |
| Аккаунты | Один основной аккаунт (`single`) | Зафиксировано |
| Исполнитель LIVE | Единый TypeScript-контур (`server.ts` + `okx-execution-service.ts`) | Реализовано (Stage 1) |
| Разделение капитала | Виртуальные портфели (`virtual`) | Целевая модель (Stage 2) |
| Обучение | Shadow Learning — без авто-мутации активных параметров | Зафиксировано (`SHADOW_ONLY`) |
| DCA / Safety Orders (`SO1/SO2`) | Полностью выключены (`off`) | Реализовано (Stage 3 P0) |
| Python-контур | Изолированный Shadow / ML / аналитика (`ALLOW_PYTHON_LIVE_EXECUTION=False`) | Реализовано (Stage 1) |

## Реализованный контур безопасности (Stage 1 + Stage 3 P0)

1. **Единый владелец реального исполнения (`OKX`):**
   - В режиме `LIVE` при `ACTIVE_EXCHANGE=OKX` запрещены любые fallback на Bybit, MEXC или синтетические свечи (`okx-market-data.ts`).
   - Перед входом проверяются: свежесть L2 стакана, целостность закрытых свечей (`confirm !== '0'`), подтверждённая спецификация инструмента OKX SWAP (`ctVal`, `lotSz`, `minSz`, `tickSz` через `okx-instrument-registry.ts`), и отсутствие пары в списке `ORPHANED`.
2. **Жизненный цикл реального ордера (`okx-execution-service.ts`):**
   - Генерация уникального `clOrdId`.
   - При таймауте/сетевом сбое — обязательная проверка исходной заявки в OKX по `clOrdId` до повторной отправки.
   - Получение фактических `accFillSz`, `avgPx`, `fee` через `/api/v5/trade/order` и фиксация записи в `exchangeOrders`.
   - Обязательная верификация защитного Stop-Loss (attached Algo либо резервный `/api/v5/trade/order-algo`). При неподтверждённом SL пара добавляется в `unverifiedProtectionSymbols`, новые входы блокируются.
3. **Startup Reconciliation Gate (`trade-reconciliation.ts`):**
   - При запуске и при переключении в `LIVE` контур стартует в фазе `RECOVERY`.
   - Новые сделки запрещены, пока не загружен каталог OKX SWAP и не пройдена сверка с реальными позициями OKX.
   - Неизвестные позиции на бирже не закрываются автоматически: они помечаются как `ORPHANED` и блокируют новые входы по этим символам до ручной сверки.
4. **Отключение DCA (`DCA=OFF`):**
   - `dcaEnabled: false` зафиксировано в `runtime-config.ts`, `server.ts`, `POST /api/bots/config` (HTTP 400 при попытке включить), `executeRealOkxLiveAddQty` и `zima_trade_ai`.
   - Открытие происходит единым базовым ордером (`baseOrderQty = 100%`, `safetyOrders = []`). Частичное закрытие, TP, безубыток и trailing stop продолжают работать.
