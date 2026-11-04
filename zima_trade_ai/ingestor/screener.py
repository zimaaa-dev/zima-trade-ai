"""
Dynamic 5-Minute Screener & Sticky Subscription Manager
Filters out illiquid pairs, computes Top-40 active symbols, coordinates 300-candle warm-up backfill.
"""
import asyncio
import time
import logging
from typing import Set, List, Dict, Any
import aiohttp

logger = logging.getLogger(__name__)


class DynamicScreener:
    def __init__(self, sticky_symbols: Optional[Set[str]] = None):
        self.top_40_symbols: List[str] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
        self.sticky_position_symbols: Set[str] = sticky_symbols or set()
        self.warmed_up_symbols: Set[str] = set()
        self.symbol_status: Dict[str, str] = {}  # "WARMING_UP" | "READY"

    def add_sticky_symbol(self, symbol: str) -> None:
        """Sticky Subscription: prevent disconnecting active position symbols"""
        self.sticky_position_symbols.add(symbol.upper())

    def remove_sticky_symbol(self, symbol: str) -> None:
        self.sticky_position_symbols.discard(symbol.upper())

    def get_active_pool(self) -> Set[str]:
        """Active_Pool = Screener_Top_40 U Sticky_Position_Symbols"""
        return set(self.top_40_symbols).union(self.sticky_position_symbols)

    async def scan_market(self, session: aiohttp.ClientSession) -> List[str]:
        """
        Polls 24h tickers from Bybit Linear:
        1. turnover24h >= 5_000_000 USDT
        2. Spread (ask - bid) / bid <= 0.0025 (0.25%)
        3. Sort by 24h turnover & volatility
        """
        url = "https://api.bybit.com/v5/market/tickers?category=linear"
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5.0)) as resp:
                data = await resp.json()
                tickers = data.get("result", {}).get("list", [])
                qualified = []

                for t in tickers:
                    symbol = t.get("symbol", "")
                    if not symbol.endswith("USDT"):
                        continue

                    turnover = float(t.get("turnover24h", 0.0))
                    bid = float(t.get("bid1Price", 0.0))
                    ask = float(t.get("ask1Price", 0.0))

                    if turnover < 5_000_000:
                        continue
                    if bid <= 0 or ask <= 0:
                        continue

                    spread_pct = (ask - bid) / bid
                    if spread_pct > 0.0025:
                        continue

                    price_change_pct = abs(float(t.get("price24hPcnt", 0.0)))
                    score = turnover * (1.0 + price_change_pct)
                    qualified.append((symbol, score))

                qualified.sort(key=lambda x: x[1], reverse=True)
                top_symbols = [s for s, _ in qualified[:40]]

                if top_symbols:
                    self.top_40_symbols = top_symbols
                    logger.info(f"Screener updated Top-40 pool. Count: {len(top_symbols)}")
                return self.top_40_symbols

        except Exception as e:
            logger.warning(f"Screener poll failed: {e}")
            return self.top_40_symbols

    async def backfill_warmup(self, session: aiohttp.ClientSession, symbol: str) -> bool:
        """
        Warm-up Backfill (300 candles of 1m) before allowing inference
        """
        self.symbol_status[symbol] = "WARMING_UP"
        url = f"https://api.bybit.com/v5/market/kline?category=linear&symbol={symbol}&interval=1&limit=300"
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=4.0)) as resp:
                data = await resp.json()
                candles = data.get("result", {}).get("list", [])
                if len(candles) >= 100:
                    self.warmed_up_symbols.add(symbol)
                    self.symbol_status[symbol] = "READY"
                    logger.info(f"Warm-up complete for {symbol} ({len(candles)} candles loaded)")
                    return True
        except Exception as e:
            logger.error(f"Warm-up failed for {symbol}: {e}")

        return False

    async def run_loop(self) -> None:
        async with aiohttp.ClientSession() as session:
            while True:
                await self.scan_market(session)
                active_pool = self.get_active_pool()
                for sym in active_pool:
                    if sym not in self.warmed_up_symbols:
                        await self.backfill_warmup(session, sym)
                # Run every 5 minutes
                await asyncio.sleep(300)


screener = DynamicScreener()
