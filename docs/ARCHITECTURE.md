# Целевая архитектура ZIMA-TRADE-AI

## Поток данных и разделение ответственности

```text
[OKX V5 Public WS/REST]
   └─▶ src/lib/okx-market-data.ts (freshness, completeness, closed bars only)
   └─▶ src/lib/okx-instrument-registry.ts (live SWAP specs: ctVal, lotSz, minSz, tickSz)
           │
           ▼
[Strategies, MTF 1m–1D & AI Coordinator Contract] (mtf-context.ts, strategy-contracts.ts, ai-strategy-conductor.ts)
   └─▶ Контекст 1m–1D по закрытым свечам + контракт v1.0 (AI не может обходить риск или включать DCA)
           │
           ▼
[Virtual Portfolios, Ownership & Global Risk] (virtual-portfolio.ts, portfolio-ledger.ts, position-ownership.ts, global-risk-manager.ts)
   └─▶ Phase === READY, net_mode single owner, totalOpenStopRisk <= 4.5%, DCA === OFF
           │
           ▼
[Single OKX Execution Service] (src/lib/okx-execution-service.ts + server.ts)
   └─▶ clOrdId → submit → lookup-on-timeout → /api/v5/trade/order fills → SL algo verify → exchangeOrders
           │
           ▼
[OKX V5 Exchange Account (Single Truth)]

[Isolated Shadow & Python ML Contour] (src/lib/shadow-learning.ts + zima_trade_ai/*)
   └─▶ ALLOW_PYTHON_LIVE_EXECUTION=False, DCA_ENABLED=False, SHADOW_LEARNING_ONLY=True, autoAppliedToProduction=False
   └─▶ VirtualMatchingEngine (OKX 0.05% taker), ONNX/LGBM/RL research & evaluation reports only
```

## Границы владения

- **TypeScript (`server.ts`, `src/lib/*`)** — единственный владелец LIVE-цикла, реального OKX исполнения, сверки и защитных ордеров.
- **Python (`zima_trade_ai/*`)** — изолированный аналитический, ML и Shadow-контур. Не имеет права открывать LIVE-ордера или заявлять LIVE reconciliation.
- **OKX V5** — единственный источник истины о балансе, открытых позициях, ордерах и защитных Algo SL/TP.
