"""
Telegram Channel Author Reputation & 14-Day Quarantine Engine
Detects fake post retro-edits (SCAM_EDIT) and enforces quarantine before Live promotion.
"""
import time
from typing import Dict, Any, Optional
from pydantic import BaseModel


class ChannelReputation(BaseModel):
    channel_id: int
    title: str
    status: str = "QUARANTINE"  # "QUARANTINE" | "APPROVED" | "BANNED"
    first_seen_ts: int
    trust_score: float = 50.0
    scam_edit_count: int = 0
    total_signals: int = 0
    closed_signals: int = 0
    win_rate_shadow: float = 0.0
    profit_factor: float = 0.0
    max_drawdown_pct: float = 0.0


class AuthorScoring:
    QUARANTINE_DAYS = 14
    MIN_SIGNALS_FOR_PROMOTION = 20
    MIN_PROFIT_FACTOR = 1.4
    MAX_DRAWDOWN_PCT = 8.0

    def __init__(self) -> None:
        self.channels: Dict[int, ChannelReputation] = {}

    def get_or_register_channel(self, channel_id: int, title: str) -> ChannelReputation:
        if channel_id not in self.channels:
            self.channels[channel_id] = ChannelReputation(
                channel_id=channel_id,
                title=title,
                status="QUARANTINE",
                first_seen_ts=int(time.time()),
            )
        return self.channels[channel_id]

    def record_edit_event(self, channel_id: int, published_ts: int, edit_ts: int) -> bool:
        """
        If numbers modified > 180 seconds after initial publication, flag as SCAM_EDIT.
        """
        ch = self.channels.get(channel_id)
        if not ch:
            return False

        delta_sec = edit_ts - published_ts
        if delta_sec > 180:
            ch.scam_edit_count += 1
            ch.trust_score = max(0.0, ch.trust_score - 35.0)
            if ch.trust_score < 20.0 or ch.scam_edit_count >= 3:
                ch.status = "BANNED"
            return True
        return False

    def update_performance(
        self,
        channel_id: int,
        pnl_pct: float,
        is_win: bool,
    ) -> None:
        ch = self.channels.get(channel_id)
        if not ch:
            return

        ch.closed_signals += 1
        # Recompute win rate
        total_wins = (ch.win_rate_shadow * (ch.closed_signals - 1) + (1.0 if is_win else 0.0))
        ch.win_rate_shadow = total_wins / ch.closed_signals

        # Evaluate promotion from QUARANTINE to APPROVED
        now = time.time()
        days_in_quarantine = (now - ch.first_seen_ts) / 86400.0

        if ch.status == "QUARANTINE":
            if (
                days_in_quarantine >= self.QUARANTINE_DAYS
                and ch.closed_signals >= self.MIN_SIGNALS_FOR_PROMOTION
                and ch.profit_factor >= self.MIN_PROFIT_FACTOR
                and ch.max_drawdown_pct <= self.MAX_DRAWDOWN_PCT
                and ch.scam_edit_count == 0
            ):
                ch.status = "APPROVED"


author_scoring = AuthorScoring()
