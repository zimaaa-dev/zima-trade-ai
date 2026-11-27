import asyncio
import importlib
import sys
import types
import unittest
from decimal import Decimal


def _install_optional_dependency_stubs() -> None:
    """
    Lightweight fallback stubs ONLY when pydantic / pydantic_settings / aiohttp
    are not installed in a minimal test container. On VPS with full venv, real libs are used.
    """
    if "pydantic" not in sys.modules:
        try:
            importlib.import_module("pydantic")
        except ImportError:
            pydantic_mod = types.ModuleType("pydantic")

            class _FieldInfo:
                def __init__(self, default=None):
                    self.default = default

            def Field(default=None, **_kwargs):
                return default

            class BaseModel:
                def __init__(self, **kwargs):
                    annotations = getattr(self.__class__, "__annotations__", {})
                    for key in annotations:
                        if key in kwargs:
                            val = kwargs[key]
                        elif hasattr(self.__class__, key):
                            val = getattr(self.__class__, key)
                        else:
                            val = None
                        setattr(self, key, val)
                    for key, val in kwargs.items():
                        setattr(self, key, val)

                def model_dump(self):
                    return dict(self.__dict__)

                def dict(self):
                    return dict(self.__dict__)

            pydantic_mod.BaseModel = BaseModel
            pydantic_mod.Field = Field
            sys.modules["pydantic"] = pydantic_mod

    if "pydantic_settings" not in sys.modules:
        try:
            importlib.import_module("pydantic_settings")
        except ImportError:
            ps_mod = types.ModuleType("pydantic_settings")

            class BaseSettings:
                def __init__(self, **kwargs):
                    for cls in reversed(self.__class__.__mro__):
                        for key, val in cls.__dict__.items():
                            if not key.startswith("_") and key != "Config" and not isinstance(val, (property, types.FunctionType, classmethod, staticmethod)):
                                setattr(self, key, val)
                    for key, val in kwargs.items():
                        setattr(self, key, val)

            ps_mod.BaseSettings = BaseSettings
            sys.modules["pydantic_settings"] = ps_mod

    if "aiohttp" not in sys.modules:
        try:
            importlib.import_module("aiohttp")
        except ImportError:
            aiohttp_mod = types.ModuleType("aiohttp")

            class ClientSession:
                pass

            aiohttp_mod.ClientSession = ClientSession
            sys.modules["aiohttp"] = aiohttp_mod


_install_optional_dependency_stubs()

from zima_trade_ai.config.settings import settings
from zima_trade_ai.core.instrument_cache import instrument_cache
from zima_trade_ai.engine.execution_router import ExecutionRouter
from zima_trade_ai.engine.matching_engine import VirtualMatchingEngine
from zima_trade_ai.engine.reconciliation import ExchangeReconciliation
from zima_trade_ai.engine.risk_firewall import RiskFirewall


