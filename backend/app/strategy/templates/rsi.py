"""RSI 阈值反转策略（仅做多）。

RSI 低于超卖阈值时建仓至目标仓位；RSI 高于超买阈值时清仓。
"""

from __future__ import annotations

from collections import deque
from typing import Any

import pandas as pd

from app.core.errors import InvalidParamsError
from app.strategy.base import Strategy, StrategyContext
from app.strategy.indicators import rsi


class RsiReversionStrategy(Strategy):
    name = "rsi_reversion"

    DEFAULT_PARAMS = {
        "window": 14,
        "oversold": 30.0,
        "overbought": 70.0,
        "target_percent": 0.95,
    }

    def __init__(self) -> None:
        self._window: int = 0
        self._oversold: float = 0.0
        self._overbought: float = 0.0
        self._target_percent: float = 0.0
        self._closes: deque[float] = deque()
        self._invested = False

    def initialize(self, params: dict[str, Any]) -> None:
        merged = {**self.DEFAULT_PARAMS, **(params or {})}
        try:
            self._window = int(merged["window"])
            self._oversold = float(merged["oversold"])
            self._overbought = float(merged["overbought"])
            self._target_percent = float(merged["target_percent"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidParamsError(f"RSI params invalid: {exc}") from exc

        if self._window <= 0:
            raise InvalidParamsError("window must be > 0")
        if not (0.0 <= self._oversold < self._overbought <= 100.0):
            raise InvalidParamsError("require 0 <= oversold < overbought <= 100")
        if not (0.0 < self._target_percent <= 1.0):
            raise InvalidParamsError("target_percent must be in (0, 1]")

        self._closes = deque(maxlen=max(self._window * 4, self._window + 2))
        self._invested = False

    def on_bar(self, ctx: StrategyContext) -> None:
        self._closes.append(ctx.bar.close)
        if len(self._closes) < self._window + 1:
            return

        current_rsi = rsi(pd.Series(list(self._closes), dtype="float64"), self._window).iloc[-1]
        if pd.isna(current_rsi):
            return

        if current_rsi <= self._oversold and not self._invested:
            order_id = ctx.order_target_percent(self._target_percent)
            self._invested = order_id is not None or ctx.position() > 0
        elif current_rsi >= self._overbought and self._invested:
            ctx.order_target_percent(0.0)
            self._invested = False


PARAMS_SCHEMA = {
    "type": "object",
    "title": "RSI 反转",
    "properties": {
        "window": {
            "type": "integer",
            "title": "RSI 窗口",
            "minimum": 1,
            "default": 14,
        },
        "oversold": {
            "type": "number",
            "title": "超卖阈值",
            "minimum": 0.0,
            "maximum": 100.0,
            "default": 30.0,
        },
        "overbought": {
            "type": "number",
            "title": "超买阈值",
            "minimum": 0.0,
            "maximum": 100.0,
            "default": 70.0,
        },
        "target_percent": {
            "type": "number",
            "title": "目标仓位（占权益）",
            "minimum": 0.01,
            "maximum": 1.0,
            "default": 0.95,
        },
    },
    "required": ["window", "oversold", "overbought", "target_percent"],
}
