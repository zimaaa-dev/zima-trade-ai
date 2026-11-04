#!/bin/bash
# ==============================================================================
# ZimaTrade AI — macOS Quick Bybit Verification Runner
# Usage on Mac:
#   chmod +x scripts/verify_bybit.sh
#   ./scripts/verify_bybit.sh [SERVER_URL] [SYMBOL]
# ==============================================================================

SERVER_URL="${1:-https://stories-feof-trains-chip.trycloudflare.com}"
SYMBOL="${2:-BTCUSDT}"

command -v python3 >/dev/null 2>&1 || {
  echo "❌ Ошибка: python3 не найден. Установите Python 3 или Command Line Tools (xcode-select --install)."
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/verify_bybit_live.py"

if [ ! -f "$PYTHON_SCRIPT" ]; then
  echo "📥 Загрузка последней версии скрипта проверки..."
  curl -sSL "${SERVER_URL}/scripts/verify_bybit_live.py" -o /tmp/verify_bybit_live.py || \
  curl -sSL "https://raw.githubusercontent.com/zimaaa-dev/zima-trade-ai/main/scripts/verify_bybit_live.py" -o /tmp/verify_bybit_live.py
  PYTHON_SCRIPT="/tmp/verify_bybit_live.py"
fi

python3 "$PYTHON_SCRIPT" --url "$SERVER_URL" --symbol "$SYMBOL" "${@:3}"
