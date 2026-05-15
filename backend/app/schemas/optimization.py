"""参数优化 HTTP 接口的 Pydantic 载荷定义。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.data.models import Frequency


class ParamAxis(BaseModel):
    start: float
    end: float
    step: float


class ParamSensitivityRange(BaseModel):
    start: float
    end: float
    samples: int = Field(default=10, ge=2, le=50)


class GridSearchRequest(BaseModel):
    template_id: str
    symbol: str
    start: datetime
    end: datetime
    frequency: Frequency = Frequency.DAILY
    initial_cash: float = Field(default=1_000_000.0, gt=0)
    data_provider: str = "mock"
    param_grid: dict[str, list[float]] = Field(min_length=1)
    sort_by: str = "sharpe_ratio"


class SensitivityRequest(BaseModel):
    template_id: str
    symbol: str
    start: datetime
    end: datetime
    frequency: Frequency = Frequency.DAILY
    initial_cash: float = Field(default=1_000_000.0, gt=0)
    data_provider: str = "mock"
    base_params: dict[str, Any] = Field(default_factory=dict)
    param_ranges: dict[str, ParamSensitivityRange] = Field(min_length=1)
    samples_per_param: int = Field(default=10, ge=2, le=50)
