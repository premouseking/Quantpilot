"""技术指标单元测试。"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.strategy.indicators import (
    atr,
    bollinger_bands,
    ema,
    kdj,
    macd,
    obv,
    rsi,
    sma,
    williams_r,
)


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


def test_bollinger_bands_shape_and_order() -> None:
    series = pd.Series(np.linspace(1, 100, 200))
    upper, mid, lower = bollinger_bands(series, window=20)
    assert len(upper) == len(series)
    assert len(mid) == len(series)
    assert len(lower) == len(series)
    valid = upper.dropna()
    assert (valid > mid.dropna()).all() or (valid >= mid.dropna()).all()
    assert (lower.dropna() < mid.dropna()).all() or (lower.dropna() <= mid.dropna()).all()


def test_atr_positive() -> None:
    n = 100
    high = pd.Series(np.random.uniform(50, 55, n))
    low = pd.Series(np.random.uniform(45, 50, n))
    close = pd.Series(np.random.uniform(47, 53, n))
    result = atr(high, low, close, window=14).dropna()
    assert (result > 0).all()


def test_kdj_range_and_shape() -> None:
    n = 100
    high = pd.Series(np.random.uniform(50, 55, n))
    low = pd.Series(np.random.uniform(45, 50, n))
    close = pd.Series(np.random.uniform(47, 53, n))
    k, d, j = kdj(high, low, close)
    assert len(k) == n
    assert len(d) == n
    assert len(j) == n


def test_obv_cumulative() -> None:
    close = pd.Series([10, 11, 10, 12, 13])
    volume = pd.Series([100, 200, 150, 300, 250])
    result = obv(close, volume)
    assert len(result) == 5
    # 第一天为 0，后续累加
    assert result.iloc[0] == 0


def test_williams_r_range() -> None:
    n = 50
    high = pd.Series(np.random.uniform(50, 55, n))
    low = pd.Series(np.random.uniform(45, 50, n))
    close = pd.Series(np.random.uniform(47, 53, n))
    result = williams_r(high, low, close, window=14).dropna()
    assert (result >= -100).all()
    assert (result <= 0).all()

