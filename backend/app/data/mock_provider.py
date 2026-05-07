"""Mock data provider.

Deterministic synthetic OHLCV generated from a seeded random walk. Useful
for end-to-end tests and demos when no real data is available.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from hashlib import blake2b

import numpy as np
import pandas as pd

from app.core.errors import DataMissingError, InvalidParamsError

from .models import Frequency
from .provider import DataProvider

_DEFAULT_SYMBOLS = ("MOCK001", "MOCK002", "MOCK003")


def _seed_for(symbol: str) -> int:
    """Stable per-symbol seed so repeated runs are reproducible."""
    digest = blake2b(symbol.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % (2**31 - 1)


def _step_for(frequency: Frequency) -> timedelta:
    if frequency == Frequency.DAILY:
        return timedelta(days=1)
    if frequency == Frequency.MINUTE_1:
        return timedelta(minutes=1)
    if frequency == Frequency.MINUTE_5:
        return timedelta(minutes=5)
    if frequency == Frequency.MINUTE_15:
        return timedelta(minutes=15)
    if frequency == Frequency.MINUTE_30:
        return timedelta(minutes=30)
    if frequency == Frequency.HOUR_1:
        return timedelta(hours=1)
    raise InvalidParamsError(f"Unsupported frequency: {frequency}")


class MockDataProvider(DataProvider):
    """Generate synthetic bars with a geometric random walk."""

    name = "mock"

    def __init__(self, symbols: tuple[str, ...] = _DEFAULT_SYMBOLS) -> None:
        self._symbols = tuple(symbols)

    def list_symbols(self) -> list[str]:
        return list(self._symbols)

    def get_bars(
        self,
        symbol: str,
        frequency: Frequency,
        start: datetime,
        end: datetime,
    ) -> pd.DataFrame:
        if start > end:
            raise InvalidParamsError("start must be <= end")
        if symbol not in self._symbols:
            raise DataMissingError(
                f"Mock provider does not know symbol '{symbol}'",
                symbol=symbol,
                available=list(self._symbols),
            )

        step = _step_for(frequency)
        timestamps: list[datetime] = []
        current = start
        while current <= end:
            if frequency == Frequency.DAILY:
                if current.weekday() < 5:
                    timestamps.append(current)
            else:
                if current.weekday() < 5 and 9 <= current.hour < 16:
                    timestamps.append(current)
            current = current + step

        if not timestamps:
            raise DataMissingError(
                "No mock bars in requested range",
                symbol=symbol,
                start=start.isoformat(),
                end=end.isoformat(),
            )

        n = len(timestamps)
        rng = np.random.default_rng(_seed_for(symbol))
        drift = 0.0002
        vol = 0.012 if frequency == Frequency.DAILY else 0.003
        log_returns = rng.normal(loc=drift, scale=vol, size=n)
        base = 100.0
        closes = base * np.exp(np.cumsum(log_returns))
        opens = np.concatenate([[base], closes[:-1]])
        intra = rng.uniform(0.001, 0.01, size=n)
        highs = np.maximum(opens, closes) * (1 + intra)
        lows = np.minimum(opens, closes) * (1 - intra)
        volumes = rng.integers(low=10_000, high=200_000, size=n).astype(float)

        df = pd.DataFrame(
            {
                "timestamp": timestamps,
                "open": opens,
                "high": highs,
                "low": lows,
                "close": closes,
                "volume": volumes,
            }
        )
        return self.normalize(df)
