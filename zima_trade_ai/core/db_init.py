"""
SQLite WAL Database Schema Initializer
Creates the operational database at data/sqlite/zimatrade.db with Decimal TEXT fields.
"""
import os
import sqlite3
import logging

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

-- 1. Rules for exchange instruments
CREATE TABLE IF NOT EXISTS instruments (
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    market_type TEXT NOT NULL CHECK(market_type IN ('SPOT', 'FUTURES')),
    tick_size TEXT NOT NULL,
    qty_step TEXT NOT NULL,
    min_qty TEXT NOT NULL,
    min_notional TEXT NOT NULL,
    max_leverage INTEGER NOT NULL DEFAULT 10,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (exchange, symbol, market_type)
);

-- 2. AI Agents and Model Registry
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    engine_type TEXT NOT NULL CHECK(engine_type IN ('ONNX_RL', 'LIGHTGBM', 'TG_CHANNEL', 'HYBRID')),
    mode TEXT NOT NULL CHECK(mode IN ('SHADOW', 'QUARANTINE', 'LIVE', 'DISABLED')),
    model_path TEXT,
    sha256_hash TEXT,
    virtual_balance_usdt REAL NOT NULL DEFAULT 1000.0,
    live_allocation_usdt REAL NOT NULL DEFAULT 0.0,
    trades_count INTEGER NOT NULL DEFAULT 0,
    profit_factor REAL NOT NULL DEFAULT 0.0,
    sharpe_ratio REAL NOT NULL DEFAULT 0.0,
    max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
    updated_at INTEGER NOT NULL
);

-- 3. Telegram Channels and Trust Scoring
CREATE TABLE IF NOT EXISTS tg_channels (
    channel_id INTEGER PRIMARY KEY,
    username TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('QUARANTINE', 'APPROVED', 'BANNED')) DEFAULT 'QUARANTINE',
    first_seen_ts INTEGER NOT NULL,
    trust_score REAL NOT NULL DEFAULT 50.0,
    scam_edit_count INTEGER NOT NULL DEFAULT 0,
    total_signals INTEGER NOT NULL DEFAULT 0,
    win_rate_shadow REAL NOT NULL DEFAULT 0.0,
    net_pnl_shadow_pct REAL NOT NULL DEFAULT 0.0
);

-- 4. Extracted Signals and Lifecycle (Replies / Edits)
CREATE TABLE IF NOT EXISTS signals (
    signal_id TEXT PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES tg_channels(channel_id),
    tg_msg_id INTEGER NOT NULL,
    parent_tg_msg_id INTEGER,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('LONG', 'SHORT')),
    action_type TEXT NOT NULL CHECK(action_type IN ('NEW_ENTRY', 'CLOSE_PARTIAL', 'MOVE_SL_BE', 'CANCEL', 'FULL_CLOSE')),
    entry_low TEXT,
    entry_high TEXT,
    stop_loss TEXT,
    tp_json TEXT,
    raw_text TEXT NOT NULL,
    is_scam_edited INTEGER NOT NULL DEFAULT 0,
    created_ts INTEGER NOT NULL
);

-- 5. Unified Positions and Orders Ledger (Shadow & Live)
CREATE TABLE IF NOT EXISTS positions (
    position_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id),
    execution_mode TEXT NOT NULL CHECK(execution_mode IN ('SHADOW', 'LIVE')),
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('LONG', 'SHORT')),
    status TEXT NOT NULL CHECK(status IN ('PENDING_LIMIT', 'OPEN', 'CLOSED', 'CANCELLED')),
    qty TEXT NOT NULL,
    entry_price TEXT NOT NULL,
    stop_loss_price TEXT NOT NULL,
    tp_state_json TEXT NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 1,
    realized_pnl_usdt REAL NOT NULL DEFAULT 0.0,
    fees_paid_usdt REAL NOT NULL DEFAULT 0.0,
    funding_paid_usdt REAL NOT NULL DEFAULT 0.0,
    simulated_rtt_ms INTEGER,
    opened_ts INTEGER NOT NULL,
    closed_ts INTEGER
);
"""


def init_sqlite_db(db_path: str = "/app/data/sqlite/zimatrade.db") -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
        logger.info(f"Initialized SQLite WAL database at {db_path}")
    finally:
        conn.close()


if __name__ == "__main__":
    init_sqlite_db("./data/sqlite/zimatrade.db")
