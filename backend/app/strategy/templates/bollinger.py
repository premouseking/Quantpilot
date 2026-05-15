"""布林带突破策略。

当收盘价突破下轨时视为超卖信号，建仓至目标仓位；
当收盘价跌破中轨时清仓。仅做多。
"""

from __future__ import annotations

from collections import deque

from app.core.errors import InvalidParamsError
from app.strategy.base import Strategy, StrategyContext
from app.strategy.indicators import bollinger_bands

PARAMS_SCHEMA = {
    "type": "object",
    "title": "布林带突破",
    "properties": {
        "window": {
            "type": "integer",
            "title": "布林带窗口",
            "minimum": 5,
            "maximum": 100,
            "default": 20,
        },
        "num_std": {
            "type": "number",
            "title": "标准差倍数",
            "minimum": 1.0,
            "maximum": 4.0,
            "default": 2.0,
        },
        "target_percent": {
            "type": "number",
            "title": "目标仓位",
            "minimum": 0.01,
            "maximum": 1.0,
            "default": 0.95,
        },
    },
    "required": ["window", "num_std", "target_percent"],
}


class BollingerBreakoutStrategy(Strategy):
    """布林带突破：价格突破下轨时建仓，跌破中轨时清仓。"""

    name = "bollinger_breakout"

    def initialize(self, params: dict) -> None:
        self.window = int(params["window"])
        self.num_std = float(params["num_std"])
        self.target_percent = float(params["target_percent"])
        if self.window < 5:
            raise InvalidParamsError("window must be >= 5", window=self.window)
        if self.num_std < 0.5:
            raise InvalidParamsError("num_std must be >= 0.5", num_std=self.num_std)
        if not (0 < self.target_percent <= 1):
            raise InvalidParamsError(
                "target_percent must be between 0 and 1",
                target_percent=self.target_percent,
            )
        self._closes: deque[float] = deque(maxlen=self.window)
        self._invested = False

    def on_bar(self, ctx: StrategyContext) -> None:
        self._closes.append(ctx.bar.close)
        if len(self._closes) < self.window:
            return

        import pandas as pd
        close_series = pd.Series(list(self._closes))
        _upper, mid, lower = bollinger_bands(close_series, self.window, self.num_std)
        current_upper = _upper.iloc[-1]
        current_mid = mid.iloc[-1]
        current_lower = lower.iloc[-1]
        if pd.isna(current_lower) or pd.isna(current_mid):
            return

        if not self._invested:
            if ctx.bar.close <= current_lower:
                ctx.order_target_percent(self.target_percent)
                self._invested = True
        else:
            if ctx.bar.close <= current_mid:
                ctx.order_target_percent(0.0)
                self._invested = False
