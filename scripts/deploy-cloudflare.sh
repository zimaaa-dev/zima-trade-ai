#!/usr/bin/env bash
# ============================================================================
# ZIMA-TRADE-AI v4.0 — Развертывание Узла 3: Cloudflare Watchdog & Geo-Proxy
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/../zima_trade_ai/watchdog_cf" && pwd)"

echo "======================================================================"
echo "🌐 [ZIMA-TRADE-AI] Развертывание Cloudflare Worker (Watchdog & Proxy)"
echo "📍 Целевой адрес Node A: http://194.113.34.230:3000/api/system/health"
echo "======================================================================"

cd "$WORKER_DIR"

if ! command -v wrangler >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
  echo "📥 Установка Wrangler CLI..."
  npm install -g wrangler
fi

WRANGLER_BIN="npx wrangler"
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER_BIN="wrangler"
fi

echo "🔐 Проверка авторизации в Cloudflare..."
$WRANGLER_BIN whoami || {
  echo "🔑 Выполните вход в аккаунт Cloudflare:"
  $WRANGLER_BIN login
}

echo "🚀 Деплой Cloudflare Worker zima-trade-watchdog..."
$WRANGLER_BIN deploy

echo "======================================================================"
echo "🎉 Cloudflare Worker успешно развернут!"
echo "• Cron: каждую минуту проверяет статус Node A (Dead-Man's Switch)"
echo "• Bybit Proxy: https://zima-trade-watchdog.<subdomain>.workers.dev/bybit/"
echo "• Telegram Proxy: https://zima-trade-watchdog.<subdomain>.workers.dev/telegram/"
echo "======================================================================"
