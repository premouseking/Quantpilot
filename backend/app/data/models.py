"""Domain models for market data.

Bar is the MVP unit. Tick is reserved as an interface placeholder.
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
    """OHLCV bar.

    All numeric fields are floats. ``timestamp`` is timezone-naive but is
    expected to be in market-local time (e.g. Asia/Shanghai for A-share).
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
    """Convert a normalized DataFrame to a list of Bar objects.

    Expects columns: timestamp, open, high, low, close, volume.
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
