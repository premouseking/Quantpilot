"""策略基类与每 Bar 执行上下文（StrategyContext）。

接口刻意保持精简：策略在每个 Bar 收到 ``StrategyContext``，
通过 ``ctx.order_target_percent`` 或 ``ctx.submit_order`` 发单；
引擎负责撮合、费用与账务。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from app.data.models import Bar
from app.engine.events import OrderSide, OrderType


class OrderRouter(Protocol):
    """引擎侧下单入口协议，由经纪商/路由适配器实现。"""

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
    """策略在每个 Bar 上获得的调用上下文（行情、历史窗口、参数、路由）。"""

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
    """用户策略抽象基类。

    生命周期：
        - ``initialize(params)``：首根 Bar 之前调用一次；
        - ``on_bar(ctx)``：按时间顺序逐 Bar；
        - ``finalize()``：最后一根 Bar 之后调用一次。
    """

    name: str = "strategy"

    def initialize(self, params: dict[str, Any]) -> None:
        """可覆盖：校验参数或预计算状态。"""

    @abstractmethod
    def on_bar(self, ctx: StrategyContext) -> None:
        """处理单根 K 线（Bar）。"""

    def finalize(self) -> None:
        """可覆盖：释放资源或输出汇总信息。"""
