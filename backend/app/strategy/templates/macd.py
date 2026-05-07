"""MACD 金叉 / 死叉策略（仅做多）。

MACD 线上穿信号线时建仓至目标仓位；下穿时清仓。
"""

from __future__ import annotations

from collections import deque
from typing import Any

import pandas as pd

from app.core.errors import InvalidParamsError
from app.strategy.base import Strategy, StrategyContext
from app.strategy.indicators import macd


class MacdCrossStrategy(Strategy):
    name = "macd_cross"

    DEFAULT_PARAMS = {
        "fast": 12,
        "slow": 26,
        "signal": 9,
        "target_percent": 0.95,
    }

    def __init__(self) -> None:
        self._fast: int = 0
        self._slow: int = 0
        self._signal: int = 0
        self._target_percent: float = 0.0
        self._closes: deque[float] = deque()
        self._last_diff: float | None = None

    def initialize(self, params: dict[str, Any]) -> None:
        merged = {**self.DEFAULT_PARAMS, **(params or {})}
        try:
            self._fast = int(merged["fast"])
            self._slow = int(merged["slow"])
            self._signal = int(merged["signal"])
            self._target_percent = float(merged["target_percent"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidParamsError(f"MACD params invalid: {exc}") from exc

        if not (0 < self._fast < self._slow):
            raise InvalidParamsError("require 0 < fast < slow")
        if self._signal <= 0:
            raise InvalidParamsError("signal must be > 0")
        if not (0.0 < self._target_percent <= 1.0):
            raise InvalidParamsError("target_percent must be in (0, 1]")

        self._closes = deque(maxlen=max((self._slow + self._signal) * 4, self._slow + 2))
        self._last_diff = None

    def on_bar(self, ctx: StrategyContext) -> None:
        self._closes.append(ctx.bar.close)
        if len(self._closes) < self._slow + self._signal:
            return

        macd_line, signal_line, _histogram = macd(
            pd.Series(list(self._closes), dtype="float64"),
            fast=self._fast,
            slow=self._slow,
            signal=self._signal,
        )
        current_diff = macd_line.iloc[-1] - signal_line.iloc[-1]
        if pd.isna(current_diff):
            return

        previous_diff = self._last_diff
        self._last_diff = float(current_diff)
        if previous_diff is None:
            return

        if previous_diff <= 0.0 < current_diff:
            ctx.order_target_percent(self._target_percent)
        elif previous_diff >= 0.0 > current_diff:
            ctx.order_target_percent(0.0)


PARAMS_SCHEMA = {
    "type": "object",
    "title": "MACD 交叉",
    "properties": {
        "fast": {
            "type": "integer",
            "title": "快线周期",
            "minimum": 1,
            "default": 12,
        },
        "slow": {
            "type": "integer",
            "title": "慢线周期",
            "minimum": 2,
            "default": 26,
        },
        "signal": {
            "type": "integer",
            "title": "信号线周期",
            "minimum": 1,
            "default": 9,
        },
        "target_percent": {
            "type": "number",
            "title": "目标仓位（占权益）",
            "minimum": 0.01,
            "maximum": 1.0,
            "default": 0.95,
        },
    },
    "required": ["fast", "slow", "signal", "target_percent"],
}
