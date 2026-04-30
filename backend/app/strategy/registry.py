"""Strategy template registry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.core.errors import NotFoundError

from .base import Strategy
from .templates.dual_ma import PARAMS_SCHEMA as DUAL_MA_SCHEMA
from .templates.dual_ma import DualMovingAverageStrategy


@dataclass(frozen=True)
class StrategyTemplate:
    id: str
    title: str
    description: str
    factory: Callable[[], Strategy]
    params_schema: dict[str, Any]


_TEMPLATES: dict[str, StrategyTemplate] = {
    "dual_ma": StrategyTemplate(
        id="dual_ma",
        title="Dual Moving Average",
        description="Long-only SMA crossover. Buy when short SMA crosses above long SMA.",
        factory=DualMovingAverageStrategy,
        params_schema=DUAL_MA_SCHEMA,
    ),
}


def list_templates() -> list[StrategyTemplate]:
    return list(_TEMPLATES.values())


def get_template(template_id: str) -> StrategyTemplate:
    template = _TEMPLATES.get(template_id)
    if template is None:
        raise NotFoundError(
            f"Unknown strategy template '{template_id}'",
            available=sorted(_TEMPLATES),
        )
    return template


def create_strategy(template_id: str) -> Strategy:
    return get_template(template_id).factory()
