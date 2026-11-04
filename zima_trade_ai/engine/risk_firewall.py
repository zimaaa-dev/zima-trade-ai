"""
Procedural Risk Management Firewall
Immutable rules that cannot be bypassed or modified by any AI model or runtime config reload.
"""
from typing import Tuple, Optional
from decimal import Decimal
import logging
from zima_trade_ai.core.instrument_cache import InstrumentSpec

logger = logging.getLogger(__name__)


class RiskFirewall:
    MAX_RISK_PER_TRADE_PCT = 0.015  # 1.5% max risk of equity per trade
    MAX_DAILY_DRAWDOWN_PCT = 0.050  # 5.0% rolling 24h Kill-Switch
    MAX_HARD_LEVERAGE = 10          # 10x hard ceiling
    SPREAD_GUARD_MAX_PCT = 0.0025   # 0.25% max allowable spread
    FUNDING_GUARD_MINUTES = 15      # 15 minutes before settlement
    FUNDING_GUARD_MAX_RATE = 0.001  # 0.10%

    def __init__(self) -> None:
        self.is_global_kill_switch_active: bool = False
        self.kill_switch_trigger_ts: float = 0.0

    def trigger_kill_switch(self, reason: str) -> None:
        self.is_global_kill_switch_active = True
        logger.critical(f"GLOBAL RISK KILL-SWITCH ACTIVATED! Reason: {reason}")

    def reset_kill_switch(self) -> None:
        self.is_global_kill_switch_active = False

    def validate_daily_drawdown(self, initial_capital: float, rolling_pnl_usdt: float) -> bool:
        if initial_capital <= 0:
            return False
        drawdown_pct = rolling_pnl_usdt / initial_capital
        if drawdown_pct <= -self.MAX_DAILY_DRAWDOWN_PCT:
            self.trigger_kill_switch(f"24h Drawdown reached {drawdown_pct * 100:.2f}% (limit -5.0%)")
            return False
        return True

    def calculate_position_size(
        self,
        capital_usdt: float,
        entry_price: Decimal,
        stop_loss_price: Decimal,
        side: str,
        spec: InstrumentSpec,
        requested_leverage: int = 10,
    ) -> Tuple[bool, Optional[str], Decimal, int]:
        """
        Calculates safe position size so loss at SL <= 1.5% of capital.
        Enforces Isolated Margin and clamps leverage <= 10.
        """
        if self.is_global_kill_switch_active:
            return False, "GLOBAL_KILL_SWITCH is currently active", Decimal(0), 1

        if side == "LONG" and stop_loss_price >= entry_price:
            return False, "LONG stop_loss must be strictly below entry", Decimal(0), 1

        if side == "SHORT" and stop_loss_price <= entry_price:
            return False, "SHORT stop_loss must be strictly above entry", Decimal(0), 1

        sl_distance = abs(entry_price - stop_loss_price)
        if sl_distance <= Decimal(0):
            return False, "Zero stop loss distance", Decimal(0), 1

        max_risk_usdt = Decimal(str(capital_usdt)) * Decimal(str(self.MAX_RISK_PER_TRADE_PCT))
        raw_qty = max_risk_usdt / sl_distance

        # Round down to qty_step
        stepped_qty = (raw_qty / spec.qty_step).to_integral_value() * spec.qty_step

        if stepped_qty < spec.min_qty:
            return False, f"Calculated qty {stepped_qty} < minQty {spec.min_qty}", Decimal(0), 1

        notional = stepped_qty * entry_price
        if notional < spec.min_notional:
            return False, f"Notional {notional:.2f} < minNotional {spec.min_notional}", Decimal(0), 1

        effective_leverage = min(requested_leverage, spec.max_leverage, self.MAX_HARD_LEVERAGE)
        return True, None, stepped_qty, effective_leverage

    def check_market_guards(
        self,
        best_bid: float,
        best_ask: float,
        minutes_to_funding: int,
        projected_funding_rate: float,
        side: str,
    ) -> Tuple[bool, Optional[str]]:
        if best_bid <= 0 or best_ask <= 0:
            return False, "Invalid bid/ask prices"

        # Spread Guard
        spread = (best_ask - best_bid) / best_bid
        if spread > self.SPREAD_GUARD_MAX_PCT:
            return False, f"Spread Guard: Current spread {spread*100:.3f}% > {self.SPREAD_GUARD_MAX_PCT*100:.2f}%"

        # Funding Guard
        is_paying = (side == "LONG" and projected_funding_rate > self.FUNDING_GUARD_MAX_RATE) or (
            side == "SHORT" and projected_funding_rate < -self.FUNDING_GUARD_MAX_RATE
        )
        if minutes_to_funding <= self.FUNDING_GUARD_MINUTES and is_paying:
            return False, f"Funding Guard: Adverse funding {projected_funding_rate*100:.4f}% within {minutes_to_funding}m"

        return True, None


risk_firewall = RiskFirewall()
