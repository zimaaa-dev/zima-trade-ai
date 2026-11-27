# План реализации адаптации ZIMA-TRADE-AI

## Этап 1. Безопасность и изоляция исполнения (P0 — Выполнен)
- `src/lib/runtime-config.ts` — инварианты режима, trial risk limits, запрет DCA и Python LIVE.
- `src/lib/okx-market-data.ts` — запрет Bybit/synthetic fallback в OKX LIVE, проверка свежести стакана и закрытых свечей.
- `src/lib/okx-instrument-registry.ts` — строгий каталог OKX SWAP, блокировка торговли без подтверждённых спецификаций.
- `src/lib/okx-execution-service.ts` — жизненный цикл заявки с `clOrdId`, lookup при таймауте, фактическими fill (`accFillSz`, `avgPx`, `fee`) и проверкой SL.
- `src/lib/trade-reconciliation.ts` — gate `RECOVERY -> READY / DEGRADED`, фиксация `ORPHANED` позиций без авто-закрытия.
- `zima_trade_ai/*` — блокировка `LIVE` и `DCA` в Python, отключение Bybit DCP-заглушки, комиссия OKX 0.05%.

## Этап 2. Виртуальные портфели и единый риск (Выполнен)
- Выделены независимые модули `src/lib/virtual-portfolio.ts`, `src/lib/portfolio-ledger.ts`, `src/lib/position-ownership.ts`, `src/lib/global-risk-manager.ts`.
- Учёт 6 виртуальных портфелей ботов поверх единого аккаунта OKX с проверкой конфликта владения в `net_mode`, совокупного open stop-risk и REST API (`/api/portfolios`, `/api/portfolios/allocations`).

## Этап 3. Полное отключение DCA (P0 — Выполнен)
- `dcaEnabled: false` закреплён в `buildTrendGridPlan`, `server.ts`, `POST /api/bots/config`, `executeRealOkxLiveAddQty` и `zima_trade_ai`.
- Удалена ветка доборов `SO1/SO2` в `runBotEngineCycle`, сохранены TP, безубыток, trailing stop и ROI/time-stop выходы.

## Этап 4. MTF и независимые стратегии (Выполнен)
- Внедрён `src/lib/mtf-context.ts` (MTF Context Service `1m–1D` только на закрытых свечах + `/api/mtf/context`).
- Внедрён `src/lib/strategy-contracts.ts` (единый контракт сигналов и валидация `AI Coordinator Contract v1.0` без возможности обхода риска или включения DCA).

## Этап 5. Shadow Learning и Python ML (Выполнен)
- Реализовано строгое разделение `Production Strategy`, `Shadow Candidate`, `Evaluation Report` в `src/lib/shadow-learning.ts` и API `/api/shadow/*` без авто-мутации боевых параметров.
- Python-контур (`zima_trade_ai/*`) изолирован в режиме `SHADOW_LEARNING_ONLY=True` и `ALLOW_PYTHON_LIVE_EXECUTION=False`.

## Этап 6. Интерфейс и эксплуатация (Выполнен)
- Виртуальные портфели, управление долями и леджер выведены в `WalletPortfolioView`.
- Статус фазы (`READY`/`RECOVERY`/`DEGRADED`), `DCA=OFF`, совокупный стоп-риск, блокировки владения и Kill-Switch policy выведены в `RiskFirewallView`.
- Shadow Learning кандидаты и отчёты (`KEEP`/`REJECT`/`EXTEND_TEST`) выведены в `AiArenaView`.
- MTF (`1m–1D`) и AI Coordinator Contract v1.0 выведены в `IntelligenceView`; топология OKX Single Owner обновлена в `TopologyView`.
