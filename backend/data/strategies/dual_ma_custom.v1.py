"""双均线交叉策略（仅做多）。

短均线上穿长均线时持仓至 ``target_percent`` 权益比例；下穿时清仓为现金。
"""

from __future__ import annotations

from collections import deque
from typing import Any

from app.core.errors import InvalidParamsError
from app.strategy.base import Strategy, StrategyContext


class DualMovingAverageStrategy(Strategy):
    name = "dual_ma"

    DEFAULT_PARAMS = {"short_window": 5, "long_window": 20, "target_percent": 0.95}

    def __init__(self) -> None:
        self._short_window: int = 0
        self._long_window: int = 0
        self._target_percent: float = 0.0
        self._closes: deque[float] = deque()
        self._last_signal: int = 0

    def initialize(self, params: dict[str, Any]) -> None:
        merged = {**self.DEFAULT_PARAMS, **(params or {})}
        try:
            self._short_window = int(merged["short_window"])
            self._long_window = int(merged["long_window"])
            self._target_percent = float(merged["target_percent"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidParamsError(f"DualMA params invalid: {exc}") from exc

        if self._short_window <= 0 or self._long_window <= 0:
            raise InvalidParamsError("windows must be > 0")
        if self._short_window >= self._long_window:
            raise InvalidParamsError("short_window must be < long_window")
        if not (0.0 < self._target_percent <= 1.0):
            raise InvalidParamsError("target_percent must be in (0, 1]")

        self._closes = deque(maxlen=self._long_window)
        self._last_signal = 0

    def on_bar(self, ctx: StrategyContext) -> None:
        self._closes.append(ctx.bar.close)
        if len(self._closes) < self._long_window:
            return

        closes = list(self._closes)
        short_ma = sum(closes[-self._short_window:]) / self._short_window
        long_ma = sum(closes) / self._long_window

        signal = 1 if short_ma > long_ma else -1
        if signal == self._last_signal:
            return

        if signal == 1:
            ctx.order_target_percent(self._target_percent)
        else:
            ctx.order_target_percent(0.0)
        self._last_signal = signal


PARAMS_SCHEMA = {
    "type": "object",
    "title": "双均线",
    "properties": {
        "short_window": {
            "type": "integer",
            "title": "短周期窗口",
            "minimum": 1,
            "default": 5,
        },
        "long_window": {
            "type": "integer",
            "title": "长周期窗口",
            "minimum": 2,
            "default": 20,
        },
        "target_percent": {
            "type": "number",
            "title": "目标仓位（占权益）",
            "minimum": 0.01,
            "maximum": 1.0,
            "default": 0.95,
        },
    },
    "required": ["short_window", "long_window", "target_percent"],
}
