"""
Ring Storage Manager
Enforces 10 GB quota for local Parquet archives, orchestrates S3 archival and FIFO cleanup.
"""
import os
import glob
import shutil
import logging
from typing import List

logger = logging.getLogger(__name__)


class RingStorageManager:
    def __init__(self, parquet_dir: str = "/app/data/parquet", max_storage_gb: int = 10):
        self.parquet_dir = parquet_dir
        self.max_bytes = max_storage_gb * 1024 * 1024 * 1024
        os.makedirs(self.parquet_dir, exist_ok=True)

    def get_current_usage_bytes(self) -> int:
        total = 0
        for root, _, files in os.walk(self.parquet_dir):
            for f in files:
                fp = os.path.join(root, f)
                total += os.path.getsize(fp)
        return total

    def get_oldest_files(self) -> List[str]:
        all_files = glob.glob(os.path.join(self.parquet_dir, "**/*.parquet"), recursive=True)
        all_files.sort(key=os.path.getmtime)
        return all_files

    def check_and_prune_fifo(self) -> int:
        """
        If current usage > 90% of quota, prune oldest files down to 75% of quota.
        Returns bytes freed.
        """
        current_bytes = self.get_current_usage_bytes()
        threshold_high = self.max_bytes * 0.90
        target_bytes = self.max_bytes * 0.75

        if current_bytes <= threshold_high:
            return 0

        logger.warning(f"Parquet storage high ({current_bytes / 1e9:.2f} GB). Starting FIFO pruning...")
        bytes_freed = 0
        oldest_files = self.get_oldest_files()

        for filepath in oldest_files:
            if current_bytes - bytes_freed <= target_bytes:
                break
            try:
                sz = os.path.getsize(filepath)
                os.remove(filepath)
                bytes_freed += sz
                logger.info(f"Pruned archive {filepath} ({sz / 1024:.1f} KB)")
            except Exception as e:
                logger.error(f"Error deleting {filepath}: {e}")

        logger.info(f"FIFO prune complete. Freed {bytes_freed / 1e6:.1f} MB.")
        return bytes_freed


ring_storage = RingStorageManager()
