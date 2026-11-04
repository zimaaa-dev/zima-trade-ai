"""
Exchange Instrument Cache with Exact Decimal Rounding
Prevents float inaccuracy when placing real and virtual orders.
"""
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from typing import Dict, Optional, Tuple
from pydantic import BaseModel


class InstrumentSpec(BaseModel):
    exchange: str
    symbol: str
    market_type: str  # SPOT or FUTURES
    tick_size: Decimal
    qty_step: Decimal
    min_qty: Decimal
    min_notional: Decimal
    max_leverage: int = 10


class InstrumentCache:
    def __init__(self) -> None:
        self._cache: Dict[Tuple[str, str, str], InstrumentSpec] = {}

    def set_rule(
        self,
        exchange: str,
        symbol: str,
        market_type: str,
        tick_size: str,
        qty_step: str,
        min_qty: str,
        min_notional: str,
        max_leverage: int = 10,
    ) -> None:
        spec = InstrumentSpec(
            exchange=exchange.lower(),
            symbol=symbol.upper(),
            market_type=market_type.upper(),
            tick_size=Decimal(tick_size),
            qty_step=Decimal(qty_step),
            min_qty=Decimal(min_qty),
            min_notional=Decimal(min_notional),
            max_leverage=max_leverage,
        )
        self._cache[(exchange.lower(), symbol.upper(), market_type.upper())] = spec

    def get_rule(self, exchange: str, symbol: str, market_type: str = "FUTURES") -> Optional[InstrumentSpec]:
        return self._cache.get((exchange.lower(), symbol.upper(), market_type.upper()))

    def round_price(self, price: Decimal | float, spec: InstrumentSpec) -> Decimal:
        d_price = Decimal(str(price))
        return (d_price / spec.tick_size).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * spec.tick_size

    def round_qty(self, qty: Decimal | float, spec: InstrumentSpec) -> Decimal:
        """Always floor quantity to avoid 'insufficient margin' or 'order qty exceeds balance'"""
        d_qty = Decimal(str(qty))
        return (d_qty / spec.qty_step).quantize(Decimal("1"), rounding=ROUND_FLOOR) * spec.qty_step

    def validate_order(self, price: Decimal, qty: Decimal, spec: InstrumentSpec) -> Tuple[bool, Optional[str]]:
        if qty < spec.min_qty:
            return False, f"Qty {qty} < minQty {spec.min_qty}"
        notional = price * qty
        if notional < spec.min_notional:
            return False, f"Notional {notional:.2f} < minNotional {spec.min_notional}"
        return True, None


instrument_cache = InstrumentCache()

# Seed top tier pairs
instrument_cache.set_rule("bybit", "BTCUSDT", "FUTURES", "0.1", "0.001", "0.001", "5.0", 10)
instrument_cache.set_rule("bybit", "ETHUSDT", "FUTURES", "0.01", "0.01", "0.01", "5.0", 10)
instrument_cache.set_rule("bybit", "SOLUSDT", "FUTURES", "0.01", "0.1", "0.1", "5.0", 10)
instrument_cache.set_rule("okx", "BTC-USDT-SWAP", "FUTURES", "0.1", "0.01", "0.01", "5.0", 10)
instrument_cache.set_rule("mexc", "BTCUSDT", "SPOT", "0.01", "0.0001", "0.0001", "5.0", 1)
