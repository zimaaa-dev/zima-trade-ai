"""
Exchange State Reconciliation (Python Read-Only Isolation)
TypeScript server.ts owns OKX V5 LIVE state, startup reconciliation, and order tracking.
Python contour MUST NEVER claim LIVE reconciliation success or drive Bybit DCP.
"""
import logging
from typing import Dict, Any, List
import aiohttp
from zima_trade_ai.config.settings import settings

logger = logging.getLogger(__name__)


class ExchangeReconciliation:
    def __init__(self) -> None:
        self.is_reconciled: bool = False
        self.live_positions: List[Dict[str, Any]] = []
        self.live_orders: List[Dict[str, Any]] = []
        self.ownership_note: str = "TS_EXECUTION_OWNER_ONLY"

    async def reconcile_startup_state(self, session: aiohttp.ClientSession | None = None) -> bool:
        """
        Python contour is isolated from LIVE exchange execution (ALLOW_PYTHON_LIVE_EXECUTION=False).
        Always refuses LIVE ownership and keeps is_reconciled=False when Python LIVE is disabled.
        """
        if not settings.ALLOW_PYTHON_LIVE_EXECUTION:
            self.is_reconciled = False
            self.live_positions = []
            self.live_orders = []
            logger.warning(
                "Python reconciliation skipped: TypeScript server.ts is sole OKX LIVE execution owner."
            )
            return False

        self.is_reconciled = False
        return False

    def get_read_only_snapshot(self) -> Dict[str, Any]:
        return {
            "active_exchange": settings.ACTIVE_EXCHANGE,
            "allow_python_live_execution": settings.ALLOW_PYTHON_LIVE_EXECUTION,
            "is_reconciled": self.is_reconciled,
            "ownership_note": self.ownership_note,
        }


reconciliation = ExchangeReconciliation()
