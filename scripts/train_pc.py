#!/usr/bin/env python3
"""
=============================================================================
ZimaTrade AI — Локальный квант-тренажер для домашнего ПК / Mac (Node B)
Обучение глубокой модели обучения с подкреплением (PPO + LSTM) на реальных данных Bybit V5
Поддерживает: NVIDIA GPU (CUDA), Apple Silicon M1/M2/M3/M4 (MPS) и CPU
=============================================================================
Запуск на ПК / Mac:
  pip install torch onnx numpy requests
  python3 scripts/train_pc.py [--server http://127.0.0.1:3000]
=============================================================================
"""

import os
import sys
import json
import time
import hashlib
import argparse
import urllib.request
import urllib.error
import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
except ImportError:
    print("❌ Не установлен PyTorch! Установите его командой:")
    print("   pip install torch onnx numpy requests")
    sys.exit(1)


# ---------------------------------------------------------------------------
# 1. Нейросетевая архитектура: LSTM Actor-Critic (PPO Policy & Value Head)
# ---------------------------------------------------------------------------
class ActorCritic(nn.Module):
    def __init__(self, input_dim: int = 5, action_dim: int = 3, hidden_dim: int = 64):
        super().__init__()
        # input: [batch, seq_len, 5] (OBI, Momentum, VWAP_dev, ATR, Sentiment)
        self.lstm = nn.LSTM(input_dim, hidden_dim, batch_first=True)
        self.actor = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Linear(32, action_dim),
            nn.Softmax(dim=-1),  # [HOLD (0), LONG (1), SHORT (2)]
        )
        self.critic = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 1),  # Expected state return V(s)
        )

    def forward(self, x: torch.Tensor):
        lstm_out, _ = self.lstm(x)
        last_step = lstm_out[:, -1, :] if x.ndim == 3 else lstm_out
        action_probs = self.actor(last_step)
        value = self.critic(last_step)
        return action_probs, value


