"""
Unit tests for Risk Firewall: Kill-Switch, 1.5% max risk, and funding guards.
"""
from decimal import Decimal
from zima_trade_ai.engine.risk_firewall import RiskFirewall
from zima_trade_ai.core.instrument_cache import InstrumentSpec


def test_risk_firewall_1_5_percent_limit():
    firewall = RiskFirewall()
    spec = InstrumentSpec(
        exchange="bybit",
        symbol="BTCUSDT",
        market_type="FUTURES",
        tick_size=Decimal("0.1"),
        qty_step=Decimal("0.001"),
        min_qty=Decimal("0.001"),
        min_notional=Decimal("5.0"),
        max_leverage=10,
    )

    capital = 10000.0  # 1.5% max loss = 150 USDT
    entry = Decimal("60000")
    sl = Decimal("59000")  # Distance = 1000 USDT

    allowed, reason, qty, lev = firewall.calculate_position_size(
        capital_usdt=capital,
        entry_price=entry,
        stop_loss_price=sl,
        side="LONG",
        spec=spec,
        requested_leverage=25,  # Must be clamped to 10
    )

    assert allowed is True
    # 150 / 1000 = 0.15 BTC
    assert qty == Decimal("0.150")
    assert lev == 10


def test_kill_switch_trigger_on_5_percent_drawdown():
    firewall = RiskFirewall()
    assert firewall.is_global_kill_switch_active is False

    # Drawdown 4.5% -> OK
    ok = firewall.validate_daily_drawdown(initial_capital=10000.0, rolling_pnl_usdt=-450.0)
    assert ok is True
    assert firewall.is_global_kill_switch_active is False

    # Drawdown 5.2% -> Breach!
    ok = firewall.validate_daily_drawdown(initial_capital=10000.0, rolling_pnl_usdt=-520.0)
    assert ok is False
    assert firewall.is_global_kill_switch_active is True


def test_market_spread_and_funding_guards():
    firewall = RiskFirewall()

    # Normal spread
    ok, _ = firewall.check_market_guards(
        best_bid=60000.0,
        best_ask=60050.0,
        minutes_to_funding=30,
        projected_funding_rate=0.0001,
        side="LONG",
    )
    assert ok is True

    # Blown spread (> 0.25%)
    ok, reason = firewall.check_market_guards(
        best_bid=60000.0,
        best_ask=60200.0,  # 0.33%
        minutes_to_funding=30,
        projected_funding_rate=0.0001,
        side="LONG",
    )
    assert ok is False
    assert "Spread Guard" in reason

    # Adverse funding guard within 15 min
    ok, reason = firewall.check_market_guards(
        best_bid=60000.0,
        best_ask=60010.0,
        minutes_to_funding=10,
        projected_funding_rate=0.0015,  # 0.15% adverse to LONG
        side="LONG",
    )
    assert ok is False
    assert "Funding Guard" in reason
