"""策略模板注册表与工厂。"""

from __future__ import annotations

import importlib
import inspect
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.core.errors import NotFoundError

from .base import Strategy
from .templates.dual_ma import PARAMS_SCHEMA as DUAL_MA_SCHEMA
from .templates.dual_ma import DualMovingAverageStrategy
from .templates.macd import PARAMS_SCHEMA as MACD_SCHEMA
from .templates.macd import MacdCrossStrategy
from .templates.rsi import PARAMS_SCHEMA as RSI_SCHEMA
from .templates.rsi import RsiReversionStrategy
from .user_store import get_user_strategy, instantiate_user_strategy, list_user_strategies


@dataclass(frozen=True)
class StrategyTemplate:
    id: str
    title: str
    description: str
    factory: Callable[[], Strategy]
    params_schema: dict[str, Any]
    source: str
    readonly: bool
    created_at: str | None = None
    updated_at: str | None = None
    current_version: str | None = None
    version_count: int = 0


_TEMPLATES: dict[str, StrategyTemplate] = {}


def _register(template: StrategyTemplate) -> None:
    if template.id in _TEMPLATES:
        raise RuntimeError(f"Duplicate strategy template id: {template.id}")
    _TEMPLATES[template.id] = template


_register(
    StrategyTemplate(
        id="dual_ma",
        title="双均线交叉",
        description="仅做多：短均线上穿长均线时建仓至目标仓位；下穿时清仓。",
        factory=DualMovingAverageStrategy,
        params_schema=DUAL_MA_SCHEMA,
        source="builtin",
        readonly=True,
    )
)
_register(
    StrategyTemplate(
        id="rsi_reversion",
        title="RSI 反转",
        description="仅做多：RSI 进入超卖区间时建仓；进入超买区间时清仓。",
        factory=RsiReversionStrategy,
        params_schema=RSI_SCHEMA,
        source="builtin",
        readonly=True,
    )
)
_register(
    StrategyTemplate(
        id="macd_cross",
        title="MACD 交叉",
        description="仅做多：MACD 线上穿信号线时建仓；下穿时清仓。",
        factory=MacdCrossStrategy,
        params_schema=MACD_SCHEMA,
        source="builtin",
        readonly=True,
    )
)


def list_templates() -> list[StrategyTemplate]:
    user_templates = [
        StrategyTemplate(
            id=record.id,
            title=record.title,
            description=record.description,
            factory=lambda strategy_id=record.id: instantiate_user_strategy(strategy_id),
            params_schema=record.params_schema,
            source=record.source,
            readonly=record.readonly,
            created_at=record.created_at,
            updated_at=record.updated_at,
            current_version=record.current_version,
            version_count=record.version_count,
        )
        for record in list_user_strategies()
    ]
    return [*list(_TEMPLATES.values()), *user_templates]


def get_template(template_id: str) -> StrategyTemplate:
    template = _TEMPLATES.get(template_id)
    if template is not None:
        return template
    for user_template in list_templates():
        if user_template.id == template_id:
            return user_template
    raise NotFoundError(
        f"Unknown strategy template '{template_id}'",
        available=sorted(t.id for t in list_templates()),
        )


def create_strategy(template_id: str) -> Strategy:
    return get_template(template_id).factory()


def get_template_source_code(template_id: str) -> str:
    """返回策略模板的 Python 源码，用于前端编辑器展示和复制保存。"""
    template = _TEMPLATES.get(template_id)
    if template is not None:
        module = importlib.import_module(template.factory.__module__)
        return inspect.getsource(module)
    record = get_user_strategy(template_id)
    return record.code_path.read_text(encoding="utf-8")
