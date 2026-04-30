"""Engine events: orders, fills, and shared enums."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class OrderStatus(str, Enum):
    PENDING = "pending"
    FILLED = "filled"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


@dataclass
class Order:
    id: str
    timestamp: datetime
    symbol: str
    side: OrderSide
    quantity: float
    order_type: OrderType
    limit_price: float | None = None
    status: OrderStatus = OrderStatus.PENDING
    reject_reason: str | None = None


@dataclass
class Fill:
    """Realized trade after slippage and commission."""

    order_id: str
    timestamp: datetime
    symbol: str
    side: OrderSide
    quantity: float
    price: float
    commission: float
    stamp_tax: float
    slippage: float
