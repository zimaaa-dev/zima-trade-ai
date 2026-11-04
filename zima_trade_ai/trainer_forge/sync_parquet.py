"""
Sync Parquet Archives from Node A to Node B
Runs on Home GPU Workstation. Throttled to 5 MB/s and idle I/O priority (ionice -c 3).
"""
import os
import time
import subprocess
import logging

logger = logging.getLogger(__name__)


def sync_archives_throttled(
    remote_host: str = "node-a.tailscale",
    remote_path: str = "/app/data/parquet/",
    local_path: str = "./data/parquet/",
    bandwidth_limit_kbps: int = 5120,  # 5 MB/s
) -> None:
    os.makedirs(local_path, exist_ok=True)
    rsync_cmd = [
        "ionice", "-c", "3",
        "rsync", "-avz",
        f"--bwlimit={bandwidth_limit_kbps}",
        "--partial",
        f"{remote_host}:{remote_path}",
        local_path,
    ]
    logger.info(f"Syncing Parquet archives with 5 MB/s limit: {' '.join(rsync_cmd)}")
    try:
        subprocess.run(rsync_cmd, check=True)
        logger.info("Parquet sync completed.")
    except Exception as e:
        logger.error(f"Sync error: {e}")


if __name__ == "__main__":
    sync_archives_throttled()
