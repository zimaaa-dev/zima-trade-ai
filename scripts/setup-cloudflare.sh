#!/usr/bin/env bash
# ==============================================================================
# ZimaTrade AI — Интерактивный мастер настройки Cloudflare
# Поддерживает:
#   1. Постоянный Named Tunnel (через Cloudflare Zero Trust Token)
#   2. Временный Quick Tunnel (trycloudflare.com) с авто-выводом ссылки
#   3. Cloudflare Worker Watchdog & Geo-Proxy (Dead-Man's Switch)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

C_CYAN='\033[0;36m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'
C_BOLD='\033[1m'
C_RESET='\033[0m'

echo -e "${C_CYAN}══════════════════════════════════════════════════════════════════════${C_RESET}"
echo -e "${C_BOLD}${C_CYAN}  ☁️  ZimaTrade AI — Мастер настройки Cloudflare (Tunnel & Watchdog)${C_RESET}"
echo -e "${C_CYAN}══════════════════════════════════════════════════════════════════════${C_RESET}\n"

# Проверка наличия cloudflared
check_cloudflared() {
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo -e "${C_YELLOW}📥 cloudflared не обнаружен. Установка официального пакета...${C_RESET}"
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs 2>/dev/null || echo 'noble') main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update && sudo apt-get install -y cloudflared || {
      # Fallback: скачивание бинарника напрямую
      curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
      sudo dpkg -i /tmp/cloudflared.deb || true
      rm -f /tmp/cloudflared.deb
    }
  fi
  echo -e "${C_GREEN}✔ cloudflared установлен: $(cloudflared --version 2>/dev/null | head -n 1)${C_RESET}"
}

