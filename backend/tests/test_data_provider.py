"""DataProvider tests."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

from app.core.errors import DataMissingError
from app.data.csv_provider import CsvDataProvider
from app.data.mock_provider import MockDataProvider
from app.data.models import Frequency


def test_mock_provider_returns_sorted_unique_bars() -> None:
    provider = MockDataProvider()
    df = provider.get_bars(
        "MOCK001", Frequency.DAILY, datetime(2024, 1, 1), datetime(2024, 3, 1)
    )
    assert not df.empty
    assert df["timestamp"].is_monotonic_increasing
    assert df["timestamp"].is_unique
    assert (df["high"] >= df["low"]).all()


def test_mock_provider_unknown_symbol() -> None:
    provider = MockDataProvider()
    with pytest.raises(DataMissingError):
        provider.get_bars(
            "UNKNOWN", Frequency.DAILY, datetime(2024, 1, 1), datetime(2024, 1, 5)
        )


def test_csv_provider_reads_normalized(tmp_path: Path) -> None:
    base = tmp_path / "market"
    daily_dir = base / Frequency.DAILY.value
    daily_dir.mkdir(parents=True)
    csv_path = daily_dir / "TEST001.csv"
    pd.DataFrame(
        {
            "Date": ["2024-01-02", "2024-01-03", "2024-01-04"],
            "Open": [10.0, 10.5, 10.7],
            "High": [10.5, 10.8, 10.9],
            "Low": [9.8, 10.4, 10.6],
            "Close": [10.4, 10.7, 10.65],
            "Volume": [1_000, 1_100, 1_050],
        }
    ).to_csv(csv_path, index=False)

    provider = CsvDataProvider(base)
    assert "TEST001" in provider.list_symbols()
    df = provider.get_bars(
        "TEST001",
        Frequency.DAILY,
        datetime(2024, 1, 1),
        datetime(2024, 1, 31),
    )
    assert len(df) == 3
    assert list(df.columns) == ["timestamp", "open", "high", "low", "close", "volume"]
