"""行情领域模型。

当前 MVP 以 K 线（Bar）为最小粒度；Tick 级接口预留为未来扩展位。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

import pandas as pd


class Frequency(str, Enum):
    DAILY = "daily"
    MINUTE_1 = "1m"
    MINUTE_5 = "5m"
    MINUTE_15 = "15m"
    MINUTE_30 = "30m"
    HOUR_1 = "1h"


@dataclass(frozen=True, slots=True)
class Bar:
    """单根 OHLCV K 线。

    数值字段均为 float；``timestamp`` 为无时区 naive datetime，
    预期与标的所在市场本地时区一致（如 A 股可用 Asia/Shanghai 语义）。
    """

    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    def __post_init__(self) -> None:
        if self.high < self.low:
            raise ValueError(
                f"Bar high<low for {self.symbol} @ {self.timestamp}: high={self.high}, low={self.low}"
            )


def bars_from_dataframe(df: pd.DataFrame, symbol: str) -> list[Bar]:
    """将已规整的 DataFrame 转为 ``Bar`` 列表。

    必需列：timestamp, open, high, low, close, volume。
    """
    required = {"timestamp", "open", "high", "low", "close", "volume"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")

    result: list[Bar] = []
    for row in df.itertuples(index=False):
        result.append(
            Bar(
                symbol=symbol,
                timestamp=pd.Timestamp(row.timestamp).to_pydatetime(),
                open=float(row.open),
                high=float(row.high),
                low=float(row.low),
                close=float(row.close),
                volume=float(row.volume),
            )
        )
    return result
