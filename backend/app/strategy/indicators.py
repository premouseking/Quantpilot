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
