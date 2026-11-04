"""
Non-blocking Shared Memory Ring Buffer for zero-copy IPC between Process 1 (vCPU 0) and Process 2 (vCPU 1).
Designed for low-latency transmission of L2-50 orderbook snapshots and ticks.
"""
import struct
import time
from typing import Optional, Tuple
from multiprocessing import shared_memory


class ShmRingBuffer:
    """
    Binary ring buffer layout:
    [8 bytes: write_idx uint64]
    [8 bytes: read_idx uint64]
    [8 bytes: capacity uint64]
    [8 bytes: slot_size uint64]
    [Slots: capacity * (8 bytes timestamp_ns + 4 bytes payload_len + payload)]
    """
    HEADER_FMT = "=QQQQ"
    HEADER_SIZE = struct.calcsize(HEADER_FMT)

    def __init__(self, name: str, capacity: int = 1024, slot_size: int = 4096, create: bool = False):
        self.name = name
        self.capacity = capacity
        self.slot_size = slot_size
        self.total_slot_size = 12 + slot_size  # 8 bytes ts + 4 bytes len + payload
        self.total_bytes = self.HEADER_SIZE + (self.capacity * self.total_slot_size)

        if create:
            try:
                # Cleanup if already exists
                existing = shared_memory.SharedMemory(name=self.name)
                existing.close()
                existing.unlink()
            except FileNotFoundError:
                pass
            self.shm = shared_memory.SharedMemory(name=self.name, create=True, size=self.total_bytes)
            # Initialize header: write_idx=0, read_idx=0, capacity, slot_size
            struct.pack_into(self.HEADER_FMT, self.shm.buf, 0, 0, 0, self.capacity, self.slot_size)
        else:
            self.shm = shared_memory.SharedMemory(name=self.name, create=False)
            w_idx, r_idx, cap, s_size = struct.unpack_from(self.HEADER_FMT, self.shm.buf, 0)
            self.capacity = cap
            self.slot_size = s_size
            self.total_slot_size = 12 + s_size

    def push(self, data: bytes) -> bool:
        """Lock-free write by Process 1"""
        if len(data) > self.slot_size:
            raise ValueError(f"Data exceeds slot size {self.slot_size}")

        w_idx, r_idx, cap, _ = struct.unpack_from(self.HEADER_FMT, self.shm.buf, 0)
        slot_offset = self.HEADER_SIZE + ((w_idx % cap) * self.total_slot_size)
        now_ns = time.time_ns()

        # Write slot header (8 bytes ts_ns, 4 bytes len)
        struct.pack_into("=QI", self.shm.buf, slot_offset, now_ns, len(data))
        # Write payload
        self.shm.buf[slot_offset + 12 : slot_offset + 12 + len(data)] = data

        # Increment atomic write index
        struct.pack_into("=Q", self.shm.buf, 0, w_idx + 1)
        return True

    def pop(self) -> Optional[Tuple[int, bytes]]:
        """Lock-free read by Process 2"""
        w_idx, r_idx, cap, _ = struct.unpack_from(self.HEADER_FMT, self.shm.buf, 0)
        if r_idx >= w_idx:
            return None  # No new data

        slot_offset = self.HEADER_SIZE + ((r_idx % cap) * self.total_slot_size)
        ts_ns, payload_len = struct.unpack_from("=QI", self.shm.buf, slot_offset)
        data = bytes(self.shm.buf[slot_offset + 12 : slot_offset + 12 + payload_len])

        # Increment atomic read index
        struct.pack_into("=Q", self.shm.buf, 8, r_idx + 1)
        return ts_ns, data

    def close(self, unlink: bool = False) -> None:
        self.shm.close()
        if unlink:
            try:
                self.shm.unlink()
            except Exception:
                pass
