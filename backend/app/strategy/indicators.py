"""常用技术指标。

均接受一维 ``pd.Series``（通常为收盘价），返回等长 ``pd.Series``；
前导 NaN 保留以便与输入对齐。
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(close: pd.Series, window: int) -> pd.Series:
    """简单移动平均（SMA）。"""
    if window <= 0:
        raise ValueError("window must be > 0")
    return close.rolling(window=window, min_periods=window).mean()


def ema(close: pd.Series, window: int) -> pd.Series:
    """指数移动平均（标准 EMA 递推）。"""
    if window <= 0:
        raise ValueError("window must be > 0")
    return close.ewm(span=window, adjust=False).mean()


def rsi(close: pd.Series, window: int = 14) -> pd.Series:
    """相对强弱指标 RSI（Wilder 平滑）。"""
    if window <= 0:
        raise ValueError("window must be > 0")
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / window, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    out = 100.0 - 100.0 / (1.0 + rs)
    return out


def macd(
    close: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD：快慢线差、信号线、柱（histogram）。"""
    if not (0 < fast < slow):
        raise ValueError("require 0 < fast < slow")
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def bollinger_bands(
    close: pd.Series,
    window: int = 20,
    num_std: float = 2.0,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """布林带：中轨（SMA）、上轨、下轨。"""
    if window <= 0:
        raise ValueError("window must be > 0")
    mid = sma(close, window)
    std = close.rolling(window=window, min_periods=window).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    return upper, mid, lower


def atr(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    window: int = 14,
) -> pd.Series:
    """平均真实波幅（ATR，EMA 平滑）。"""
    if window <= 0:
        raise ValueError("window must be > 0")
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(span=window, adjust=False).mean()


def kdj(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    n: int = 9,
    k_window: int = 3,
    d_window: int = 3,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """KDJ 指标：%K、%D、%J 线。"""
    if not (n > 0 and k_window > 0 and d_window > 0):
        raise ValueError("n, k_window, d_window must be > 0")
    low_n = low.rolling(window=n, min_periods=n).min()
    high_n = high.rolling(window=n, min_periods=n).max()
    rsv = (close - low_n) / (high_n - low_n).replace(0.0, np.nan) * 100.0
    k = rsv.ewm(span=k_window, adjust=False).mean()
    d = k.ewm(span=d_window, adjust=False).mean()
    j = 3.0 * k - 2.0 * d
    return k.fillna(50.0), d.fillna(50.0), j.fillna(50.0)


def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """能量潮（OBV）：价格涨则加成交量，跌则减成交量。"""
    direction = close.diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
    obv_series = (direction * volume).cumsum()
    return obv_series


def williams_r(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    window: int = 14,
) -> pd.Series:
    """威廉指标（%R）：-100 到 0 之间的动量指标。"""
    if window <= 0:
        raise ValueError("window must be > 0")
    high_n = high.rolling(window=window, min_periods=window).max()
    low_n = low.rolling(window=window, min_periods=window).min()
    wr = (high_n - close) / (high_n - low_n).replace(0.0, np.nan) * -100.0
    return wr
