"""
Stage 1 Regex Filter
Cuts 85% of noise, ads, memes, and chatter in 0 ms before calling LLM APIs.
"""
import re
from typing import Optional, Dict, Any, Tuple


class RegexGate:
    # Match coin tickers e.g. BTC, ETH, SOL, BTCUSDT, #BTC
    SYMBOL_PATTERN = re.compile(r"(?:#|\$)?([A-Z0-9]{2,10})(?:/USDT|USDT|\.P)?\b", re.IGNORECASE)
    SIDE_PATTERN = re.compile(r"\b(LONG|BUY|SHORT|SELL|ЛОНГ|ШОРТ|ПОКУПКА|ПРОДАЖА)\b", re.IGNORECASE)
    PRICE_PATTERN = re.compile(r"\b(?:ENTRY|ВХОД|PRICE|ЦЕНА|BUY|SELL)?\s*[:=\s]?\s*([0-9]+(?:\.[0-9]+)?)\b", re.IGNORECASE)
    SL_PATTERN = re.compile(r"\b(?:SL|STOP|СТОП|STOP LOSS|STOPLOSS)\s*[:=\s]?\s*([0-9]+(?:\.[0-9]+)?)\b", re.IGNORECASE)
    TP_PATTERN = re.compile(r"\b(?:TP|TAKE|ТЕЙК|TARGET|TP\d?)\s*[:=\s]?\s*([0-9]+(?:\.[0-9]+)?)\b", re.IGNORECASE)

    # Fast rejection of ads / affiliate spam
    SPAM_PATTERNS = [
        re.compile(r"\b(?:giveaway|airdrop|vip channel|скидка|премиум|подписка|сигналы vip)\b", re.IGNORECASE),
        re.compile(r"t\.me\/(?:\+[a-zA-Z0-9]+|joinchat)", re.IGNORECASE),
    ]

    @classmethod
    def filter_message(cls, text: str, is_reply: bool = False) -> Tuple[bool, Optional[str]]:
        """
        Fast check. Returns (passes_filter, reason).
        Replies to existing trades pass easily to capture SL/TP adjustments.
        """
        if not text or len(text.strip()) < 10:
            return False, "Message too short"

        for spam in cls.SPAM_PATTERNS:
            if spam.search(text):
                return False, "Matched advertisement/spam keyword"

        if is_reply:
            # Check for position management keywords
            mgmt = re.search(r"\b(CLOSE|BE|BREAKEVEN|БУ|БЕЗУБЫТОК|ЗАКРЫТЬ|ФИКС|CANCEL|ОТМЕНА)\b", text, re.I)
            if mgmt:
                return True, "Reply management command"

        # Check for standard signal components
        has_side = bool(cls.SIDE_PATTERN.search(text))
        has_symbol = bool(cls.SYMBOL_PATTERN.search(text))
        has_sl = bool(cls.SL_PATTERN.search(text))
        has_tp = bool(cls.TP_PATTERN.search(text))

        if has_symbol and has_side and (has_sl or has_tp):
            return True, "Valid trading signal candidate"

        return False, "Failed trading signal regex threshold"


regex_gate = RegexGate()
