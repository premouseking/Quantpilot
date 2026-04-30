"""Health check and runtime info."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_runtime_config

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/runtime")
def runtime() -> dict[str, object]:
    config = get_runtime_config()
    return {
        "profile": config.profile,
        "api_host": config.api_host,
        "api_port": config.api_port,
        "data_dir": str(config.data_dir),
        "runs_dir": str(config.runs_dir),
        "market_dir": str(config.market_dir),
    }
