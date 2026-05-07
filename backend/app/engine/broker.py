"""模拟经纪商：收单、套用成本模型、按规则成交并更新组合。

MVP：市价单在当前 K 线收盘价叠加滑点后立即成交；限价单下一版实现。
"""

from __future__ import annotations

import itertools
from datetime import datetime

from app.core.errors import InvalidParamsError
from app.engine.costs import CostModel
from app.engine.events import Fill, Order, OrderSide, OrderStatus, OrderType
from app.engine.portfolio import Portfolio


class SimulatedBroker:
    def __init__(
        self,
        portfolio: Portfolio,
        cost_model: CostModel,
        *,
        lot_size: int = 100,
    ) -> None:
        if lot_size <= 0:
            raise InvalidParamsError("lot_size must be > 0")
        self.portfolio = portfolio
        self.cost_model = cost_model
        self.lot_size = lot_size
        self.orders: list[Order] = []
        self.fills: list[Fill] = []
        self._id_counter = itertools.count(1)

    def _next_order_id(self) -> str:
        return f"ord_{next(self._id_counter):08d}"

    def submit_order(
        self,
        symbol: str,
        side: OrderSide,
        quantity: float,
        order_type: OrderType = OrderType.MARKET,
        limit_price: float | None = None,
        *,
        timestamp: datetime | None = None,
        reference_price: float | None = None,
    ) -> str:
        order = Order(
            id=self._next_order_id(),
            timestamp=timestamp or datetime.utcnow(),
            symbol=symbol,
            side=side,
            quantity=float(quantity),
            order_type=order_type,
            limit_price=limit_price,
        )
        self.orders.append(order)

        if order_type != OrderType.MARKET:
            order.status = OrderStatus.REJECTED
            order.reject_reason = "Only market orders are supported in MVP"
            return order.id

        if reference_price is None:
            order.status = OrderStatus.REJECTED
            order.reject_reason = "No reference price for market order"
            return order.id

        quantity_to_fill = self._round_lot(quantity, side)
        if quantity_to_fill <= 0:
            order.status = OrderStatus.REJECTED
            order.reject_reason = "Quantity rounds to zero"
            return order.id

        execution_price = self.cost_model.apply_slippage(side, reference_price)
        notional = execution_price * quantity_to_fill
        commission = self.cost_model.commission(notional)
        stamp_tax = self.cost_model.stamp_tax(side, notional)

        if side == OrderSide.BUY:
            cost = notional + commission + stamp_tax
            if cost > self.portfolio.cash + 1e-6:
                order.status = OrderStatus.REJECTED
                order.reject_reason = "Insufficient cash"
                return order.id
        else:
            position = self.portfolio.get_position(symbol)
            if quantity_to_fill > position.quantity + 1e-6:
                order.status = OrderStatus.REJECTED
                order.reject_reason = "Insufficient position"
                return order.id

        fill = Fill(
            order_id=order.id,
            timestamp=order.timestamp,
            symbol=symbol,
            side=side,
            quantity=quantity_to_fill,
            price=execution_price,
            commission=commission,
            stamp_tax=stamp_tax,
            slippage=abs(execution_price - reference_price) * quantity_to_fill,
        )
        self.portfolio.apply_fill(fill)
        self.fills.append(fill)
        order.status = OrderStatus.FILLED
        order.quantity = quantity_to_fill
        return order.id

    def _round_lot(self, quantity: float, side: OrderSide) -> float:
        if quantity <= 0:
            return 0.0
        lots = int(quantity // self.lot_size)
        return float(lots * self.lot_size)

    def order_target_percent(
        self,
        symbol: str,
        target_percent: float,
        *,
        timestamp: datetime | None = None,
        reference_price: float | None = None,
    ) -> str | None:
        """将仓位市值调整至总权益的 ``target_percent`` 比例（相对目标名义资金）。"""
        if reference_price is None or reference_price <= 0:
            return None

        total_value = self.portfolio.total_value()
        target_value = total_value * target_percent
        position = self.portfolio.get_position(symbol)
        current_value = position.quantity * reference_price
        delta_value = target_value - current_value

        if delta_value > 0:
            execution_price = self.cost_model.apply_slippage(OrderSide.BUY, reference_price)
            raw_qty = delta_value / execution_price
            qty = self._round_lot(raw_qty, OrderSide.BUY)
            if qty <= 0:
                return None
            return self.submit_order(
                symbol,
                OrderSide.BUY,
                qty,
                timestamp=timestamp,
                reference_price=reference_price,
            )
        elif delta_value < 0:
            raw_qty = min(-delta_value / reference_price, position.quantity)
            qty = self._round_lot(raw_qty, OrderSide.SELL)
            if qty <= 0:
                return None
            return self.submit_order(
                symbol,
                OrderSide.SELL,
                qty,
                timestamp=timestamp,
                reference_price=reference_price,
            )
        return None
