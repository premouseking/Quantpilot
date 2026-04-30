"""Event-driven backtest main loop.

MVP scope:
- Single-symbol, Bar-level loop.
- Strategies emit market orders via ``ctx.order_target_percent`` /
  ``ctx.submit_order``; the broker fills at the current bar's close with
  configured slippage.
- Equity curve is sampled at every bar using last-known prices.

Out of scope for MVP: multi-symbol portfolio, limit orders, intra-bar fills,
margin, short selling, after-hours events.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pandas as pd

from app.core.errors import BacktestFailedError, InvalidParamsError
from app.data.models import Bar, Frequency, bars_from_dataframe
from app.data.provider import DataProvider
from app.engine.broker import SimulatedBroker
from app.engine.costs import CostModel
from app.engine.events import Fill, Order, OrderSide, OrderType
from app.engine.portfolio import EquityPoint, Portfolio
from app.strategy.base import OrderRouter, Strategy, StrategyContext


@dataclass
class BacktestConfig:
    symbol: str
    start: datetime
    end: datetime
    frequency: Frequency = Frequency.DAILY
    initial_cash: float = 1_000_000.0
    cost_model: CostModel = field(default_factory=CostModel)
    strategy_params: dict[str, Any] = field(default_factory=dict)
    benchmark_symbol: str | None = None
    history_window: int = 200
    lot_size: int = 100
    data_provider: str = "mock"
    template_id: str | None = None


@dataclass
class BacktestResult:
    config: BacktestConfig
    equity_curve: list[EquityPoint]
    benchmark_curve: list[EquityPoint]
    fills: list[Fill]
    orders: list[Order]
    final_value: float
    final_cash: float
    final_position: float


class _BoundRouter:
    """Adapter that wires StrategyContext calls into the broker with
    per-bar timestamp and reference price baked in."""

    def __init__(self, broker: SimulatedBroker) -> None:
        self._broker = broker
        self._timestamp: datetime | None = None
        self._reference_price: float | None = None

    def bind(self, timestamp: datetime, reference_price: float) -> None:
        self._timestamp = timestamp
        self._reference_price = reference_price

    def submit_order(
        self,
        symbol: str,
        side: OrderSide,
        quantity: float,
        order_type: OrderType = OrderType.MARKET,
        limit_price: float | None = None,
    ) -> str:
        return self._broker.submit_order(
            symbol,
            side,
            quantity,
            order_type=order_type,
            limit_price=limit_price,
            timestamp=self._timestamp,
            reference_price=self._reference_price,
        )

    def order_target_percent(self, symbol: str, target_percent: float) -> str | None:
        return self._broker.order_target_percent(
            symbol,
            target_percent,
            timestamp=self._timestamp,
            reference_price=self._reference_price,
        )

    def get_position(self, symbol: str) -> float:
        return self._broker.portfolio.get_position(symbol).quantity

    def get_total_value(self) -> float:
        return self._broker.portfolio.total_value()

    def get_cash(self) -> float:
        return self._broker.portfolio.cash


def _benchmark_curve(
    bars: list[Bar], initial_value: float
) -> list[EquityPoint]:
    """Return a buy-and-hold benchmark curve normalized to ``initial_value``."""
    if not bars:
        return []
    base_price = bars[0].close
    points: list[EquityPoint] = []
    for bar in bars:
        scale = bar.close / base_price
        total = initial_value * scale
        points.append(
            EquityPoint(
                timestamp=bar.timestamp,
                cash=0.0,
                market_value=total,
                total_value=total,
            )
        )
    return points


def run_backtest(
    config: BacktestConfig,
    strategy: Strategy,
    data_provider: DataProvider,
    benchmark_provider: DataProvider | None = None,
) -> BacktestResult:
    """Execute a single backtest end-to-end."""
    if config.start > config.end:
        raise InvalidParamsError("start must be <= end")
    if config.initial_cash <= 0:
        raise InvalidParamsError("initial_cash must be > 0")

    df = data_provider.get_bars(config.symbol, config.frequency, config.start, config.end)
    if df.empty:
        raise BacktestFailedError(
            "No bars returned for backtest range",
            symbol=config.symbol,
            start=config.start.isoformat(),
            end=config.end.isoformat(),
        )

    bars = bars_from_dataframe(df, config.symbol)

    portfolio = Portfolio(initial_cash=config.initial_cash)
    broker = SimulatedBroker(portfolio, config.cost_model, lot_size=config.lot_size)
    router: OrderRouter = _BoundRouter(broker)

    try:
        strategy.initialize(config.strategy_params)
    except Exception as exc:
        raise BacktestFailedError(
            f"Strategy initialize failed: {exc}", stage="initialize"
        ) from exc

    history: list[Bar] = []
    state: dict[str, Any] = {}
    window = max(1, int(config.history_window))

    for bar in bars:
        portfolio.update_last_price(bar.symbol, bar.close)
        if isinstance(router, _BoundRouter):
            router.bind(bar.timestamp, bar.close)

        ctx = StrategyContext(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            bar=bar,
            history=history,
            params=config.strategy_params,
            state=state,
            router=router,
        )

        try:
            strategy.on_bar(ctx)
        except Exception as exc:
            raise BacktestFailedError(
                f"Strategy on_bar failed at {bar.timestamp.isoformat()}: {exc}",
                stage="on_bar",
                timestamp=bar.timestamp.isoformat(),
            ) from exc

        history.append(bar)
        if len(history) > window:
            history = history[-window:]

        portfolio.snapshot_equity(bar.timestamp)

    try:
        strategy.finalize()
    except Exception as exc:
        raise BacktestFailedError(
            f"Strategy finalize failed: {exc}", stage="finalize"
        ) from exc

    benchmark_curve: list[EquityPoint] = []
    if config.benchmark_symbol and benchmark_provider is not None:
        try:
            bench_df = benchmark_provider.get_bars(
                config.benchmark_symbol, config.frequency, config.start, config.end
            )
            bench_bars = bars_from_dataframe(bench_df, config.benchmark_symbol)
            benchmark_curve = _benchmark_curve(bench_bars, config.initial_cash)
        except Exception:
            benchmark_curve = []

    final_position = portfolio.get_position(config.symbol).quantity
    return BacktestResult(
        config=config,
        equity_curve=portfolio.equity_curve,
        benchmark_curve=benchmark_curve,
        fills=broker.fills,
        orders=broker.orders,
        final_value=portfolio.total_value(),
        final_cash=portfolio.cash,
        final_position=final_position,
    )


def equity_curve_to_dataframe(points: list[EquityPoint]) -> pd.DataFrame:
    if not points:
        return pd.DataFrame(columns=["timestamp", "cash", "market_value", "total_value"])
    return pd.DataFrame(
        {
            "timestamp": [p.timestamp for p in points],
            "cash": [p.cash for p in points],
            "market_value": [p.market_value for p in points],
            "total_value": [p.total_value for p in points],
        }
    )
