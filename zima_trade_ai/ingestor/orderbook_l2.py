"""
L2-50 Orderbook State Machine
Maintains full L2 depth, detects seq/u packet gaps, and triggers REST snapshot synchronization.
"""
from typing import Dict, List, Tuple, Optional
import time
import logging

logger = logging.getLogger(__name__)


class OrderbookL2:
    def __init__(self, symbol: str, depth_limit: int = 50):
        self.symbol = symbol
        self.depth_limit = depth_limit
        self.bids: Dict[float, float] = {}  # price -> qty
        self.asks: Dict[float, float] = {}  # price -> qty
        self.last_seq_id: int = 0
        self.last_update_ts: float = 0.0
        self.is_synced: bool = False

    def load_snapshot(self, bids: List[Tuple[float, float]], asks: List[Tuple[float, float]], seq_id: int) -> None:
        self.bids.clear()
        self.asks.clear()
        for p, q in bids:
            if q > 0:
                self.bids[p] = q
        for p, q in asks:
            if q > 0:
                self.asks[p] = q
        self.last_seq_id = seq_id
        self.last_update_ts = time.time()
        self.is_synced = True

    def apply_delta(
        self,
        bids_delta: List[Tuple[float, float]],
        asks_delta: List[Tuple[float, float]],
        prev_seq_id: Optional[int],
        seq_id: int,
    ) -> bool:
        """
        Check sequence integrity. If gap detected, invalidate sync and require REST snapshot.
        """
        if not self.is_synced:
            return False

        if prev_seq_id is not None and prev_seq_id != self.last_seq_id:
            logger.warning(
                f"[{self.symbol}] Sequence Gap Detected! Expected {self.last_seq_id}, got prev {prev_seq_id}. Resetting book."
            )
            self.is_synced = False
            return False

        for p, q in bids_delta:
            if q == 0.0:
                self.bids.pop(p, None)
            else:
                self.bids[p] = q

        for p, q in asks_delta:
            if q == 0.0:
                self.asks.pop(p, None)
            else:
                self.asks[p] = q

        self.last_seq_id = seq_id
        self.last_update_ts = time.time()
        return True

    def get_best_bid_ask(self) -> Tuple[Optional[float], Optional[float]]:
        best_bid = max(self.bids.keys()) if self.bids else None
        best_ask = min(self.asks.keys()) if self.asks else None
        return best_bid, best_ask

    def get_l2_depth(self) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
        sorted_bids = sorted(self.bids.items(), key=lambda x: x[0], reverse=True)[: self.depth_limit]
        sorted_asks = sorted(self.asks.items(), key=lambda x: x[0])[: self.depth_limit]
        return sorted_bids, sorted_asks

    def compute_obi(self, top_n: int = 20) -> float:
        """Order Book Imbalance (OBI) = (bid_vol - ask_vol) / (bid_vol + ask_vol)"""
        bids, asks = self.get_l2_depth()
        bid_vol = sum(q for _, q in bids[:top_n])
        ask_vol = sum(q for _, q in asks[:top_n])
        total = bid_vol + ask_vol
        if total == 0:
            return 0.0
        return (bid_vol - ask_vol) / total
