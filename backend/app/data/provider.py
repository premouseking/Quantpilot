"""DataProvider abstraction.

The unified interface exposed to the engine and API. Implementations include
mock data, CSV files, and (later) Parquet/DuckDB-backed sources. The contract
is intentionally narrow: given a symbol, frequency, and date range, return a
sorted, non-duplicated DataFrame of OHLCV bars.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

import pandas as pd

from .models import Frequency

BAR_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


class DataProvider(ABC):
    """Abstract data provider.

    Implementations must:
    - Return a DataFrame with columns = BAR_COLUMNS, sorted by timestamp ascending.
    - Drop or raise on duplicate timestamps. The default policy is drop-and-warn.
    - Raise ``DataMissingError`` if the requested symbol/range is unavailable.
    """

    name: str = "abstract"

    @abstractmethod
    def list_symbols(self) -> list[str]:
        """Return all symbols this provider can serve."""

    @abstractmethod
    def get_bars(
        self,
        symbol: str,
        frequency: Frequency,
        start: datetime,
        end: datetime,
    ) -> pd.DataFrame:
        """Return OHLCV bars for ``symbol`` within ``[start, end]`` inclusive."""

    @staticmethod
    def normalize(df: pd.DataFrame) -> pd.DataFrame:
        """Normalize a raw DataFrame into BAR_COLUMNS order, sorted, deduped."""
        missing = set(BAR_COLUMNS) - set(df.columns)
        if missing:
            raise ValueError(f"DataProvider output missing columns: {sorted(missing)}")
        out = df[BAR_COLUMNS].copy()
        out["timestamp"] = pd.to_datetime(out["timestamp"])
        out = out.sort_values("timestamp", kind="stable")
        out = out.drop_duplicates(subset=["timestamp"], keep="last")
        out = out.reset_index(drop=True)
        return out