class PythonContourIsolationTests(unittest.TestCase):
    def test_settings_enforce_okx_ts_owner_and_dca_off(self):
        self.assertEqual(settings.ACTIVE_EXCHANGE, "OKX")
        self.assertFalse(settings.ALLOW_PYTHON_LIVE_EXECUTION)
        self.assertFalse(settings.DCA_ENABLED)
        self.assertTrue(settings.SHADOW_LEARNING_ONLY)
        self.assertLessEqual(settings.MAX_HARD_LEVERAGE, 5)

    def test_execution_router_forbids_live_mode_and_dca_orders(self):
        router = ExecutionRouter()
        with self.assertRaises(PermissionError):
            router.set_mode("LIVE")

        dca_res = asyncio.run(
            router.route_order(
                agent_id="shadow-bot",
                exchange="okx",
                symbol="BTC-USDT-SWAP",
                side="LONG",
                order_type="MARKET",
                qty=0.05,
                price=None,
                stop_loss=65000.0,
                tp_grid=[{"price": 72000.0, "share": 1.0}],
                l2_snapshot={"asks": [(68000.0, 1.0)], "bids": [(67990.0, 1.0)]},
                is_dca_order=True,
            )
        )
        self.assertEqual(dca_res["status"], "REJECTED")
        self.assertEqual(dca_res["reason"], "DCA_DISABLED_BY_SYSTEM_POLICY")

        shadow_res = asyncio.run(
            router.route_order(
                agent_id="shadow-bot",
                exchange="okx",
                symbol="BTC-USDT-SWAP",
                side="LONG",
                order_type="MARKET",
                qty=0.05,
                price=None,
                stop_loss=65000.0,
                tp_grid=[{"price": 72000.0, "share": 1.0}],
                l2_snapshot={"asks": [(68000.0, 1.0)], "bids": [(67990.0, 1.0)]},
                is_dca_order=False,
            )
        )
        self.assertEqual(shadow_res["status"], "FILLED")
        self.assertEqual(shadow_res["mode"], "SHADOW")

    def test_matching_engine_uses_okx_taker_fee_005pct(self):
        engine = VirtualMatchingEngine(live_rtt_ms=20.0)
        res = engine.execute_market_order(
            side="BUY",
            target_qty=1.0,
            l2_asks=[(1000.0, 2.0)],
            l2_bids=[(999.5, 2.0)],
        )
        self.assertTrue(res.filled)
        self.assertAlmostEqual(res.fee_usdt, 1000.0 * 0.0005, places=6)

    def test_reconciliation_refuses_live_ownership(self):
        rec = ExchangeReconciliation()
        ok = asyncio.run(rec.reconcile_startup_state(None))
        self.assertFalse(ok)
        self.assertFalse(rec.is_reconciled)
        self.assertEqual(rec.get_read_only_snapshot()["ownership_note"], "TS_EXECUTION_OWNER_ONLY")

    def test_risk_firewall_kill_switch_and_leverage_cap(self):
        fw = RiskFirewall()
        spec = instrument_cache.get_rule("okx", "BTC-USDT-SWAP", "FUTURES")
        self.assertIsNotNone(spec)

        allowed, reason, qty, lev = fw.calculate_position_size(
            capital_usdt=10000.0,
            entry_price=Decimal("50000"),
            stop_loss_price=Decimal("49500"),
            side="LONG",
            spec=spec,
            requested_leverage=20,
        )
        self.assertTrue(allowed, msg=reason)
        self.assertEqual(lev, 5)
        self.assertGreater(qty, Decimal("0"))

        fw.trigger_kill_switch("unit-test")
        blocked, block_reason, _, _ = fw.calculate_position_size(
            capital_usdt=10000.0,
            entry_price=Decimal("50000"),
            stop_loss_price=Decimal("49500"),
            side="LONG",
            spec=spec,
            requested_leverage=4,
        )
        self.assertFalse(blocked)
        self.assertIn("GLOBAL_KILL_SWITCH", block_reason or "")

    def test_onnx_runner_blocks_auto_promotion_in_shadow_mode(self):
        import types as _types
        if "numpy" not in sys.modules:
            np_mod = _types.ModuleType("numpy")
            np_mod.ndarray = object
            np_mod.argmax = lambda arr: 0
            sys.modules["numpy"] = np_mod
        from zima_trade_ai.ai_arena.onnx_runner import ModelMetadata, OnnxModelRunner
        runner = OnnxModelRunner()
        meta = ModelMetadata("cand-ppo", "abc123", mode="QUARANTINE")
        meta.trades_count = 30
        meta.profit_factor = 1.8
        meta.max_drawdown_pct = 2.0
        runner.models["cand-ppo"] = meta
        runner.record_forward_trade("cand-ppo", 1.2)
        self.assertNotEqual(runner.models["cand-ppo"].mode, "LIVE")
        self.assertEqual(runner.models["cand-ppo"].mode, "SHADOW_ELIGIBLE")


if __name__ == "__main__":
    unittest.main()
