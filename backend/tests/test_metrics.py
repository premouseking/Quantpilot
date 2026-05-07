"""绩效指标单元测试。"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.analysis.metrics import _equity_series, compute_metrics, max_drawdown
from app.engine.events import Fill, OrderSide
from app.engine.portfolio import EquityPoint


def _build_equity(values: list[float]) -> list[EquityPoint]:
    base = datetime(2024, 1, 2)
    points: list[EquityPoint] = []
    for i, value in enumerate(values):
        points.append(
            EquityPoint(
                timestamp=base + timedelta(days=i),
                cash=0.0,
                market_value=value,
                total_value=value,
            )
        )
    return points


def test_max_drawdown_simple_case() -> None:
    points = _build_equity([100, 120, 90, 110, 80, 95])
    series = _equity_series(points)
    mdd, peak, trough = max_drawdown(series)
    assert peak is not None
    assert trough is not None
    assert peak < trough
    expected = 80 / 120 - 1
    assert abs(mdd - expected) < 1e-9


def test_compute_metrics_with_no_trades() -> None:
    points = _build_equity([100, 102, 101, 103])
    metrics = compute_metrics(points, fills=[], periods_per_year=252)
    assert metrics.cumulative_return > 0
    assert metrics.trade_count == 0
    assert metrics.win_rate == 0.0


def test_trade_stats_round_trip_pnl() -> None:
    base = datetime(2024, 1, 2)
    fills = [
        Fill(
            order_id="1",
            timestamp=base,
            symbol="X",
            side=OrderSide.BUY,
            quantity=100,
            price=10.0,
            commission=0.0,
            stamp_tax=0.0,
            slippage=0.0,
        ),
        Fill(
            order_id="2",
            timestamp=base + timedelta(days=1),
            symbol="X",
            side=OrderSide.SELL,
            quantity=100,
            price=12.0,
            commission=0.0,
            stamp_tax=0.0,
            slippage=0.0,
        ),
        Fill(
            order_id="3",
            timestamp=base + timedelta(days=2),
            symbol="X",
            side=OrderSide.BUY,
            quantity=100,
            price=12.0,
            commission=0.0,
            stamp_tax=0.0,
            slippage=0.0,
        ),
        Fill(
            order_id="4",
            timestamp=base + timedelta(days=3),
            symbol="X",
            side=OrderSide.SELL,
            quantity=100,
            price=10.0,
            commission=0.0,
            stamp_tax=0.0,
            slippage=0.0,
        ),
    ]
    metrics = compute_metrics(_build_equity([100_000, 101_000, 102_000, 100_000]), fills)
    assert metrics.trade_count == 2
    assert metrics.win_rate == 0.5
    assert metrics.profit_loss_ratio > 0