show_current_status() {
  echo -e "\n${C_BOLD}📊 Текущий статус процессов Cloudflare:${C_RESET}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 status cf-tunnel 2>/dev/null || echo -e "  • PM2 процесс cf-tunnel: ${C_YELLOW}не запущен${C_RESET}"
  fi

  if systemctl is-active --quiet cloudflared 2>/dev/null; then
    echo -e "  • Системный сервис cloudflared (systemd): ${C_GREEN}АКТИВЕН (Named Tunnel)${C_RESET}"
  else
    echo -e "  • Системный сервис cloudflared (systemd): ${C_YELLOW}не установлен${C_RESET}"
  fi

  # Поиск активного URL в логах
  echo -e "\n${C_BOLD}🔍 Поиск активного публичного адреса trycloudflare.com:${C_RESET}"
  ACTIVE_URL=$(cat ~/.pm2/logs/cf-tunnel-error.log ~/.pm2/logs/cf-tunnel-out.log 2>/dev/null | grep -ioE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" | tail -n 1 || true)
  if [ -n "$ACTIVE_URL" ]; then
    echo -e "  ${C_GREEN}✔ Активный URL терминала:${C_RESET} ${C_BOLD}${C_CYAN}$ACTIVE_URL${C_RESET}"
  else
    echo -e "  ${C_YELLOW}⚠ Активный URL в логах PM2 не найден.${C_RESET}"
  fi
}

setup_permanent_tunnel() {
  echo -e "\n${C_BOLD}${C_CYAN}── [ 1. Настройка Постоянного Туннеля (Named Tunnel) ] ──────────────${C_RESET}"
  echo -e "Постоянный туннель привязывается к вашему аккаунту Cloudflare Zero Trust."
  echo -e "URL не будет меняться при перезапуске сервера или PM2!\n"
  echo -e "Шаги для получения токена (бесплатно):"
  echo -e "  1. Откройте: ${C_CYAN}https://one.dash.cloudflare.com/${C_RESET}"
  echo -e "  2. Перейдите в: ${C_BOLD}Networks -> Tunnels -> Add a tunnel${C_RESET}"
  echo -e "  3. Выберите 'Cloudflared', укажите имя (например: zima-prod)"
  echo -e "  4. Скопируйте строку установки (токен после 'cloudflared service install ...')\n"

  read -r -p "Введите TUNNEL_TOKEN (или нажмите Enter для отмены): " USER_TOKEN
  if [ -z "$USER_TOKEN" ]; then
    echo -e "${C_YELLOW}Настройка постоянного туннеля отменена.${C_RESET}"
    return
  fi

  # Очищаем токен от префикса команды если вставили целиком
  CLEAN_TOKEN=$(echo "$USER_TOKEN" | sed -E 's/.*cloudflared service install //')

  echo -e "\n⚙️ Установка системного сервиса cloudflared..."
  # Останавливаем старый pm2 cf-tunnel если работал
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete cf-tunnel 2>/dev/null || true
    pm2 save || true
  fi

  sudo cloudflared service uninstall 2>/dev/null || true
  sudo cloudflared service install "$CLEAN_TOKEN"
  sudo systemctl restart cloudflared

  echo -e "${C_GREEN}✔ Постоянный сервис Cloudflare Tunnel успешно установлен и запущен!${C_RESET}"
  sudo systemctl status cloudflared --no-pager -l || true
}

setup_quick_tunnel() {
  echo -e "\n${C_BOLD}${C_CYAN}── [ 2. Перезапуск Quick Tunnel (trycloudflare.com) ] ───────────────${C_RESET}"
  check_cloudflared

  if ! command -v pm2 >/dev/null 2>&1; then
    sudo npm install -g pm2
  fi

  echo "🔄 Перезапуск процесса cf-tunnel в PM2..."
  pm2 delete cf-tunnel 2>/dev/null || true
  pm2 start "cloudflared tunnel --url http://localhost:3000" --name cf-tunnel
  pm2 save

  echo "⏳ Ожидание выделения публичного URL Cloudflare (5 сек)..."
  sleep 5

  NEW_URL=$(cat ~/.pm2/logs/cf-tunnel-error.log ~/.pm2/logs/cf-tunnel-out.log 2>/dev/null | grep -ioE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" | tail -n 1 || true)
  if [ -n "$NEW_URL" ]; then
    echo -e "\n${C_GREEN}══════════════════════════════════════════════════════════════════${C_RESET}"
    echo -e "${C_BOLD}${C_GREEN}🎉 Публичный адрес ZimaTrade AI успешно поднят:${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}   $NEW_URL${C_RESET}"
    echo -e "${C_GREEN}══════════════════════════════════════════════════════════════════${C_RESET}\n"
  else
    echo -e "${C_YELLOW}Туннель запущен. Проверьте адрес командой:${C_RESET}"
    echo -e "pm2 logs cf-tunnel --lines 30"
  fi
}

deploy_watchdog_worker() {
  echo -e "\n${C_BOLD}${C_CYAN}── [ 3. Развертывание Cloudflare Worker (Watchdog & Geo-Proxy) ] ───${C_RESET}"
  WORKER_DIR="$ROOT_DIR/zima_trade_ai/watchdog_cf"
  if [ ! -d "$WORKER_DIR" ]; then
    echo -e "${C_RED}✖ Папка $WORKER_DIR не найдена.${C_RESET}"
    return
  fi

  cd "$WORKER_DIR"
  echo "📦 Установка/проверка Wrangler..."
  if ! command -v wrangler >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
    sudo npm install -g wrangler 2>/dev/null || npm install -g wrangler 2>/dev/null || true
  fi

  WRANGLER="npx wrangler"
  if command -v wrangler >/dev/null 2>&1; then
    WRANGLER="wrangler"
  fi

  echo "🔐 Проверка авторизации в Cloudflare..."
  IS_LOGGED_IN=false

  # Проверяем, есть ли токен в окружении или в .env
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    IS_LOGGED_IN=true
  elif [ -f "$ROOT_DIR/.env" ]; then
    CF_ENV_TOK=$(grep -E "^CLOUDFLARE_API_TOKEN=" "$ROOT_DIR/.env" 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
    if [ -n "$CF_ENV_TOK" ]; then
      export CLOUDFLARE_API_TOKEN="$CF_ENV_TOK"
      IS_LOGGED_IN=true
    fi
  fi

  if [ "$IS_LOGGED_IN" = "false" ]; then
    WHOAMI_OUTPUT=$($WRANGLER whoami 2>&1 || true)
    if echo "$WHOAMI_OUTPUT" | grep -iq "logged in as"; then
      IS_LOGGED_IN=true
    fi
  fi

  if [ "$IS_LOGGED_IN" = "false" ]; then
    echo -e "${C_YELLOW}Требуется авторизация в Cloudflare.${C_RESET}"
    echo "Для деплоя Worker на удаленном сервере нужен Cloudflare API Token:"
    echo -e "  1. Откройте в браузере: ${C_CYAN}https://dash.cloudflare.com/profile/api-tokens${C_RESET}"
    echo -e "  2. Нажмите ${C_BOLD}Create Token${C_RESET} -> шаблон ${C_BOLD}Edit Cloudflare Workers${C_RESET}"
    echo -e "  3. Нажмите ${C_BOLD}Continue to summary${C_RESET} -> ${C_BOLD}Create Token${C_RESET}"
    echo ""
    read -r -p "Вставьте ваш Cloudflare API Token: " CF_TOKEN
    if [ -z "$CF_TOKEN" ]; then
      echo -e "${C_RED}✖ Токен не введен. Деплой отменен.${C_RESET}"
      return
    fi

    export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
    if ! grep -q "CLOUDFLARE_API_TOKEN=" "$ROOT_DIR/.env" 2>/dev/null; then
      echo "CLOUDFLARE_API_TOKEN=\"$CF_TOKEN\"" >> "$ROOT_DIR/.env"
    fi
  fi

  echo -e "${C_GREEN}✔ Авторизация подтверждена.${C_RESET}"
  echo "🚀 Деплой Worker zima-trade-watchdog..."
  $WRANGLER deploy
  echo -e "\n${C_GREEN}══════════════════════════════════════════════════════════════════${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}🎉 Cloudflare Worker Watchdog успешно развернут!${C_RESET}"
  echo -e "${C_GREEN}══════════════════════════════════════════════════════════════════${C_RESET}"
}

# Меню
check_cloudflared
show_current_status

echo -e "\n${C_BOLD}Выберите действие:${C_RESET}"
echo "1) Настроить постоянный туннель (Named Tunnel с токеном / постоянный домен)"
echo "2) Перезапустить Quick Tunnel (trycloudflare.com) и получить актуальную ссылку"
echo "3) Развернуть Cloudflare Worker Watchdog & Bybit Geo-Proxy"
echo "4) Выход"

if [ "${1:-}" = "quick" ]; then
  setup_quick_tunnel
  exit 0
elif [ "${1:-}" = "token" ]; then
  setup_permanent_tunnel
  exit 0
elif [ "${1:-}" = "watchdog" ]; then
  deploy_watchdog_worker
  exit 0
fi

read -r -p "Введите номер (1-4): " CHOICE
case "$CHOICE" in
  1) setup_permanent_tunnel ;;
  2) setup_quick_tunnel ;;
  3) deploy_watchdog_worker ;;
  4) echo "Выход." ;;
  *) echo "Неверный выбор." ;;
esac
