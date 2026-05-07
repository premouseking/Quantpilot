"""Strategy base class and execution context.

The strategy interface is intentionally minimal. A strategy receives a
``StrategyContext`` per bar and emits orders by calling ``ctx.order_target_percent``
or ``ctx.submit_order``. The engine handles fills, costs, and bookkeeping.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from app.data.models import Bar
from app.engine.events import OrderSide, OrderType


class OrderRouter(Protocol):
    """Engine-side order entry point implemented by the broker/portfolio."""

    def submit_order(
        self,
        symbol: str,
        side: OrderSide,
        quantity: float,
        order_type: OrderType = OrderType.MARKET,
        limit_price: float | None = None,
    ) -> str:
        ...

    def order_target_percent(self, symbol: str, target_percent: float) -> str | None:
        ...

    def get_position(self, symbol: str) -> float:
        ...

    def get_total_value(self) -> float:
        ...

    def get_cash(self) -> float:
        ...


@dataclass
class StrategyContext:
    """Per-call context handed to the strategy on each bar."""

    timestamp: datetime
    symbol: str
    bar: Bar
    history: list[Bar]
    params: dict[str, Any]
    state: dict[str, Any] = field(default_factory=dict)
    router: OrderRouter | None = None

    def submit_order(
        self,
        side: OrderSide,
        quantity: float,
        order_type: OrderType = OrderType.MARKET,
        limit_price: float | None = None,
    ) -> str:
        if self.router is None:
            raise RuntimeError("StrategyContext has no order router attached")
        return self.router.submit_order(
            self.symbol, side, quantity, order_type=order_type, limit_price=limit_price
        )

    def order_target_percent(self, target_percent: float) -> str | None:
        if self.router is None:
            raise RuntimeError("StrategyContext has no order router attached")
        return self.router.order_target_percent(self.symbol, target_percent)

    def position(self) -> float:
        if self.router is None:
            return 0.0
        return self.router.get_position(self.symbol)


class Strategy(ABC):
    """Base class for user strategies.

    Lifecycle:
        - ``initialize(params)`` once before the first bar.
        - ``on_bar(ctx)`` for each bar in chronological order.
        - ``finalize()`` once after the last bar.
    """

    name: str = "strategy"

    def initialize(self, params: dict[str, Any]) -> None:
        """Override to validate params or precompute state."""
        return None

    @abstractmethod
    def on_bar(self, ctx: StrategyContext) -> None:
        """Handle a single bar."""

    def finalize(self) -> None:
        """Override to release resources or emit a summary."""
        return None
