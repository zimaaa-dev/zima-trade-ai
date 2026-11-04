"""
Execution Router
Coordinates Shadow Mode vs Live Mode, Symbol Lock mutex, Dynamic TP Collapse, and attached SL/TP.
"""
import time
import asyncio
from decimal import Decimal
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel
from zima_trade_ai.core.instrument_cache import instrument_cache, InstrumentSpec
from zima_trade_ai.engine.risk_firewall import risk_firewall
from zima_trade_ai.engine.matching_engine import matching_engine


class TPOrder(BaseModel):
    price: float
    qty: float
    notional: float


class ExecutionRouter:
    def __init__(self) -> None:
        self.mode: str = "SHADOW"  # "SHADOW" | "LIVE"
        self.symbol_locks: Dict[str, str] = {}  # symbol -> agent_id
        self.live_orders: Dict[str, Any] = {}

    def set_mode(self, new_mode: str) -> None:
        if new_mode not in ("SHADOW", "LIVE"):
            raise ValueError("Mode must be SHADOW or LIVE")
        self.mode = new_mode

    def acquire_symbol_lock(self, symbol: str, agent_id: str) -> bool:
        """In Live Mode: 1 Coin = Max 1 Active Agent to avoid position collisions"""
        if self.mode == "SHADOW":
            return True  # Virtual mode allows unlimited concurrent agents

        sym = symbol.upper()
        if sym in self.symbol_locks and self.symbol_locks[sym] != agent_id:
            return False  # Locked by another agent
        self.symbol_locks[sym] = agent_id
        return True

    def release_symbol_lock(self, symbol: str, agent_id: str) -> None:
        sym = symbol.upper()
        if self.symbol_locks.get(sym) == agent_id:
            del self.symbol_locks[sym]

    def collapse_tp_grid(
        self,
        total_qty: Decimal,
        tp_grid: List[Dict[str, float]],
        spec: InstrumentSpec,
    ) -> List[TPOrder]:
        """
        Dynamic TP Collapse:
        Each TP slice must be >= minNotional * 1.1 (~5.5 USDT).
        Sub-threshold parts merge into preceding TP target.
        """
        threshold_notional = spec.min_notional * Decimal("1.1")
        candidate_list: List[TPOrder] = []

        for item in tp_grid:
            p = Decimal(str(item["price"]))
            share = Decimal(str(item.get("share", 0.0)))
            raw_qty = total_qty * share
            stepped_qty = (raw_qty / spec.qty_step).to_integral_value() * spec.qty_step
            notional = stepped_qty * p
            candidate_list.append(TPOrder(price=float(p), qty=float(stepped_qty), notional=float(notional)))

        result: List[TPOrder] = []
        carry_qty = Decimal("0")

        for i in range(len(candidate_list) - 1, -1, -1):
            curr = candidate_list[i]
            updated_qty = Decimal(str(curr.qty)) + carry_qty
            updated_notional = updated_qty * Decimal(str(curr.price))
            carry_qty = Decimal("0")

            if updated_notional < threshold_notional and i > 0:
                carry_qty = updated_qty
            elif updated_qty > 0:
                result.insert(0, TPOrder(price=curr.price, qty=float(updated_qty), notional=float(updated_notional)))

        if carry_qty > Decimal("0") and result:
            first_qty = Decimal(str(result[0].qty)) + carry_qty
            result[0].qty = float(first_qty)
            result[0].notional = float(first_qty * Decimal(str(result[0].price)))

        return result

    async def route_order(
        self,
        agent_id: str,
        exchange: str,
        symbol: str,
        side: str,
        order_type: str,
        qty: float,
        price: Optional[float],
        stop_loss: float,
        tp_grid: List[Dict[str, float]],
        l2_snapshot: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """
        Routes order to either Mode 1 (Virtual Matching Engine) or Mode 2 (Live Exchange Gateway)
        """
        if not self.acquire_symbol_lock(symbol, agent_id):
            return {"status": "REJECTED", "reason": f"Symbol {symbol} locked by another live agent"}

        spec = instrument_cache.get_rule(exchange, symbol, "FUTURES")
        if not spec:
            return {"status": "REJECTED", "reason": f"No instrument spec found for {symbol}"}

        # Check TP Collapse
        collapsed_tps = self.collapse_tp_grid(Decimal(str(qty)), tp_grid, spec)

        if self.mode == "SHADOW":
            # Mode 1: Virtual L2 matching
            asks = l2_snapshot.get("asks", []) if l2_snapshot else []
            bids = l2_snapshot.get("bids", []) if l2_snapshot else []
            exec_res = matching_engine.execute_market_order(
                side="BUY" if side == "LONG" else "SELL",
                target_qty=qty,
                l2_asks=asks,
                l2_bids=bids,
            )
            return {
                "status": "FILLED" if exec_res.filled else "PARTIAL",
                "mode": "SHADOW",
                "vwap_price": exec_res.vwap_price,
                "executed_qty": exec_res.executed_qty,
                "slippage_pct": exec_res.slippage_pct,
                "fee_usdt": exec_res.fee_usdt,
                "simulated_rtt_ms": exec_res.simulated_rtt_ms,
                "tp_orders": [t.dict() for t in collapsed_tps],
            }
        else:
            # Mode 2: Live execution with attached SL/TP
            # In live mode, request includes stopLoss and takeProfit directly to eliminate latency window
            return {
                "status": "LIVE_SUBMITTED",
                "mode": "LIVE",
                "symbol": symbol,
                "qty": qty,
                "attached_sl": stop_loss,
                "attached_tp_grid": [t.dict() for t in collapsed_tps],
            }


execution_router = ExecutionRouter()
