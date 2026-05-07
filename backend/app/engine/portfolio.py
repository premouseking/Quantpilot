"""组合：现金、持仓、按市值计价权益与权益曲线。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.engine.events import Fill, OrderSide


@dataclass
class Position:
    symbol: str
    quantity: float = 0.0
    average_cost: float = 0.0

    def market_value(self, last_price: float) -> float:
        return self.quantity * last_price

    def unrealized_pnl(self, last_price: float) -> float:
        return (last_price - self.average_cost) * self.quantity


@dataclass
class EquityPoint:
    timestamp: datetime
    cash: float
    market_value: float
    total_value: float


@dataclass
class Portfolio:
    """单账户组合状态。

    每笔成交的佣金与印花税从现金扣减；买入按加权平均更新成本价；
    卖出减少数量，在数量归零前不重置均价。
    """

    initial_cash: float
    cash: float = field(init=False)
    positions: dict[str, Position] = field(default_factory=dict)
    equity_curve: list[EquityPoint] = field(default_factory=list)
    last_prices: dict[str, float] = field(default_factory=dict)
    realized_pnl: float = 0.0
    total_commission: float = 0.0
    total_stamp_tax: float = 0.0

    def __post_init__(self) -> None:
        self.cash = float(self.initial_cash)

    def get_position(self, symbol: str) -> Position:
        position = self.positions.get(symbol)
        if position is None:
            position = Position(symbol=symbol)
            self.positions[symbol] = position
        return position

    def update_last_price(self, symbol: str, price: float) -> None:
        self.last_prices[symbol] = price

    def market_value(self) -> float:
        total = 0.0
        for symbol, position in self.positions.items():
            price = self.last_prices.get(symbol, position.average_cost)
            total += position.market_value(price)
        return total

    def total_value(self) -> float:
        return self.cash + self.market_value()

    def apply_fill(self, fill: Fill) -> None:
        position = self.get_position(fill.symbol)
        gross = fill.price * fill.quantity
        fees = fill.commission + fill.stamp_tax

        if fill.side == OrderSide.BUY:
            new_quantity = position.quantity + fill.quantity
            if new_quantity <= 0:
                position.average_cost = 0.0
            else:
                position.average_cost = (
                    position.average_cost * position.quantity + gross
                ) / new_quantity
            position.quantity = new_quantity
            self.cash -= gross + fees
        else:
            realized = (fill.price - position.average_cost) * fill.quantity - fees
            self.realized_pnl += realized
            position.quantity -= fill.quantity
            if position.quantity <= 1e-9:
                position.quantity = 0.0
                position.average_cost = 0.0
            self.cash += gross - fees

        self.total_commission += fill.commission
        self.total_stamp_tax += fill.stamp_tax

    def snapshot_equity(self, timestamp: datetime) -> EquityPoint:
        point = EquityPoint(
            timestamp=timestamp,
            cash=self.cash,
            market_value=self.market_value(),
            total_value=self.total_value(),
        )
        self.equity_curve.append(point)
        return point
