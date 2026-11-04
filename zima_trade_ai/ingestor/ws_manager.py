"""
Multi-Exchange WebSocket Client with Endpoint Failover
Supports Bybit v5, OKX, MEXC with automatic ping-based gateway selection.
"""
import asyncio
import json
import time
import logging
from typing import Dict, List, Callable, Awaitable, Any, Optional
import aiohttp
import websockets

logger = logging.getLogger(__name__)


class ExchangeEndpoints:
    BYBIT = [
        "wss://stream.bybit.com/v5/public/linear",
        "wss://stream.bytick.com/v5/public/linear",
    ]
    OKX = [
        "wss://ws.okx.com:8443/ws/v5/public",
        "wss://wsaws.okx.com:8443/ws/v5/public",
    ]
    MEXC = [
        "wss://wbs.mexc.com/ws",
    ]


class WsManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, Any] = {}
        self.selected_gateways: Dict[str, str] = {}
        self.message_handlers: Dict[str, List[Callable[[dict], Awaitable[None]]]] = {
            "bybit": [],
            "okx": [],
            "mexc": [],
        }
        self.is_running: bool = False

    async def select_best_endpoint(self, exchange: str) -> str:
        """Pings available endpoints to select the lowest latency gateway"""
        endpoints: List[str] = getattr(ExchangeEndpoints, exchange.upper(), [])
        if not endpoints:
            raise ValueError(f"Unknown exchange {exchange}")

        best_endpoint = endpoints[0]
        min_rtt = float("inf")

        for ep in endpoints:
            t0 = time.time()
            try:
                # Quick TCP / handshake probe with 2s timeout
                async with websockets.connect(ep, open_timeout=2.0) as ws:
                    rtt = (time.time() - t0) * 1000.0
                    if rtt < min_rtt:
                        min_rtt = rtt
                        best_endpoint = ep
            except Exception as e:
                logger.debug(f"Probe failed for {ep}: {e}")

        self.selected_gateways[exchange] = best_endpoint
        logger.info(f"Selected {exchange} gateway: {best_endpoint} (RTT ~{min_rtt:.1f}ms)")
        return best_endpoint

    def register_handler(self, exchange: str, handler: Callable[[dict], Awaitable[None]]) -> None:
        self.message_handlers[exchange].append(handler)

    async def subscribe_orderbook(self, ws: Any, exchange: str, symbols: List[str]) -> None:
        if exchange == "bybit":
            args = [f"orderbook.50.{s}" for s in symbols]
            sub_msg = {"op": "subscribe", "args": args}
            await ws.send(json.dumps(sub_msg))
        elif exchange == "okx":
            args = [{"channel": "books50-l2-tbt", "instId": s} for s in symbols]
            sub_msg = {"op": "subscribe", "args": args}
            await ws.send(json.dumps(sub_msg))
        elif exchange == "mexc":
            params = [f"spot@public.limit.depth.v3.api@{s}@50" for s in symbols]
            sub_msg = {"method": "SUBSCRIPTION", "params": params}
            await ws.send(json.dumps(sub_msg))

    async def connect_and_listen(self, exchange: str, symbols: List[str]) -> None:
        while self.is_running:
            gateway = self.selected_gateways.get(exchange) or await self.select_best_endpoint(exchange)
            try:
                logger.info(f"Connecting to {exchange} at {gateway}...")
                async with websockets.connect(gateway, ping_interval=20, ping_timeout=10) as ws:
                    self.active_connections[exchange] = ws
                    await self.subscribe_orderbook(ws, exchange, symbols)

                    while self.is_running:
                        raw = await ws.recv()
                        data = json.loads(raw)
                        for h in self.message_handlers[exchange]:
                            asyncio.create_task(h(data))
            except Exception as e:
                logger.warning(f"WS error on {exchange}: {e}. Triggering failover in 3s...")
                await asyncio.sleep(3)
                # Reselect endpoint on failure
                await self.select_best_endpoint(exchange)


ws_manager = WsManager()
