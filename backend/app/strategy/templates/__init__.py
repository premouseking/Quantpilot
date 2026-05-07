"""内置策略模板。"""

from app.strategy.templates.dual_ma import DualMovingAverageStrategy
from app.strategy.templates.macd import MacdCrossStrategy
from app.strategy.templates.rsi import RsiReversionStrategy

__all__ = [
    "DualMovingAverageStrategy",
    "MacdCrossStrategy",
    "RsiReversionStrategy",
]
