"""Performance metrics.

All metrics are computed from a daily-or-finer equity curve. Time scaling uses
``periods_per_year`` so that minute-bar backtests can pass an appropriate
annualization factor (e.g. 252 * 240 for A-share minute bars).

The functions are pure: same input -> same output, no I/O.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import sqrt
from typing import Sequence

import numpy as np
import pandas as pd

from app.engine.events import Fill, OrderSide
from app.engine.portfolio import EquityPoint


DEFAULT_PERIODS_PER_YEAR = 252


@dataclass(frozen=True, slots=True)
class PerformanceMetrics:
    cumulative_return: float
    annualized_return: float
    annualized_volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown: float
    max_drawdown_start: datetime | None
    max_drawdown_end: datetime | None
    trade_count: int
    win_rate: float
    profit_loss_ratio: float

    def to_dict(self) -> dict[str, float | int | str | None]:
        return {
            "cumulative_return": self.cumulative_return,
            "annualized_return": self.annualized_return,
            "annualized_volatility": self.annualized_volatility,
            "sharpe_ratio": self.sharpe_ratio,
            "sortino_ratio": self.sortino_ratio,
            "calmar_ratio": self.calmar_ratio,
            "max_drawdown": self.max_drawdown,
            "max_drawdown_start": (
                self.max_drawdown_start.isoformat() if self.max_drawdown_start else None
            ),
            "max_drawdown_end": (
                self.max_drawdown_end.isoformat() if self.max_drawdown_end else None
            ),
            "trade_count": self.trade_count,
            "win_rate": self.win_rate,
            "profit_loss_ratio": self.profit_loss_ratio,
        }


def _equity_series(points: Sequence[EquityPoint]) -> pd.Series:
    if not points:
        return pd.Series(dtype=float)
    return pd.Series(
        [p.total_value for p in points],
        index=pd.to_datetime([p.timestamp for p in points]),
        name="equity",
    )


def cumulative_return(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    return float(equity.iloc[-1] / equity.iloc[0] - 1.0)


def annualized_return(equity: pd.Series, periods_per_year: int) -> float:
    if equity.empty:
        return 0.0
    n = len(equity)
    if n < 2:
        return 0.0
    total_return = equity.iloc[-1] / equity.iloc[0]
    if total_return <= 0:
        return -1.0
    return float(total_return ** (periods_per_year / (n - 1)) - 1.0)


def annualized_volatility(returns: pd.Series, periods_per_year: int) -> float:
    if returns.empty:
        return 0.0
    return float(returns.std(ddof=1) * sqrt(periods_per_year))


def sharpe_ratio(returns: pd.Series, periods_per_year: int, risk_free: float = 0.0) -> float:
    if returns.empty:
        return 0.0
    excess = returns - risk_free / periods_per_year
    std = excess.std(ddof=1)
    if std == 0 or np.isnan(std):
        return 0.0
    return float(excess.mean() / std * sqrt(periods_per_year))


def sortino_ratio(returns: pd.Series, periods_per_year: int, risk_free: float = 0.0) -> float:
    if returns.empty:
        return 0.0
    excess = returns - risk_free / periods_per_year
    downside = excess.where(excess < 0, 0.0)
    downside_std = sqrt((downside.pow(2).sum()) / max(len(returns) - 1, 1))
    if downside_std == 0:
        return 0.0
    return float(excess.mean() / downside_std * sqrt(periods_per_year))


def max_drawdown(equity: pd.Series) -> tuple[float, datetime | None, datetime | None]:
    """Return (max drawdown as negative number, peak time, trough time)."""
    if equity.empty:
        return 0.0, None, None
    cumulative_max = equity.cummax()
    drawdown = equity / cumulative_max - 1.0
    trough_idx = drawdown.idxmin()
    if pd.isna(trough_idx):
        return 0.0, None, None
    peak_idx = equity.loc[:trough_idx].idxmax()
    return float(drawdown.loc[trough_idx]), peak_idx.to_pydatetime(), trough_idx.to_pydatetime()


def calmar_ratio(annualized: float, mdd: float) -> float:
    if mdd == 0:
        return 0.0
    return float(annualized / abs(mdd))


def trade_stats(fills: Sequence[Fill]) -> tuple[int, float, float]:
    """Pair fills FIFO into round-trip trades and return (count, win_rate, pl_ratio)."""
    if not fills:
        return 0, 0.0, 0.0

    open_lots: dict[str, list[tuple[float, float]]] = {}
    closed_pnl: list[float] = []

    for fill in fills:
        symbol = fill.symbol
        lots = open_lots.setdefault(symbol, [])
        if fill.side == OrderSide.BUY:
            lots.append((fill.quantity, fill.price))
        else:
            qty_to_close = fill.quantity
            sell_price = fill.price
            while qty_to_close > 0 and lots:
                buy_qty, buy_price = lots[0]
                matched = min(buy_qty, qty_to_close)
                pnl = (sell_price - buy_price) * matched
                closed_pnl.append(pnl)
                qty_to_close -= matched
                if matched == buy_qty:
                    lots.pop(0)
                else:
                    lots[0] = (buy_qty - matched, buy_price)

    if not closed_pnl:
        return 0, 0.0, 0.0

    wins = [pnl for pnl in closed_pnl if pnl > 0]
    losses = [pnl for pnl in closed_pnl if pnl < 0]
    count = len(closed_pnl)
    win_rate = len(wins) / count if count else 0.0
    avg_win = float(np.mean(wins)) if wins else 0.0
    avg_loss = float(np.mean(losses)) if losses else 0.0
    pl_ratio = abs(avg_win / avg_loss) if avg_loss != 0 else (float("inf") if avg_win > 0 else 0.0)
    if pl_ratio == float("inf"):
        pl_ratio = 0.0
    return count, win_rate, pl_ratio


def compute_metrics(
    equity_points: Sequence[EquityPoint],
    fills: Sequence[Fill],
    *,
    periods_per_year: int = DEFAULT_PERIODS_PER_YEAR,
    risk_free: float = 0.0,
) -> PerformanceMetrics:
    equity = _equity_series(equity_points)
    if equity.empty:
        return PerformanceMetrics(
            cumulative_return=0.0,
            annualized_return=0.0,
            annualized_volatility=0.0,
            sharpe_ratio=0.0,
            sortino_ratio=0.0,
            calmar_ratio=0.0,
            max_drawdown=0.0,
            max_drawdown_start=None,
            max_drawdown_end=None,
            trade_count=0,
            win_rate=0.0,
            profit_loss_ratio=0.0,
        )

    returns = equity.pct_change().dropna()
    cum = cumulative_return(equity)
    ann = annualized_return(equity, periods_per_year)
    vol = annualized_volatility(returns, periods_per_year)
    sharpe = sharpe_ratio(returns, periods_per_year, risk_free)
    sortino = sortino_ratio(returns, periods_per_year, risk_free)
    mdd, peak, trough = max_drawdown(equity)
    calmar = calmar_ratio(ann, mdd)
    count, win_rate, pl_ratio = trade_stats(fills)

    return PerformanceMetrics(
        cumulative_return=cum,
        annualized_return=ann,
        annualized_volatility=vol,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        calmar_ratio=calmar,
        max_drawdown=mdd,
        max_drawdown_start=peak,
        max_drawdown_end=trough,
        trade_count=count,
        win_rate=win_rate,
        profit_loss_ratio=pl_ratio,
    )
