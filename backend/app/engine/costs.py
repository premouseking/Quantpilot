"""Cost and slippage models for the simulated broker."""

from __future__ import annotations

from dataclasses import dataclass

from app.engine.events import OrderSide


@dataclass(frozen=True, slots=True)
class CostModel:
    """Linear cost model: commission rate + minimum, stamp tax on sells, slippage bps.

    A-share defaults follow common retail assumptions and can be overridden by
    the user via ``BacktestConfig``.
    """

    commission_rate: float = 0.0003
    min_commission: float = 5.0
    stamp_tax_rate: float = 0.001
    slippage_bps: float = 5.0

    def apply_slippage(self, side: OrderSide, reference_price: float) -> float:
        """Return execution price after applying linear slippage in bps."""
        bps = self.slippage_bps / 10_000.0
        if side == OrderSide.BUY:
            return reference_price * (1.0 + bps)
        return reference_price * (1.0 - bps)

    def commission(self, notional: float) -> float:
        return max(self.min_commission, abs(notional) * self.commission_rate)

    def stamp_tax(self, side: OrderSide, notional: float) -> float:
        if side == OrderSide.SELL:
            return abs(notional) * self.stamp_tax_rate
        return 0.0
