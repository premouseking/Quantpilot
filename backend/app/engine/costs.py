"""模拟经纪商成本：佣金、印花税、滑点（bps）。"""

from __future__ import annotations

from dataclasses import dataclass

from app.engine.events import OrderSide


@dataclass(frozen=True, slots=True)
class CostModel:
    """线性成本模型：比例佣金 + 单笔最低、卖出印花税、bps 滑点。

    A 股默认值按常见零售口径，可通过 ``BacktestConfig`` 覆盖。
    """

    commission_rate: float = 0.0003
    min_commission: float = 5.0
    stamp_tax_rate: float = 0.001
    slippage_bps: float = 5.0

    def apply_slippage(self, side: OrderSide, reference_price: float) -> float:
        """在参考价上按 bps 施加线性滑点，得到成交价。"""
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
