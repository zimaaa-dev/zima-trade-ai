#!/usr/bin/env bash
# ============================================================================
# ZimaTrade AI — Скрипт полного сброса системы и торговой статистики к $10,000 USDT
# ============================================================================
set -euo pipefail

echo "🔄 [ZimaTrade AI] Запуск процедуры полного сброса к заводскому состоянию ($10,000 USDT)..."

# 1. Попытка сброса через локальный REST API сервера (если запущен)
RESET_SUCCESS=0
if curl -sS -f -X POST http://127.0.0.1:3000/api/system/factory-reset >/dev/null 2>&1; then
  echo "✅ REST API: Торговая статистика, PnL, сделки и позиции успешно обнулены."
  echo "✅ Баланс установлен на ровно $10,000.00 USDT, Kill-Switch деактивирован."
  RESET_SUCCESS=1
fi

# 2. Прямой сброс файла состояния на диске data/runtime_state.json для 100% гарантии
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
STATE_FILE="$DATA_DIR/runtime_state.json"

mkdir -p "$DATA_DIR"

NOW_MS=$(date +%s%3N 2>/dev/null || node -e 'console.log(Date.now())')

cat <<EOF > "$STATE_FILE"
{
  "savedAt": $NOW_MS,
  "capitalUsdt": 10000.0,
  "rolling24hPnlUsdt": 0.0,
  "totalRealizedPnlUsdt": 0.0,
  "isKillSwitchActive": false,
  "killSwitchTriggerReason": null,
  "lastUnblockedAt": $NOW_MS,
  "botTradingEnabled": true,
  "activePositions": [],
  "limitOrdersQueue": [],
  "closedTrades": [],
  "walletLedger": [
    {
      "id": "led-init-$NOW_MS",
      "timestamp": $NOW_MS,
      "type": "DEPOSIT_RESET",
      "amountUsdt": 10000.0,
      "balanceAfterUsdt": 10000.0,
      "description": "Чистый старт торговой системы ZimaTrade AI: базовый баланс $10,000.00 USDT",
      "mode": "SHADOW"
    }
  ],
  "botTradeLogs": [],
  "xaiDecisions": []
}
EOF

echo "✅ Файл $STATE_FILE перезаписан: 0 сделок, 0 открытых позиций, баланс $10,000.00 USDT."

# 3. Перезапуск процесса PM2 если доступен
if command -v pm2 >/dev/null 2>&1; then
  echo "🔄 Перезапуск процесса zima-core в PM2..."
  pm2 restart zima-core || true
fi

echo "🎉 Полный сброс завершен! Терминал готов к работе с чистого листа."
