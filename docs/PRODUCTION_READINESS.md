# Production Readiness Gate (OKX LIVE)

Переход в реальную торговлю разрешён только при выполнении всех обязательных критериев:

1. **Тесты TypeScript (`npm test`):** 100% прохождение всех unit-тестов (`src/lib/*.test.ts`), включая `stage1-safety.test.ts` и `stage2-4-5-architecture.test.ts`.
2. **Тесты Python (`npm run test:python`):** 100% прохождение изоляции LIVE/DCA, OKX комиссий (0.05%) и отсутствия auto-promotion в LIVE.
3. **Сборка и типы:** Чистое прохождение `npx tsc --noEmit`, `npm run lint` и `npm run build` без ошибок.
4. **Market Data & Specs:** `okxMarketDataHealthy === true` и `okxInstrumentCatalogVerified === true` (ни одного fallback на Bybit/synthetic в LIVE).
5. **Reconciliation Gate:** Фаза системы `READY`, `orphanedPositionsCount === 0`, `unverifiedProtectionSymbols.length === 0`.
6. **DCA Policy:** `dcaEnabled === false` во всех контурах; попытка включения через `POST /api/bots/config` отклоняется с HTTP 400.
7. **Virtual Portfolios & Ownership:** Сумма долей виртуальных портфелей ≤ 100%, сверка леджера пройдена (`reconciled: true`), `positionOwnership` соблюдает single-owner в `net_mode`, `totalOpenStopRiskPct` ≤ 4.5%.
8. **MTF & Shadow Isolation:** MTF Context (`1m–1D`) использует только закрытые свечи; Shadow Learning (`autoAppliedToProduction: false`) не мутирует боевые стратегии.
9. **OKX Demo Verification & 30-Day Shadow Gate:** Подтверждённая серия интеграционных запусков в OKX Demo (`okxDemoTrading = true`), затем не менее 30 дней непрерывного Shadow Forward Test для новых стратегий перед ручным допуском в LIVE.
