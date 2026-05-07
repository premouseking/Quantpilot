"""数据源枚举、标的列表与 K 线预览接口。"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, UploadFile

from app.core.config import get_runtime_config
from app.data.csv_ingest import normalize_upload_symbol, parse_upload_csv_bytes, write_market_csv
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


@router.post("/providers/csv/upload")
async def upload_market_csv(
    symbol: str = Form(...),
    frequency: Frequency = Form(Frequency.DAILY),  # noqa: B008
    file: UploadFile = File(...),  # noqa: B008
) -> dict[str, Any]:
    """将 CSV 校验后写入 ``market_dir/<frequency>/<symbol>.csv``（覆盖同名文件）。

    表单字段：`symbol`、`frequency`（与 ``Frequency`` 枚举一致）、`file`。
    列要求与 ``CsvDataProvider`` 一致：``timestamp``（或 ``date``）、``open``、``high``、``low``、``close``、``volume``。
    """
    config = get_runtime_config()
    raw = await file.read()
    max_b = config.market_csv_max_upload_bytes
    symbol_key = normalize_upload_symbol(symbol)
    df = parse_upload_csv_bytes(raw, max_bytes=max_b)
    path = write_market_csv(
        df,
        market_dir=config.market_dir,
        frequency=frequency,
        symbol=symbol_key,
    )
    return {
        "saved_path": str(path),
        "symbol": symbol_key,
        "frequency": frequency.value,
        "row_count": int(len(df)),
    }


@router.get("/providers/{provider}/bars")
def get_bars(
    provider: str,
    symbol: Annotated[str, Query()],
    start: Annotated[datetime, Query()],
    end: Annotated[datetime, Query()],
    frequency: Annotated[Frequency, Query()] = Frequency.DAILY,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
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
