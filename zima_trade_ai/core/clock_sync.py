"""
Exchange Clock Synchronization (every 10 minutes)
Maintains delta_ms offset to avoid timestamp rejection by Bybit API v5 and OKX.
"""
import time
import asyncio
import logging
from typing import Dict
import aiohttp

logger = logging.getLogger(__name__)


class ClockSync:
    EXCHANGE_TIME_ENDPOINTS = {
        "bybit": "https://api.bybit.com/v5/market/time",
        "okx": "https://www.okx.com/api/v5/public/time",
        "mexc": "https://api.mexc.com/api/v3/time",
    }

    def __init__(self) -> None:
        self.offsets_ms: Dict[str, float] = {"bybit": 0.0, "okx": 0.0, "mexc": 0.0}
        self.rtt_ms: Dict[str, float] = {"bybit": 25.0, "okx": 35.0, "mexc": 30.0}
        self.last_sync_ts: float = 0.0

    async def sync_exchange(self, session: aiohttp.ClientSession, exchange: str) -> None:
        url = self.EXCHANGE_TIME_ENDPOINTS.get(exchange)
        if not url:
            return

        t0 = time.time() * 1000.0
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=3.0)) as resp:
                t1 = time.time() * 1000.0
                rtt = t1 - t0
                self.rtt_ms[exchange] = rtt
                data = await resp.json()

                server_time_ms = 0.0
                if exchange == "bybit":
                    server_time_ms = float(data.get("timeNano", 0)) / 1_000_000.0 or float(data.get("result", {}).get("timeSecond", 0)) * 1000.0
                elif exchange == "okx":
                    server_time_ms = float(data.get("data", [{}])[0].get("ts", 0))
                elif exchange == "mexc":
                    server_time_ms = float(data.get("serverTime", 0))

                if server_time_ms > 0:
                    # NTP formula: offset = (server_time - (t0 + t1)/2)
                    midpoint = (t0 + t1) / 2.0
                    self.offsets_ms[exchange] = server_time_ms - midpoint
                    logger.debug(f"ClockSync {exchange}: RTT={rtt:.2f}ms, delta={self.offsets_ms[exchange]:.2f}ms")
        except Exception as e:
            logger.warning(f"Failed to sync clock with {exchange}: {e}")

    async def run_loop(self) -> None:
        async with aiohttp.ClientSession() as session:
            while True:
                tasks = [self.sync_exchange(session, ex) for ex in self.EXCHANGE_TIME_ENDPOINTS]
                await asyncio.gather(*tasks, return_exceptions=True)
                self.last_sync_ts = time.time()
                # Run every 10 minutes (600s)
                await asyncio.sleep(600)

    def get_exchange_time_ms(self, exchange: str = "bybit") -> int:
        local_ms = time.time() * 1000.0
        offset = self.offsets_ms.get(exchange, 0.0)
        return int(local_ms + offset)


clock_sync = ClockSync()
