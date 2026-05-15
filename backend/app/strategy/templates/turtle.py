"""海龟交易策略（简化版）。

基于 Donchian 通道突破：价格突破 N 日高点时建仓，跌破 M 日低点时清仓。
使用 ATR 进行动态仓位管理。仅做多。
"""

from __future__ import annotations

from collections import deque

from app.core.errors import InvalidParamsError
from app.strategy.base import Strategy, StrategyContext
from app.strategy.indicators import atr

PARAMS_SCHEMA = {
    "type": "object",
    "title": "海龟交易",
    "properties": {
        "entry_window": {
            "type": "integer",
            "title": "入场通道",
            "minimum": 10,
            "maximum": 100,
            "default": 20,
        },
        "exit_window": {
            "type": "integer",
            "title": "出场通道",
            "minimum": 5,
            "maximum": 50,
            "default": 10,
        },
        "atr_window": {
            "type": "integer",
            "title": "ATR 窗口",
            "minimum": 5,
            "maximum": 50,
            "default": 20,
        },
        "target_percent": {
            "type": "number",
            "title": "目标仓位",
            "minimum": 0.01,
            "maximum": 1.0,
            "default": 0.95,
        },
    },
    "required": ["entry_window", "exit_window", "atr_window", "target_percent"],
}


class TurtleTradingStrategy(Strategy):
    """海龟交易：Donchian 通道突破入场，低点出场，ATR 动态仓位。"""

    name = "turtle_trading"

    def initialize(self, params: dict) -> None:
        self.entry_window = int(params["entry_window"])
        self.exit_window = int(params["exit_window"])
        self.atr_window = int(params["atr_window"])
        self.target_percent = float(params["target_percent"])
        if self.entry_window < 5:
            raise InvalidParamsError("entry_window must be >= 5", entry_window=self.entry_window)
        if self.exit_window < 2:
            raise InvalidParamsError("exit_window must be >= 2", exit_window=self.exit_window)
        if not (0 < self.target_percent <= 1):
            raise InvalidParamsError(
                "target_percent must be between 0 and 1",
                target_percent=self.target_percent,
            )
        max_window = max(self.entry_window, self.atr_window) + 1
        self._highs: deque[float] = deque(maxlen=max_window)
        self._lows: deque[float] = deque(maxlen=max_window)
        self._closes: deque[float] = deque(maxlen=max_window)
        self._invested = False

    def on_bar(self, ctx: StrategyContext) -> None:
        self._highs.append(ctx.bar.high)
        self._lows.append(ctx.bar.low)
        self._closes.append(ctx.bar.close)

        if len(self._closes) < max(self.entry_window, self.atr_window, self.exit_window) + 1:
            return

        import pandas as pd

        high_series = pd.Series(list(self._highs))
        low_series = pd.Series(list(self._lows))
        close_series = pd.Series(list(self._closes))

        # Donchian 通道（不含当根 Bar）
        entry_high = high_series.iloc[-(self.entry_window + 1):-1].max()
        exit_low = low_series.iloc[-(self.exit_window + 1):-1].min()

        if pd.isna(entry_high) or pd.isna(exit_low):
            return

        if not self._invested:
            if ctx.bar.close >= entry_high:
                ctx.order_target_percent(self.target_percent)
                self._invested = True
        else:
            if ctx.bar.close <= exit_low:
                ctx.order_target_percent(0.0)
                self._invested = False
