"""
Streaming Causal Feature Pipeline
Computes online Rolling Z-Scores with zero look-ahead bias for real-time inference.
"""
from collections import deque
import math
from typing import List, Dict, Optional
import numpy as np


class CausalRollingZScore:
    """Welford's algorithm / online rolling statistics for zero look-ahead z-score"""
    def __init__(self, window_size: int = 120):
        self.window_size = window_size
        self.buffer = deque(maxlen=window_size)

    def update(self, val: float) -> float:
        self.buffer.append(val)
        if len(self.buffer) < 5:
            return 0.0

        mean = sum(self.buffer) / len(self.buffer)
        var = sum((x - mean) ** 2 for x in self.buffer) / (len(self.buffer) - 1)
        std = math.sqrt(var) if var > 1e-9 else 1e-5
        return (val - mean) / std


class FeaturePipeline:
    def __init__(self) -> None:
        self.z_obi = CausalRollingZScore(120)
        self.z_vpin = CausalRollingZScore(120)
        self.z_vol_surge = CausalRollingZScore(60)

    def extract_features(
        self,
        obi_l20: float,
        vpin: float,
        buy_vol_1s: float,
        sell_vol_1s: float,
        spread_bps: float,
    ) -> np.ndarray:
        """
        Builds causal feature vector for ONNX / LightGBM models:
        [z_obi, z_vpin, z_vol_surge, trade_imbalance, spread_bps]
        """
        vol_total = buy_vol_1s + sell_vol_1s
        trade_imbalance = (buy_vol_1s - sell_vol_1s) / (vol_total + 1e-6)

        feat_vector = np.array([
            self.z_obi.update(obi_l20),
            self.z_vpin.update(vpin),
            self.z_vol_surge.update(vol_total),
            trade_imbalance,
            spread_bps,
        ], dtype=np.float32)

        return feat_vector


feature_pipeline = FeaturePipeline()
