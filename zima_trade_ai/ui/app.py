"""
ZimaTrade AI - FastAPI & NiceGUI Real-Time Terminal Controller
Runs on Node A Process 2 (vCPU 1) with SQLite WAL and SharedMemory IPC interface.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import time
import os
from zima_trade_ai.engine.risk_firewall import risk_firewall
from zima_trade_ai.engine.execution_router import execution_router
from zima_trade_ai.intelligence.author_scoring import author_scoring
from zima_trade_ai.ai_arena.onnx_runner import onnx_runner

app = FastAPI(title="ZimaTrade AI Engine API", version="1.0.0")

startup_ts = time.time()
vcpu0_last_heartbeat = time.time()


@app.get("/health")
def health_check():
    """Polled by Cloudflare Worker Dead-Man's Switch"""
    age = time.time() - vcpu0_last_heartbeat
    return {
        "status": "healthy" if age < 5.0 else "unresponsive",
        "vcpu0_loop_age_sec": age,
        "uptime_sec": time.time() - startup_ts,
        "kill_switch_active": risk_firewall.is_global_kill_switch_active,
        "mode": execution_router.mode,
    }


@app.post("/api/kill_switch/trigger")
def emergency_kill_switch():
    risk_firewall.trigger_kill_switch("Manual user trigger from web terminal")
    return {"status": "SUCCESS", "kill_switch": True}


@app.post("/api/kill_switch/reset")
def reset_kill_switch():
    risk_firewall.reset_kill_switch()
    return {"status": "SUCCESS", "kill_switch": False}


@app.get("/api/arena/leaderboard")
def get_arena_leaderboard():
    return {
        "models": list(onnx_runner.models.values()),
        "channels": list(author_scoring.channels.values()),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
