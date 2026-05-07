"""DataProvider 单元测试。"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

from app.core.errors import DataMissingError
from app.core.errors import InvalidParamsError
from app.data.akshare_provider import (
    AkShareDataProvider,
    normalize_akshare_hist_df,
    normalize_akshare_symbol,
)
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


def test_normalize_akshare_hist_df() -> None:
    raw = pd.DataFrame(
        {
            "日期": ["2024-01-02", "2024-01-03"],
            "开盘": [10.0, 10.1],
            "收盘": [10.2, 10.0],
            "最高": [10.3, 10.2],
            "最低": [9.9, 9.95],
            "成交量": [1000.0, 2000.0],
        }
    )
    frame = normalize_akshare_hist_df(raw)
    assert len(frame) == 2
    assert list(frame.columns) == ["timestamp", "open", "high", "low", "close", "volume"]


def test_normalize_akshare_symbol() -> None:
    assert normalize_akshare_symbol("600519") == "600519"
    assert normalize_akshare_symbol("sh600519") == "600519"
    assert normalize_akshare_symbol("600519.SH") == "600519"
    with pytest.raises(InvalidParamsError):
        normalize_akshare_symbol("MOCK001")


def test_akshare_provider_daily_bars_mocked(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_hist(
        symbol: str,
        period: str,
        start_date: str,
        end_date: str,
        adjust: str,
    ) -> pd.DataFrame:
        assert symbol == "600519"
        assert period == "daily"
        return pd.DataFrame(
            {
                "日期": ["2024-01-02"],
                "开盘": [10.0],
                "收盘": [10.5],
                "最高": [10.6],
                "最低": [9.9],
                "成交量": [10000.0],
            }
        )

    monkeypatch.setattr("akshare.stock_zh_a_hist", fake_hist)
    provider = AkShareDataProvider(adjust="qfq")
    df = provider.get_bars(
        "sh600519",
        Frequency.DAILY,
        datetime(2024, 1, 1),
        datetime(2024, 12, 31),
    )
    assert len(df) == 1
    assert float(df.iloc[0]["close"]) == 10.5


def test_akshare_rejects_non_daily() -> None:
    provider = AkShareDataProvider()
    with pytest.raises(InvalidParamsError):
        provider.get_bars(
            "000001",
            Frequency.MINUTE_1,
            datetime(2024, 1, 1),
            datetime(2024, 1, 2),
        )
