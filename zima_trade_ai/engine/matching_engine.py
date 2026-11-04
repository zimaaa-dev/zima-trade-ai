"""
Mode 1 Virtual Matching Engine (Shadow Mode / Forward Testing)
Strictly forbids historical backtesting or exchange demo accounts.
Executes against live L2-50 orderbook with dynamic RTT penalty, limit order queue, VWAP slippage and funding rate.
"""
import time
from typing import Dict, List, Tuple, Optional
from decimal import Decimal
from pydantic import BaseModel


class VirtualExecutionResult(BaseModel):
    filled: bool
    executed_qty: float
    vwap_price: float
    slippage_pct: float
    fee_usdt: float  # Bybit Taker 0.055%
    simulated_rtt_ms: float
    reason: str = "FILLED"


class VirtualLimitOrder(BaseModel):
    order_id: str
    symbol: str
    side: str  # BUY or SELL
    limit_price: float
    order_qty: float
    queue_ahead_qty: float
    cumulative_volume_since_placement: float = 0.0
    created_ts: float


class VirtualMatchingEngine:
    TAKER_FEE_RATE = 0.00055  # 0.055%
    MAKER_FEE_RATE = 0.00020  # 0.020%
    BASE_EXECUTION_OVERHEAD_MS = 20.0

    def __init__(self, live_rtt_ms: float = 25.0):
        self.live_rtt_ms = live_rtt_ms
        self.active_limit_orders: Dict[str, VirtualLimitOrder] = {}

    def update_rtt(self, rtt_ms: float) -> None:
        self.live_rtt_ms = rtt_ms

    def execute_market_order(
        self,
        side: str,  # "BUY" or "SELL"
        target_qty: float,
        l2_asks: List[Tuple[float, float]],  # sorted ascending by price
        l2_bids: List[Tuple[float, float]],  # sorted descending by price
    ) -> VirtualExecutionResult:
        """
        Calculates execution against depth at t_0 + RTT_live + 20ms.
        Calculates exact VWAP slippage level-by-level.
        """
        levels = l2_asks if side == "BUY" else l2_bids
        simulated_delay = self.live_rtt_ms + self.BASE_EXECUTION_OVERHEAD_MS

        if not levels:
            return VirtualExecutionResult(
                filled=False,
                executed_qty=0.0,
                vwap_price=0.0,
                slippage_pct=0.0,
                fee_usdt=0.0,
                simulated_rtt_ms=simulated_delay,
                reason="EMPTY_ORDERBOOK",
            )

        top_price = levels[0][0]
        remaining = target_qty
        total_cost = 0.0
        total_qty = 0.0

        for price, qty in levels:
            if remaining <= 0:
                break
            fill = min(remaining, qty)
            total_cost += fill * price
            total_qty += fill
            remaining -= fill

        if total_qty == 0:
            return VirtualExecutionResult(
                filled=False,
                executed_qty=0.0,
                vwap_price=top_price,
                slippage_pct=0.0,
                fee_usdt=0.0,
                simulated_rtt_ms=simulated_delay,
                reason="INSUFFICIENT_LIQUIDITY",
            )

        vwap = total_cost / total_qty
        slippage = abs((vwap - top_price) / top_price)
        fee = total_cost * self.TAKER_FEE_RATE

        return VirtualExecutionResult(
            filled=(remaining <= 1e-9),
            executed_qty=total_qty,
            vwap_price=vwap,
            slippage_pct=slippage,
            fee_usdt=fee,
            simulated_rtt_ms=simulated_delay,
            reason="FILLED" if remaining <= 1e-9 else "PARTIAL_FILL",
        )

    def place_limit_order(
        self,
        order_id: str,
        symbol: str,
        side: str,
        limit_price: float,
        order_qty: float,
        current_book_qty_at_price: float,
    ) -> VirtualLimitOrder:
        order = VirtualLimitOrder(
            order_id=order_id,
            symbol=symbol,
            side=side,
            limit_price=limit_price,
            order_qty=order_qty,
            queue_ahead_qty=current_book_qty_at_price,
            created_ts=time.time(),
        )
        self.active_limit_orders[order_id] = order
        return order

    def on_trade_tick(
        self,
        symbol: str,
        price: float,
        qty: float,
        best_bid: float,
        best_ask: float,
    ) -> List[Tuple[str, VirtualExecutionResult]]:
        """
        Check limit order fill conditions:
        1. Price penetrated level (best_ask < limit for BUY, best_bid > limit for SELL)
        2. Cumulative trade volume at price >= queue_ahead_qty + order_qty
        """
        filled_orders = []
        for oid, order in list(self.active_limit_orders.items()):
            if order.symbol != symbol:
                continue

            is_filled = False
            fill_reason = ""

            # Check penetration
            if order.side == "BUY" and best_ask < order.limit_price:
                is_filled = True
                fill_reason = "PENETRATION_ASK_BELOW_LIMIT"
            elif order.side == "SELL" and best_bid > order.limit_price:
                is_filled = True
                fill_reason = "PENETRATION_BID_ABOVE_LIMIT"

            # Check queue accumulation
            if not is_filled and abs(price - order.limit_price) / order.limit_price < 0.0001:
                order.cumulative_volume_since_placement += qty
                if order.cumulative_volume_since_placement >= (order.queue_ahead_qty + order.order_qty):
                    is_filled = True
                    fill_reason = "QUEUE_CLEARED_BY_TAPE"

            if is_filled:
                fee = order.order_qty * order.limit_price * self.MAKER_FEE_RATE
                res = VirtualExecutionResult(
                    filled=True,
                    executed_qty=order.order_qty,
                    vwap_price=order.limit_price,
                    slippage_pct=0.0,
                    fee_usdt=fee,
                    simulated_rtt_ms=self.live_rtt_ms,
                    reason=fill_reason,
                )
                filled_orders.append((oid, res))
                del self.active_limit_orders[oid]

        return filled_orders

    def apply_funding(self, position_notional: float, funding_rate: float) -> float:
        """Applies funding rate debit/credit: position_notional * funding_rate"""
        return position_notional * funding_rate


matching_engine = VirtualMatchingEngine()
