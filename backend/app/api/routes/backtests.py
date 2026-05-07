"""回测运行：创建任务、列出历史、按 run_id 加载报告。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.schemas.backtest import BacktestRunRequest
from app.services.backtest_service import run_backtest_request
from app.storage.run_store import get_run_store

router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("/runs")
def create_backtest_run(request: BacktestRunRequest) -> dict[str, Any]:
    payload = request.model_dump(mode="json")
    payload["frequency"] = request.frequency.value
    return run_backtest_request(payload)


@router.get("/runs")
def list_backtest_runs(limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
    store = get_run_store()
    return {"runs": store.list_runs(limit=limit)}


@router.get("/runs/{run_id}")
def get_backtest_run(run_id: str) -> dict[str, Any]:
    store = get_run_store()
    return store.load(run_id)
