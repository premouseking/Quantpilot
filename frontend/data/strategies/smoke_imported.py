
from app.strategy.base import Strategy, StrategyContext

class SmokeStrategy(Strategy):
    def initialize(self, params):
        self.pct = float(params.get('pct', 0.5))
    def on_bar(self, ctx: StrategyContext):
        if ctx.bar.close > 0:
            ctx.order_target_percent(self.pct)
