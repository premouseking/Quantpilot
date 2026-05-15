"""参数优化路由：网格搜索（含 SSE 实时进度）与敏感性分析。"""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.engine.costs import CostModel
from app.optimization.grid_search import (
    GridResultItem,
    GridSearchConfig,
    SkippedCombination,
    run_grid_search,
)
from app.optimization.sensitivity import (
    SensitivityConfig,
    SkippedPoint,
    run_sensitivity_analysis,
)
from app.schemas.optimization import GridSearchRequest, SensitivityRequest

router = APIRouter(prefix="/optimization", tags=["optimization"])


def _result_to_dict(item: GridResultItem) -> dict[str, Any]:
    return {
        "params": item.params,
        "cumulative_return": item.cumulative_return,
        "annualized_return": item.annualized_return,
        "sharpe_ratio": item.sharpe_ratio,
        "max_drawdown": item.max_drawdown,
        "win_rate": item.win_rate,
        "trade_count": item.trade_count,
        "final_value": item.final_value,
        "sortino_ratio": item.sortino_ratio,
        "calmar_ratio": item.calmar_ratio,
    }


def _skipped_to_dict(item: SkippedCombination) -> dict[str, Any]:
    return {"params": item.params, "reason": item.reason}


def _build_config(request: GridSearchRequest) -> GridSearchConfig:
    return GridSearchConfig(
        template_id=request.template_id,
        symbol=request.symbol,
        start=request.start,
        end=request.end,
        frequency=request.frequency,
        initial_cash=request.initial_cash,
        data_provider=request.data_provider,
        param_grid=request.param_grid,
        cost_model=CostModel(),
        sort_by=request.sort_by,
    )


@router.post("/grid-search")
def grid_search(request: GridSearchRequest) -> dict[str, Any]:
    config = _build_config(request)
    results, skipped = run_grid_search(config)
    return {
        "template_id": request.template_id,
        "symbol": request.symbol,
        "total_combinations": len(results) + len(skipped),
        "valid_count": len(results),
        "skipped_count": len(skipped),
        "sort_by": request.sort_by,
        "results": [_result_to_dict(item) for item in results],
        "skipped": [_skipped_to_dict(item) for item in skipped],
    }


@router.post("/grid-search/stream")
async def grid_search_stream(request: GridSearchRequest):
    """SSE 实时流式网格搜索 — 线程执行 + asyncio.Queue 推送进度。"""
    config = _build_config(request)

    total = 1
    for vals in config.param_grid.values():
        total *= len(vals)

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def _run_in_thread() -> None:
        progress_events: list[dict[str, Any]] = []

        def on_progress(completed: int, _total: int, latest: GridResultItem | None):
            event: dict[str, Any] = {
                "type": "progress",
                "completed": completed,
                "total": _total,
            }
            if latest is not None:
                event["result"] = _result_to_dict(latest)
            progress_events.append(event)

        results, skipped = run_grid_search(config, on_progress=on_progress)

        # 将累积的进度事件批量推入队列
        batch_size = max(1, total // 10)
        for i, event in enumerate(progress_events):
            # 节流：跳过中间的密集事件
            if event.get("result") or i % batch_size == 0 or i == len(progress_events) - 1:
                event["completed"] = event.get("completed", 0)
                event["total"] = total
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    pass

        # 最终事件
        queue.put_nowait({
            "type": "complete",
            "completed": total,
            "total": total,
            "total_combinations": len(results) + len(skipped),
            "valid_count": len(results),
            "skipped_count": len(skipped),
            "results": [_result_to_dict(item) for item in results],
            "skipped": [_skipped_to_dict(item) for item in skipped],
        })

    thread = threading.Thread(target=_run_in_thread, daemon=True)
    thread.start()

    async def event_stream():
        while True:
            event = await queue.get()
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event.get("type") == "complete":
                break
        thread.join(timeout=1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sensitivity_result_to_dict(item) -> dict[str, Any]:
    return {
        "param_name": item.param_name,
        "title": item.title,
        "impact_score": item.impact_score,
        "points": [
            {
                "value": p.value,
                "cumulative_return": p.cumulative_return,
                "sharpe_ratio": p.sharpe_ratio,
                "max_drawdown": p.max_drawdown,
            }
            for p in item.points
        ],
    }


def _skipped_point_to_dict(item: SkippedPoint) -> dict[str, Any]:
    return {"param_name": item.param_name, "value": item.value, "reason": item.reason}


def _build_sensitivity_config(request: SensitivityRequest) -> SensitivityConfig:
    return SensitivityConfig(
        template_id=request.template_id,
        symbol=request.symbol,
        start=request.start,
        end=request.end,
        frequency=request.frequency,
        initial_cash=request.initial_cash,
        data_provider=request.data_provider,
        base_params=request.base_params,
        param_ranges={
            k: {"start": v.start, "end": v.end, "samples": v.samples}
            for k, v in request.param_ranges.items()
        },
        cost_model=CostModel(),
        samples_per_param=request.samples_per_param,
    )


@router.post("/sensitivity")
def sensitivity_analysis(request: SensitivityRequest) -> dict[str, Any]:
    config = _build_sensitivity_config(request)
    items, skipped = run_sensitivity_analysis(config)
    return {
        "template_id": request.template_id,
        "symbol": request.symbol,
        "total_points": sum(len(item.points) for item in items) + len(skipped),
        "valid_points": sum(len(item.points) for item in items),
        "skipped_count": len(skipped),
        "results": [_sensitivity_result_to_dict(item) for item in items],
        "skipped": [_skipped_point_to_dict(s) for s in skipped],
    }


@router.post("/sensitivity/stream")
async def sensitivity_analysis_stream(request: SensitivityRequest):
    """SSE 实时流式敏感性分析。"""

    config = _build_sensitivity_config(request)
    total_samples = sum(
        int(r.get("samples", config.samples_per_param)) for r in config.param_ranges.values()
    )

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def _run_in_thread() -> None:
        completed = 0

        def on_progress(param_name: str, done: int, total_param: int, _valid: bool):
            nonlocal completed
            completed += 1
            try:
                queue.put_nowait({
                    "type": "progress",
                    "param_name": param_name,
                    "completed": completed,
                    "total": total_samples,
                })
            except asyncio.QueueFull:
                pass

        results, skipped = run_sensitivity_analysis(config, on_progress=on_progress)

        queue.put_nowait({
            "type": "complete",
            "completed": total_samples,
            "total": total_samples,
            "total_points": sum(len(item.points) for item in results) + len(skipped),
            "valid_points": sum(len(item.points) for item in results),
            "skipped_count": len(skipped),
            "results": [_sensitivity_result_to_dict(item) for item in results],
            "skipped": [_skipped_point_to_dict(s) for s in skipped],
        })

    thread = threading.Thread(target=_run_in_thread, daemon=True)
    thread.start()

    async def event_stream():
        while True:
            event = await queue.get()
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event.get("type") == "complete":
                break
        thread.join(timeout=1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
