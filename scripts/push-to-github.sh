#!/bin/bash
# ZimaTrade AI — Push to GitHub Script
set -e

REPO_URL="https://github.com/zimaaa-dev/zima-trade-ai.git"

echo "=========================================="
echo "   ZimaTrade AI — GitHub Sync Tool"
echo "=========================================="

if [ -n "$GITHUB_TOKEN" ]; then
  TOKEN="$GITHUB_TOKEN"
elif [ -n "$1" ]; then
  TOKEN="$1"
else
  echo -n "Введите ваш GitHub Personal Access Token (PAT): "
  read -s TOKEN
  echo ""
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Ошибка: Токен не указан."
  echo "Создайте токен на: https://github.com/settings/tokens (права repo)"
  exit 1
fi

AUTH_URL="https://${TOKEN}@github.com/zimaaa-dev/zima-trade-ai.git"

echo "📦 Добавление изменений и коммит..."
git config user.name "zimaaa-dev"
git config user.email "zimaaalab@gmail.com"
git add .
git commit -m "feat(core): migrate to Ollama Cloud multi-key pool with model rotation" || echo "Нет новых изменений для коммита."

echo "🚀 Отправка в ветку main на GitHub..."
git push "$AUTH_URL" main:main --force-with-lease || git push "$AUTH_URL" main:main

echo "✅ Успешно выгружено в $REPO_URL (ветка main)!"
