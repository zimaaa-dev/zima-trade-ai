"""
Unit tests for Matching Engine: VWAP slippage, limit order queue, and fees.
"""
from zima_trade_ai.engine.matching_engine import VirtualMatchingEngine


def test_vwap_slippage_calculation():
    engine = VirtualMatchingEngine(live_rtt_ms=25.0)

    # Orderbook asks: 0.5 BTC @ 60,000, 0.5 BTC @ 60,010, 1.0 BTC @ 60,050
    asks = [(60000.0, 0.5), (60010.0, 0.5), (60050.0, 1.0)]
    bids = [(59990.0, 1.0)]

    # Buy 1.0 BTC: 0.5 @ 60,000 + 0.5 @ 60,010 -> VWAP = 60,005.0
    res = engine.execute_market_order("BUY", 1.0, asks, bids)

    assert res.filled is True
    assert res.executed_qty == 1.0
    assert res.vwap_price == 60005.0
    assert abs(res.fee_usdt - (60005.0 * 0.00055)) < 1e-4
    assert res.simulated_rtt_ms == 45.0  # 25ms + 20ms


def test_limit_queue_and_penetration():
    engine = VirtualMatchingEngine(live_rtt_ms=30.0)

    # Place virtual limit BUY for 0.1 BTC at 60,000 with 2.0 BTC queue ahead
    order = engine.place_limit_order(
        order_id="ord_1",
        symbol="BTCUSDT",
        side="BUY",
        limit_price=60000.0,
        order_qty=0.1,
        current_book_qty_at_price=2.0,
    )

    # Tick 1: Trade at 60,000 with volume 1.5 BTC (not enough to clear 2.0 + 0.1)
    fills = engine.on_trade_tick("BTCUSDT", 60000.0, 1.5, best_bid=59999.0, best_ask=60000.0)
    assert len(fills) == 0

    # Tick 2: Trade at 60,000 with volume 0.7 BTC (1.5 + 0.7 = 2.2 >= 2.1)
    fills = engine.on_trade_tick("BTCUSDT", 60000.0, 0.7, best_bid=59999.0, best_ask=60000.0)
    assert len(fills) == 1
    assert fills[0][0] == "ord_1"
    assert fills[0][1].filled is True


def test_penetration_instant_fill():
    engine = VirtualMatchingEngine(live_rtt_ms=20.0)
    engine.place_limit_order("ord_2", "BTCUSDT", "BUY", 60000.0, 0.1, 5.0)

    # Best ask dips below limit price (59,995 < 60,000)
    fills = engine.on_trade_tick("BTCUSDT", 59995.0, 0.01, best_bid=59990.0, best_ask=59995.0)
    assert len(fills) == 1
    assert fills[0][0] == "ord_2"
    assert "PENETRATION" in fills[0][1].reason
