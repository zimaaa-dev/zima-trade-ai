"""
Multi-Account Ollama Client & Model Router
Rotates endpoints on HTTP 429, routes fast signals to 20b/30b and deep macro to 120b/ultra.
"""
import json
import logging
from typing import Dict, Any, List, Optional
import aiohttp
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ParsedSignalPydantic(BaseModel):
    symbol: str = Field(description="Normalized crypto pair e.g. BTCUSDT")
    side: str = Field(description="LONG or SHORT")
    action_type: str = Field(default="NEW_ENTRY", description="NEW_ENTRY, CLOSE_PARTIAL, MOVE_SL_BE, CANCEL, FULL_CLOSE")
    entry_low: float
    entry_high: float
    stop_loss: float
    tp_grid: List[Dict[str, float]] = Field(default_factory=list, description="[{'price': 150.0, 'share': 0.5}]")
    confidence: float = Field(default=0.85)


class OllamaClient:
    def __init__(self, endpoints: Optional[List[str]] = None):
        self.endpoints = endpoints or ["http://127.0.0.1:11434"]
        self.current_idx = 0

    def _get_next_endpoint(self) -> str:
        ep = self.endpoints[self.current_idx % len(self.endpoints)]
        self.current_idx += 1
        return ep

    async def parse_signal_json(self, raw_text: str, model: str = "gpt-oss:20b") -> Optional[ParsedSignalPydantic]:
        prompt = f"""
You are an institutional crypto trade signal parser.
Parse the following trading post into a STRICT JSON conforming to the schema:
{{
  "symbol": "BTCUSDT",
  "side": "LONG" or "SHORT",
  "action_type": "NEW_ENTRY" or "CLOSE_PARTIAL" or "MOVE_SL_BE" or "CANCEL" or "FULL_CLOSE",
  "entry_low": float,
  "entry_high": float,
  "stop_loss": float,
  "tp_grid": [{{"price": float, "share": float}}]
}}
Rules:
- Symbol must end with USDT.
- If single entry price, set entry_low == entry_high.
- tp_grid shares must sum to 1.0.

POST:
{raw_text}
"""
        payload = {
            "model": model,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.0},
        }

        attempts = len(self.endpoints) * 2
        for _ in range(attempts):
            endpoint = self._get_next_endpoint()
            url = f"{endpoint}/api/generate"
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=8.0)) as resp:
                        if resp.status == 429:
                            logger.warning(f"Ollama {endpoint} hit 429. Rotating...")
                            continue
                        if resp.status == 200:
                            data = await resp.json()
                            raw_response = data.get("response", "{}")
                            parsed = json.loads(raw_response)
                            return ParsedSignalPydantic(**parsed)
            except Exception as e:
                logger.debug(f"Ollama request error on {endpoint}: {e}")

        logger.error("All Ollama endpoints exhausted or failed to parse signal.")
        return None

    async def analyze_macro_sentiment(self, news_text: str, model: str = "gpt-oss:120b") -> Dict[str, Any]:
        """Deep macro reasoning for sentiment and global risk weight adjustments"""
        prompt = f"Analyze market impact (-1.0 to +1.0) and key affected tokens:\n{news_text}"
        payload = {
            "model": model,
            "prompt": prompt,
            "format": "json",
            "stream": False,
        }
        endpoint = self._get_next_endpoint()
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{endpoint}/api/generate", json=payload, timeout=aiohttp.ClientTimeout(total=15.0)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return json.loads(data.get("response", "{}"))
        except Exception as e:
            logger.warning(f"Macro analysis failed: {e}")
        return {"sentiment_score": 0.0, "risk_multiplier": 1.0}


ollama_client = OllamaClient()
