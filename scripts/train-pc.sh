#!/usr/bin/env bash
# ============================================================================
# ZIMA-TRADE-AI v4.0 — Скрипт обучения ИИ на домашнем ПК (Node B: Trainer Forge)
# Использование: bash scripts/train-pc.sh [URL_СЕРВЕРА] [КОЛИЧЕСТВО_ЭПОХ]
# Пример: bash scripts/train-pc.sh http://194.113.34.230:3000 15
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

CLOUD_RU_URL="${1:-http://127.0.0.1:3000}"
EPOCHS="${2:-15}"

echo "🧠 [ZIMA-TRADE-AI] Запуск сессии квант-обучения (целевой сервер: $CLOUD_RU_URL, эпох: $EPOCHS)..."

# 1. Синхронизация свежего кода из GitHub (если это git репозиторий)
if [ -d ".git" ]; then
  echo "🔄 Проверка свежих коммитов в ветке main..."
  git pull --ff-only || true
fi

# 2. Подготовка виртуального окружения Python
if command -v python3 >/dev/null 2>&1; then
  if [ ! -d ".venv" ]; then
    echo "📦 Создание виртуального окружения .venv..."
    python3 -m venv .venv
  fi
  
  # Активация окружения (кроссплатформенно)
  if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
  elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
  fi

  # Проверка библиотек
  if ! python3 -c "import torch, numpy, requests" >/dev/null 2>&1; then
    echo "⬇️ Установка зависимостей PyTorch, ONNX, NumPy..."
    pip install --upgrade pip
    pip install torch onnx numpy requests
  fi

  # 3. Запуск нейро-тренажера
  echo "🚀 Запуск локального тренажера scripts/train_pc.py..."
  python3 scripts/train_pc.py --server "$CLOUD_RU_URL" --epochs "$EPOCHS"
else
  echo "❌ Python 3 не обнаружен. Установите Python 3 с официального сайта: https://www.python.org/downloads/"
  exit 1
fi
