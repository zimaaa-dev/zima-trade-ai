#!/usr/bin/env bash
# ============================================================================
# ZIMA-TRADE-AI v4.0 — Скрипт обучения ИИ на домашнем ПК (Node B: Trainer Forge)
# Использование: bash scripts/train-pc.sh [URL_СЕРВЕРА_CLOUD_RU]
# Пример: bash scripts/train-pc.sh http://127.0.0.1:3000
# ============================================================================
set -euo pipefail

CLOUD_RU_URL="${1:-http://127.0.0.1:3000}"

echo "🧠 [ZIMA-TRADE-AI] Старт сессии обучения на ПК (целевой сервер: $CLOUD_RU_URL)..."

# 1. Синхронизация свежего кода из GitHub
if [ -d ".git" ]; then
  echo "🔄 Получение последних обновлений из GitHub..."
  git pull --ff-only || true
fi

# 2. Пакетное обучение квантовых весов и авто-тюнинг гиперпараметров на реальных исторических свечах Bybit
echo "📈 Этап 1: Прогон эпох обучения и калибровка гиперпараметров (Порог ИИ, ATR-SL, R:R, Спред) по свечам Bybit..."
for symbol in BTCUSDT ETHUSDT SOLUSDT; do
  echo "   -> Обучение и калибровка ботов на паре $symbol (интервал 5m, 200 свечей, учет комиссии 0.11%)..."
  curl -sS -X POST "$CLOUD_RU_URL/api/bots/train-epoch" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\": \"ALL\", \"symbol\": \"$symbol\", \"interval\": \"5\", \"limit\": 200}" | head -c 450 || echo "⚠️ Сервер $CLOUD_RU_URL недоступен"
  echo ""
  sleep 1
done

# 3. Локальное GPU-обучение PyTorch PPO+LSTM и экспорт в ONNX с SHA-256 манифестом
if command -v python3 >/dev/null 2>&1; then
  echo "🔥 Этап 2: Проверка Python / PyTorch окружения для обучения PPO+LSTM..."
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi
  source .venv/bin/activate
  if python3 -c "import torch, onnx" >/dev/null 2>&1; then
    python3 -m zima_trade_ai.trainer_forge.train_rl_pytorch
    python3 -m zima_trade_ai.trainer_forge.export_onnx
    echo "✅ Модель экспортирована в ./models/ppo_policy.onnx с криптографическим манифестом ./models/manifest.json"
  else
    echo "ℹ️ Для запуска PyTorch GPU-тренажера установите пакеты: source .venv/bin/activate && pip install torch onnx numpy"
  fi
fi

echo "✅ [ZIMA-TRADE-AI] Сессия обучения завершена!"
