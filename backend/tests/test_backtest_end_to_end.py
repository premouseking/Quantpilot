"""端到端回测：双均线模板 + mock 数据。"""

from __future__ import annotations

from datetime import datetime

from app.data.mock_provider import MockDataProvider
from app.data.models import Frequency
from app.engine.backtest import BacktestConfig, run_backtest
from app.strategy.registry import create_strategy


def test_dual_ma_runs_end_to_end_on_mock_data() -> None:
    provider = MockDataProvider()
    config = BacktestConfig(
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2024, 12, 31),
        frequency=Frequency.DAILY,
        initial_cash=1_000_000.0,
        strategy_params={"short_window": 5, "long_window": 20, "target_percent": 0.95},
    )
    strategy = create_strategy("dual_ma")
    result = run_backtest(config, strategy, provider)

    assert len(result.equity_curve) > 0
    assert result.final_value > 0
    assert result.equity_curve[0].total_value == config.initial_cash
    assert result.final_value == result.equity_curve[-1].total_value
    assert result.final_value > 0
    assert all(point.total_value > 0 for point in result.equity_curve)
