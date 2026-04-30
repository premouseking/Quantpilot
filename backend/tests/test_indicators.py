"""Indicator unit tests."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.strategy.indicators import ema, macd, rsi, sma


def test_sma_matches_pandas_rolling_mean() -> None:
    series = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    expected = series.rolling(window=3, min_periods=3).mean()
    np.testing.assert_array_equal(sma(series, 3).values, expected.values)


def test_ema_first_value_equals_first_input() -> None:
    series = pd.Series([10.0, 11.0, 12.0, 13.0])
    result = ema(series, 3)
    assert result.iloc[0] == 10.0


def test_rsi_within_zero_hundred() -> None:
    series = pd.Series(np.linspace(100, 110, 30))
    result = rsi(series, 14).dropna()
    assert (result >= 0).all()
    assert (result <= 100).all()


def test_macd_returns_three_aligned_series() -> None:
    series = pd.Series(np.linspace(1, 100, 200))
    macd_line, signal_line, hist = macd(series)
    assert len(macd_line) == len(series)
    assert len(signal_line) == len(series)
    assert len(hist) == len(series)