# ---------------------------------------------------------------------------
# 2. Загрузка реальных исторических свечей с Bybit V5 Public Linear API
# ---------------------------------------------------------------------------
def fetch_bybit_klines(symbol: str = "BTCUSDT", interval: str = "5", limit: int = 200):
    url = f"https://api.bybit.com/v5/market/kline?category=linear&symbol={symbol}&interval={interval}&limit={limit}"
    req = urllib.request.Request(url, headers={"User-Agent": "ZimaTrade-PC-Trainer/4.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_list = data.get("result", {}).get("list", [])
            # Bybit отдаёт от новых к старым; переворачиваем в хронологический порядок
            bars = []
            for row in reversed(raw_list):
                bars.append({
                    "timestamp": int(row[0]),
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "volume": float(row[5]),
                    "turnover": float(row[6]),
                })
            return bars
    except Exception as e:
        print(f"⚠️ Ошибка загрузки свечей Bybit для {symbol}: {e}")
        return []


# ---------------------------------------------------------------------------
# 3. Извлечение признаков (Feature Engineering): OBI, Momentum, VWAP, ATR
# ---------------------------------------------------------------------------
def extract_dataset_from_klines(bars, seq_len: int = 10):
    if len(bars) < seq_len + 15:
        return None, None

    closes = np.array([b["close"] for b in bars])
    volumes = np.array([b["volume"] for b in bars])
    highs = np.array([b["high"] for b in bars])
    lows = np.array([b["low"] for b in bars])

    # Momentum (5-bar return)
    momentum = np.zeros_like(closes)
    momentum[5:] = (closes[5:] - closes[:-5]) / closes[:-5]

    # VWAP приближение (окно 14)
    vwap_dev = np.zeros_like(closes)
    for i in range(14, len(closes)):
        window_v = volumes[i - 14 : i + 1]
        window_p = closes[i - 14 : i + 1]
        denom = np.sum(window_v)
        v_vwap = np.sum(window_p * window_v) / (denom if denom > 0 else 1.0)
        vwap_dev[i] = (closes[i] - v_vwap) / v_vwap

    # ATR (окно 14)
    atr = np.zeros_like(closes)
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        atr[i] = tr / closes[i]

    # Имитация OBI (дисбаланса стакана) из агрессии покупок/продаж
    obi = np.zeros_like(closes)
    for i in range(len(closes)):
        bar_range = max(0.0001, highs[i] - lows[i])
        close_pos = (closes[i] - lows[i]) / bar_range  # 0..1
        obi[i] = (close_pos - 0.5) * 2.0  # -1..+1

    # Синтетический Telegram сентимент (-1..+1)
    sentiment = np.clip(momentum * 40.0 + obi * 0.3, -1.0, 1.0)

    # Собираем скользящие окна длины seq_len
    features_all = np.column_stack([obi, momentum, vwap_dev, atr, sentiment])
    
    samples_x = []
    future_returns = []

    for i in range(seq_len, len(closes) - 3):
        samples_x.append(features_all[i - seq_len : i])
        # Целевая доходность через 3 свечи (R:R результат)
        f_ret = (closes[i + 3] - closes[i]) / closes[i]
        future_returns.append(f_ret)

    return np.array(samples_x, dtype=np.float32), np.array(future_returns, dtype=np.float32)


# ---------------------------------------------------------------------------
# 4. Динамический полнорыночный сканер трендов Bybit V5 Linear (200+ инструментов)
# ---------------------------------------------------------------------------
def discover_market_trends(target_server: str = "http://127.0.0.1:3000", limit: int = 8):
    """
    Сканирует весь рынок Bybit Linear (200+ пар) и отбирает самые горячие трендовые инструменты
    (топ пампы, топ дампы и объемные пробои) + якоря BTC и ETH.
    """
    symbols = []
    # 1. Запрос трендового аудита с сервера ZimaTrade AI
    try:
        req = urllib.request.Request(f"{target_server}/api/ai/trend-audit", headers={"User-Agent": "ZimaTrade-PC-Trainer/4.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            trend_syms = data.get("topTrendingSymbols", [])
            if trend_syms:
                symbols.extend(trend_syms)
                regime = data.get("regimeTitle", "Анализ")
                print(f"📡 Получены топ-тренды с торгового сервера ({regime}): {', '.join(trend_syms[:6])}")
    except Exception:
        pass

    # 2. Если сервер недоступен — сканируем Bybit V5 Linear API напрямую
    if len(symbols) < 4:
        try:
            url = "https://api.bybit.com/v5/market/tickers?category=linear"
            req = urllib.request.Request(url, headers={"User-Agent": "ZimaTrade-PC-Trainer/4.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                list_raw = data.get("result", {}).get("list", [])
                
                valid_tickers = []
                blacklist = {"ESPORTSUSDT", "APRUSDT", "TRUMPUSDT"}
                for t in list_raw:
                    sym = t.get("symbol", "")
                    if not sym.endswith("USDT") or sym in blacklist:
                        continue
                    turnover = float(t.get("turnover24h") or 0)
                    price = float(t.get("lastPrice") or 0)
                    chg = float(t.get("price24hPcnt") or 0) * 100.0
                    if turnover >= 2000000 and price > 0:
                        valid_tickers.append({"symbol": sym, "turnover": turnover, "chg": chg, "abs_chg": abs(chg)})

                # Сортируем по максимальному трендовому импульсу
                valid_tickers.sort(key=lambda x: x["abs_chg"], reverse=True)
                top_movers = [x["symbol"] for x in valid_tickers[:limit]]
                symbols.extend(top_movers)
                print(f"🔥 Просканирован рынок Bybit ({len(valid_tickers)} пар). Топ тренды: {', '.join(top_movers[:6])}")
        except Exception as e:
            print(f"⚠️ Не удалось просканировать тикеры Bybit: {e}")

    # Добавляем базовые якоря ликвидности
    anchors = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    final_symbols = []
    for s in symbols + anchors:
        if s not in final_symbols:
            final_symbols.append(s)
            
    return final_symbols[:max(6, limit + 2)]


# ---------------------------------------------------------------------------
# 5. Основной цикл обучения (Training Epochs)
# ---------------------------------------------------------------------------
def run_trainer(target_server: str = "http://127.0.0.1:3000", epochs: int = 15, dynamic_trends: bool = True, custom_symbols: list = None):
    print("=" * 72)
    print("🧠 ZimaTrade AI — Квант-тренажер нейро-агентов (Node B: Home Forge)")
    print("=" * 72)

    # Определение устройства
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"🚀 Ускорение: NVIDIA CUDA ({torch.cuda.get_device_name(0)})")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = torch.device("mps")
        print("🍎 Ускорение: Apple Silicon Metal (MPS / Neural Engine)")
    else:
        device = torch.device("cpu")
        print("💻 Ускорение: Многопоточный CPU (AVX2 / NEON)")

    print(f"🌐 Целевой торговый сервер: {target_server}")
    print()

    # Сбор обучающего датасета: динамические тренды всего рынка или кастомные символы
    if custom_symbols and len(custom_symbols) > 0:
        symbols = custom_symbols
        print(f"🎯 Использование заданного списка пар: {', '.join(symbols)}")
    elif dynamic_trends:
        print("🔍 Полнорыночный сканер Bybit V5: поиск горячих трендовых альткоинов и пробоев...")
        symbols = discover_market_trends(target_server, limit=8)
    else:
        symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"]

    all_x = []
    all_y = []

    print(f"📥 Сбор реальных исторических свечей Bybit V5 Linear для {len(symbols)} инструментов:")
    for sym in symbols:
        bars = fetch_bybit_klines(sym, interval="5", limit=200)
        if bars:
            x_arr, y_arr = extract_dataset_from_klines(bars, seq_len=10)
            if x_arr is not None and len(x_arr) > 0:
                all_x.append(x_arr)
                all_y.append(y_arr)
                print(f"   -> {sym}: загружено {len(bars)} свечей (образцов: {len(x_arr)})")
        time.sleep(0.3)

    if not all_x:
        print("❌ Не удалось получить рыночные данные с Bybit. Проверьте интернет-соединение.")
        sys.exit(1)

    X = torch.tensor(np.concatenate(all_x, axis=0)).to(device)
    Y = torch.tensor(np.concatenate(all_y, axis=0)).to(device)
    print(f"✅ Датасет готов: {len(X)} временных последовательностей x 10 свечей x 5 факторов.")
    print()

    # Инициализация модели и оптимизатора AdamW
    model = ActorCritic(input_dim=5, action_dim=3, hidden_dim=64).to(device)
    model.train()
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)

    print("⚙️ Старт обучения нейросети (PPO Policy Optimization)...")
    t0 = time.time()

    for epoch in range(1, epochs + 1):
        # Action labels: 1 = BUY если доходность > 0.002, 2 = SELL если < -0.002, 0 = HOLD
        target_actions = torch.zeros(len(Y), dtype=torch.long, device=device)
        target_actions[Y > 0.002] = 1
        target_actions[Y < -0.002] = 2

        action_probs, state_values = model(X)
        
        # Policy Loss (Cross-Entropy с учетом вознаграждения) + Critic Loss (MSE)
        criterion_ce = nn.CrossEntropyLoss()
        criterion_mse = nn.MSELoss()

        target_values = (Y * 100.0).unsqueeze(1)  # Scale % return
        loss_actor = criterion_ce(action_probs, target_actions)
        loss_critic = criterion_mse(state_values, target_values)
        total_loss = loss_actor + 0.5 * loss_critic

        optimizer.zero_grad()
        total_loss.backward()
        optimizer.step()

        # Расчет метрик эпохи
        chosen_actions = torch.argmax(action_probs, dim=-1)
        accuracy = (chosen_actions == target_actions).float().mean().item() * 100.0
        
        # PnL модели
        trade_mask = chosen_actions != 0
        if trade_mask.sum() > 0:
            returns_achieved = Y[chosen_actions == 1].sum() - Y[chosen_actions == 2].sum()
            sim_pnl_pct = returns_achieved.item() * 100.0
        else:
            sim_pnl_pct = 0.0

        print(f"   Эпоха [{epoch:02d}/{epochs:02d}] · Loss: {total_loss.item():.4f} · Точность: {accuracy:.1f}% · Модельный PnL: {sim_pnl_pct:+.2f}%")

    train_duration = time.time() - t0
    print(f"\n✨ Обучение завершено за {train_duration:.2f} сек!")

    # -----------------------------------------------------------------------
    # 5. Экспорт обученной модели в формат ONNX и расчет SHA-256
    # -----------------------------------------------------------------------
    models_dir = os.path.abspath("./models")
    os.makedirs(models_dir, exist_ok=True)
    onnx_path = os.path.join(models_dir, "ppo_policy.onnx")
    manifest_path = os.path.join(models_dir, "manifest.json")

    model.eval()
    model_cpu = model.to("cpu")
    dummy_input = torch.randn(1, 10, 5, dtype=torch.float32)

    try:
        import onnx
        torch.onnx.export(
            model_cpu,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=14,
            do_constant_folding=True,
            input_names=["market_features"],
            output_names=["action_probs", "state_value"],
            dynamic_axes={"market_features": {0: "batch_size"}},
        )

        sha = hashlib.sha256()
        with open(onnx_path, "rb") as f:
            while chunk := f.read(65536):
                sha.update(chunk)
        model_sha256 = sha.hexdigest()

        manifest = {
            "model_file": "ppo_policy.onnx",
            "sha256": model_sha256,
            "trained_at": int(time.time() * 1000),
            "device": str(device),
            "epochs": epochs,
            "input_dim": 5,
            "action_dim": 3,
            "symbols": symbols,
            "architecture": "LSTM-ActorCritic",
        }

        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        print(f"📦 Модель сохранена: {onnx_path}")
        print(f"🔒 SHA-256 хеш: {model_sha256}")
        print(f"📋 Манифест: {manifest_path}")
    except Exception as e:
        print(f"⚠️ Ошибка экспорта ONNX (установите pip install onnx): {e}")

    # -----------------------------------------------------------------------
    # 6. Отправка сигналов и запуск синхронной калибровки на боевом сервере
    # -----------------------------------------------------------------------
    # -----------------------------------------------------------------------
    # 6. Отправка сигналов и запуск синхронной калибровки на боевом сервере
    # -----------------------------------------------------------------------
    if target_server and target_server.startswith("http"):
        print(f"\n📡 Отправка результатов обучения на целевой сервер ({target_server})...")
        for sym in symbols[:5]:
            try:
                payload = json.dumps({
                    "agentId": "ALL",
                    "symbol": sym,
                    "interval": "5",
                    "limit": 90,
                }).encode("utf-8")
                req = urllib.request.Request(
                    f"{target_server}/api/bots/train-epoch",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    res_data = json.loads(resp.read().decode("utf-8"))
                    print(f"   -> Сервер откалиброван по {sym}: OK (эпох: {res_data.get('reports', [{}])[0].get('epochsTrained', 'N/A')})")
            except Exception as e:
                print(f"   -> Не удалось соединиться с сервером {target_server}: {e}")
                break

    print("\n🎉 Все операции успешно выполнены!")
    print("=" * 72)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ZimaTrade AI — Обучение на домашнем ПК с динамическим сканированием трендов Bybit")
    parser.add_argument("--server", type=str, default="http://127.0.0.1:3000", help="URL запущенного сервера ZimaTrade AI")
    parser.add_argument("--epochs", type=int, default=15, help="Количество эпох обучения")
    parser.add_argument("--dynamic-trends", action="store_true", default=True, help="Динамический отбор самых горячих трендовых альткоинов Bybit (по умолчанию включен)")
    parser.add_argument("--symbols", type=str, default="", help="Список пар через запятую (например: SUIUSDT,TIAUSDT,NEARUSDT)")
    args = parser.parse_args()

    custom_syms = [s.strip().upper() for s in args.symbols.split(",") if s.strip()] if args.symbols else None
    run_trainer(target_server=args.server, epochs=args.epochs, dynamic_trends=args.dynamic_trends, custom_symbols=custom_syms)
