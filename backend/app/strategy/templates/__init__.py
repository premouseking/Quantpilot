"""内置策略模板。"""

from app.strategy.templates.bollinger import BollingerBreakoutStrategy
from app.strategy.templates.dual_ma import DualMovingAverageStrategy
from app.strategy.templates.macd import MacdCrossStrategy
from app.strategy.templates.rsi import RsiReversionStrategy
from app.strategy.templates.turtle import TurtleTradingStrategy

__all__ = [
    "BollingerBreakoutStrategy",
    "DualMovingAverageStrategy",
    "MacdCrossStrategy",
    "RsiReversionStrategy",
    "TurtleTradingStrategy",
]
