"""CSV-backed data provider.

Layout convention:

    <market_dir>/<frequency>/<symbol>.csv

Each CSV must contain at least the columns: timestamp, open, high, low, close,
volume. Column names are matched case-insensitively. Date parsing is tolerant
of common formats (ISO, ``YYYY-MM-DD``, ``YYYY/MM/DD HH:MM:SS``).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

from app.core.errors import DataMissingError, InvalidParamsError

from .models import Frequency
from .provider import DataProvider


class CsvDataProvider(DataProvider):
    name = "csv"

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = Path(base_dir)

    def _frequency_dir(self, frequency: Frequency) -> Path:
        return self.base_dir / frequency.value

    def list_symbols(self) -> list[str]:
        if not self.base_dir.exists():
            return []
        seen: set[str] = set()
        for path in self.base_dir.glob("*/*.csv"):
            seen.add(path.stem)
        return sorted(seen)

    def get_bars(
        self,
        symbol: str,
        frequency: Frequency,
        start: datetime,
        end: datetime,
    ) -> pd.DataFrame:
        if start > end:
            raise InvalidParamsError("start must be <= end")

        path = self._frequency_dir(frequency) / f"{symbol}.csv"
        if not path.exists():
            raise DataMissingError(
                f"CSV file not found for {symbol} @ {frequency.value}",
                symbol=symbol,
                frequency=frequency.value,
                path=str(path),
            )

        df = pd.read_csv(path)
        df.columns = [c.strip().lower() for c in df.columns]
        if "timestamp" not in df.columns and "date" in df.columns:
            df = df.rename(columns={"date": "timestamp"})
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.dropna(subset=["timestamp"])

        mask = (df["timestamp"] >= pd.Timestamp(start)) & (df["timestamp"] <= pd.Timestamp(end))
        df = df.loc[mask]
        if df.empty:
            raise DataMissingError(
                "CSV file has no rows in requested range",
                symbol=symbol,
                start=start.isoformat(),
                end=end.isoformat(),
            )

        return self.normalize(df)
