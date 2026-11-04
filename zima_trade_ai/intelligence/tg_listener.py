"""
Read-Only Telethon UserBot Listener
Listens to trading signals, reply management commands, and edited messages.
Strict read-only safety: absolutely zero outbound messages or auto-joins.
"""
import time
import logging
from typing import Optional, Callable, Awaitable
from telethon import TelegramClient, events
from zima_trade_ai.intelligence.regex_gate import regex_gate
from zima_trade_ai.intelligence.author_scoring import author_scoring
from zima_trade_ai.config.settings import settings

logger = logging.getLogger(__name__)


class TelegramSignalListener:
    def __init__(self, on_signal_callback: Optional[Callable[[dict], Awaitable[None]]] = None):
        self.client: Optional[TelegramClient] = None
        self.on_signal = on_signal_callback
        self.message_cache = {}  # msg_id -> (published_ts, text)

    def init_client(self) -> TelegramClient:
        if not settings.TG_API_ID or not settings.TG_API_HASH:
            logger.info("Telegram API credentials empty. UserBot running in dry-run simulation mode.")
            return None

        self.client = TelegramClient(
            settings.TG_SESSION_NAME,
            settings.TG_API_ID,
            settings.TG_API_HASH,
        )
        self._register_handlers()
        return self.client

    def _register_handlers(self) -> None:
        if not self.client:
            return

        @self.client.on(events.NewMessage(incoming=True))
        async def handle_new_message(event):
            text = event.raw_text or ""
            is_reply = event.is_reply
            reply_to_id = event.reply_to_msg_id if is_reply else None

            # Fast Stage 1 Regex Filter
            passed, reason = regex_gate.filter_message(text, is_reply=is_reply)
            if not passed:
                return

            self.message_cache[event.id] = (int(time.time()), text)

            payload = {
                "event_type": "REPLY_MANAGEMENT" if is_reply else "NEW_SIGNAL",
                "channel_id": event.chat_id,
                "msg_id": event.id,
                "parent_msg_id": reply_to_id,
                "raw_text": text,
                "ts": int(time.time()),
            }

            if self.on_signal:
                await self.on_signal(payload)

        @self.client.on(events.MessageEdited)
        async def handle_edited_message(event):
            msg_id = event.id
            channel_id = event.chat_id
            now = int(time.time())

            cached = self.message_cache.get(msg_id)
            if cached:
                published_ts, orig_text = cached
                is_scam = author_scoring.record_edit_event(channel_id, published_ts, now)
                if is_scam:
                    logger.warning(
                        f"SCAM_EDIT detected in channel {channel_id} on msg {msg_id}! "
                        f"Edited after {now - published_ts}s."
                    )


tg_listener = TelegramSignalListener()
