"""回测 HTTP 接口的 Pydantic 载荷定义。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.data.models import Frequency


class CostModelPayload(BaseModel):
    commission_rate: float = Field(default=0.0003, ge=0)
    min_commission: float = Field(default=5.0, ge=0)
    stamp_tax_rate: float = Field(default=0.001, ge=0)
    slippage_bps: float = Field(default=5.0, ge=0)


class BacktestRunRequest(BaseModel):
    template_id: str
    symbol: str
    start: datetime
    end: datetime
    frequency: Frequency = Frequency.DAILY
    initial_cash: float = Field(default=1_000_000.0, gt=0)
    data_provider: str = "mock"
    benchmark_symbol: str | None = None
    benchmark_provider: str | None = None
    strategy_params: dict[str, Any] = Field(default_factory=dict)
    strategy_version: str | None = None
    cost_model: CostModelPayload = Field(default_factory=CostModelPayload)
