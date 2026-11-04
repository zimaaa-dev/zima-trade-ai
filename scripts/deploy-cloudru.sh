#!/usr/bin/env bash
# ============================================================================
# ZIMA-TRADE-AI v4.0 — Скрипт автоматического развертывания и обновления из GitHub
# Целевой узел: Node A (web-app-prod)
# Cloud.ru Зона: ru.AZ-1
# Конфигурация: 2 vCPU (oversubscription 1:10), 4 ГБ RAM, 30 ГБ SSD
# ОС: Ubuntu 24.04 LTS
# Внутренний IP: 10.0.0.5 | Публичный IP: 194.113.34.230
# Репозиторий: https://github.com/zimaaa-dev/zima-trade-ai.git
# ============================================================================
set -euo pipefail

echo "======================================================================"
echo "🚀 [ZIMA-TRADE-AI] Старт развертывания боевого узла web-app-prod (Cloud.ru)"
echo "📍 Зона: ru.AZ-1 | Public: 194.113.34.230 | Internal: 10.0.0.5"
echo "⚙️ Ресурсы: 2 vCPU (1:10 oversub), 4GB RAM, 30GB SSD (Ubuntu 24.04 LTS)"
echo "======================================================================"

# 1. Проверка системных пакетов и ZRAM (оптимизация под 4GB RAM с учетом 1:10 vCPU)
echo "📦 1/7. Проверка базовых утилит и настройка ZRAM..."
if ! command -v curl >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y curl git build-essential
fi

if ! swapon --show | grep -q "zram"; then
  echo "⚙️ Настройка сжатого свопа ZRAM (50% RAM = 2GB, lz4)..."
  sudo apt-get update -y
  sudo apt-get install -y zram-tools
  cat << 'EOF' | sudo tee /etc/default/zramswap
ALGO=lz4
PERCENT=50
PRIORITY=100
EOF
  sudo systemctl restart zramswap || true
  echo "✅ ZRAM активирован (2GB буфер)"
else
  echo "✅ ZRAM уже активен"
fi

# 2. Проверка Node.js 20+ LTS
echo "📦 2/7. Проверка среды выполнения Node.js..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
  echo "📥 Установка Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "✅ Node.js: $(node -v), npm: $(npm -v)"

# 3. Переход в каталог проекта или клонирование репозитория
echo "🔄 3/7. Проверка репозитория проекта..."
REPO_URL="https://github.com/zimaaa-dev/zima-trade-ai.git"

if [ -d ".git" ]; then
  echo "🔄 Обновление текущего репозитория (git pull)..."
  git pull --ff-only || echo "⚠️ Локальные изменения сохранены, пропуск git pull"
elif [ -d "zima-trade-ai/.git" ]; then
  cd zima-trade-ai
  echo "🔄 Обновление репозитория в zima-trade-ai/ (git pull)..."
  git pull --ff-only || echo "⚠️ Локальные изменения сохранены, пропуск git pull"
else
  echo "📥 Клонирование $REPO_URL..."
  git clone "$REPO_URL" zima-trade-ai
  cd zima-trade-ai
fi

# 4. Проверка и создание .env
echo "⚙️ 4/7. Проверка конфигурации .env..."
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "⚠️ Создан .env из .env.example."
  else
    cat << 'EOF' > .env
PORT=3000
NODE_ENV=production
BYBIT_TESTNET=true
EOF
    echo "⚠️ Создан базовый .env файл."
  fi
  echo "💡 Не забудьте указать ваши BYBIT_API_KEY и BYBIT_API_SECRET в .env при необходимости боевой торговли."
fi

# 5. Установка npm зависимостей, автотесты и сборка
echo "📦 5/7. Установка npm зависимостей..."
npm install --legacy-peer-deps || npm install --force

echo "🧪 6/7. Запуск обязательных предрелизных автотестов (Risk Firewall, OBI, VWAP, Bybit V5)..."
npm test

echo "🏗️ Сборка фронтенда терминала..."
npm run build

# 6. Настройка Firewall (UFW) для порта 3000
if command -v ufw >/dev/null 2>&1; then
  if sudo ufw status | grep -q "Status: active"; then
    echo "🛡️ Открытие порта 3000 в UFW..."
    sudo ufw allow 3000/tcp || true
  fi
fi

# 7. Запуск процесса zima-core через PM2 (выделено 2GB heap под Node.js из 4GB RAM)
echo "🛡️ 7/7. Запуск сервиса через PM2..."
if ! command -v pm2 >/dev/null 2>&1; then
  echo "📥 Установка PM2..."
  sudo npm install -g pm2 2>/dev/null || npm install -g pm2 2>/dev/null || true
fi

PM2_BIN="pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  PM2_BIN="npx pm2"
fi

if $PM2_BIN list | grep -q "zima-core"; then
  echo "🔄 Перезапуск существующего процесса zima-core..."
  NODE_OPTIONS="--max-old-space-size=2048" $PM2_BIN restart zima-core --update-env
else
  echo "🚀 Первичный запуск zima-core (ecosystem.config.cjs)..."
  NODE_OPTIONS="--max-old-space-size=2048" $PM2_BIN start ecosystem.config.cjs
fi

$PM2_BIN save || true

# Настройка автозапуска PM2 при перезагрузке системы (если systemd доступен)
if command -v systemctl >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then
  sudo env PATH=$PATH:$(dirname $(which node)) pm2 startup systemd -u $(whoami) --hp $HOME || true
fi

echo "======================================================================"
echo "🎉 [ZIMA-TRADE-AI] Развертывание узла web-app-prod успешно завершено!"
echo "======================================================================"
echo "📍 Публичный веб-терминал: http://194.113.34.230:3000"
echo "🔒 Внутренний IP (VPC):   http://10.0.0.5:3000"
echo "🩺 Health Check:          http://194.113.34.230:3000/api/health"
echo "🌍 Зона Cloud.ru:         ru.AZ-1"
echo "📊 Мониторинг логов:      pm2 logs zima-core"
echo "📈 Статус процессов:      pm2 status"
echo "⚙️ Редактирование ключей: nano .env && pm2 restart zima-core"
echo "======================================================================"
