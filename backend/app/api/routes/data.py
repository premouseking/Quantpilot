"""Data source and bar preview endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query

from app.data.models import Frequency
from app.data.registry import get_data_provider_registry

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/providers")
def list_providers() -> dict[str, list[str]]:
    registry = get_data_provider_registry()
    return {"providers": registry.list()}


@router.get("/providers/{provider}/symbols")
def list_symbols(provider: str) -> dict[str, list[str]]:
    registry = get_data_provider_registry()
    data_provider = registry.get(provider)
    return {"symbols": data_provider.list_symbols()}


@router.get("/providers/{provider}/bars")
def get_bars(
    provider: str,
    symbol: str = Query(...),
    start: datetime = Query(...),
    end: datetime = Query(...),
    frequency: Frequency = Query(Frequency.DAILY),
    limit: int = Query(500, ge=1, le=5000),
) -> dict[str, Any]:
    registry = get_data_provider_registry()
    data_provider = registry.get(provider)
    df = data_provider.get_bars(symbol, frequency, start, end)
    if len(df) > limit:
        df = df.tail(limit)
    bars = [
        {
            "timestamp": row.timestamp.isoformat(),
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
            "volume": float(row.volume),
        }
        for row in df.itertuples(index=False)
    ]
    return {
        "provider": provider,
        "symbol": symbol,
        "frequency": frequency.value,
        "count": len(bars),
        "bars": bars,
    }
