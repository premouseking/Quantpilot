"""参数优化模块测试：网格搜索与敏感性分析。"""

from __future__ import annotations

from datetime import datetime

import pytest

from app.data.models import Frequency
from app.engine.costs import CostModel
from app.optimization.grid_search import GridSearchConfig, run_grid_search
from app.optimization.sensitivity import SensitivityConfig, run_sensitivity_analysis


def test_grid_search_dual_ma_basic() -> None:
    config = GridSearchConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        frequency=Frequency.DAILY,
        initial_cash=1_000_000.0,
        data_provider="mock",
        param_grid={
            "short_window": [5, 10],
            "long_window": [20, 30],
        },
        cost_model=CostModel(),
        sort_by="sharpe_ratio",
    )
    results, skipped = run_grid_search(config)
    assert len(results) == 4  # 2 x 2 all valid
    assert len(skipped) == 0
    for item in results:
        assert "short_window" in item.params
        assert "long_window" in item.params
        assert isinstance(item.sharpe_ratio, float)
        assert isinstance(item.cumulative_return, float)
        assert isinstance(item.max_drawdown, float)
    assert results[0].sharpe_ratio >= results[-1].sharpe_ratio


def test_grid_search_skips_invalid_combinations() -> None:
    config = GridSearchConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        data_provider="mock",
        param_grid={
            "short_window": [5, 20],
            "long_window": [10, 20],
        },
        sort_by="sharpe_ratio",
    )
    results, skipped = run_grid_search(config)
    # short=20, long=10: invalid (short >= long)
    # short=20, long=20: invalid (short >= long)
    # short=5, long=10: valid
    # short=5, long=20: valid
    assert len(results) == 2
    assert len(skipped) == 2
    assert any("short_window" in s.reason or "must be <" in s.reason for s in skipped)


def test_grid_search_single_axis() -> None:
    config = GridSearchConfig(
        template_id="rsi_reversion",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        frequency=Frequency.DAILY,
        data_provider="mock",
        param_grid={
            "window": [7, 14, 21],
        },
        cost_model=CostModel(),
    )
    results, skipped = run_grid_search(config)
    # All should be valid since defaults fill in oversold/overbought/target_percent
    assert len(results) == 3
    assert len(skipped) == 0
    windows = {r.params["window"] for r in results}
    assert windows == {7, 14, 21}


def test_grid_search_sort_by_cumulative() -> None:
    config = GridSearchConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        data_provider="mock",
        param_grid={"short_window": [5, 10], "long_window": [20]},
        sort_by="cumulative_return",
    )
    results, skipped = run_grid_search(config)
    assert len(results) == 2
    assert results[0].cumulative_return >= results[-1].cumulative_return


def test_grid_search_rejects_empty_grid() -> None:
    from app.core.errors import InvalidParamsError

    config = GridSearchConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        data_provider="mock",
        param_grid={},
    )
    with pytest.raises(InvalidParamsError, match="param_grid must contain at least one"):
        run_grid_search(config)


def test_grid_search_skipped_in_response() -> None:
    config = GridSearchConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 1, 31),
        data_provider="mock",
        param_grid={"short_window": [10, 20], "long_window": [5]},
    )
    results, skipped = run_grid_search(config)
    # short >= long for both, all skipped
    assert len(results) == 0
    assert len(skipped) == 2


def test_sensitivity_analysis_basic() -> None:
    config = SensitivityConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        frequency=Frequency.DAILY,
        data_provider="mock",
        base_params={"short_window": 10, "long_window": 30, "target_percent": 0.95},
        param_ranges={
            "short_window": {"start": 5, "end": 20, "samples": 3},
            "long_window": {"start": 20, "end": 60, "samples": 3},
        },
        cost_model=CostModel(),
        samples_per_param=4,
    )
    results, skipped = run_sensitivity_analysis(config)
    assert len(results) == 2
    for result in results:
        assert len(result.points) == 3
        assert result.param_name in {"short_window", "long_window"}
        assert result.impact_score >= 0
        for point in result.points:
            assert isinstance(point.sharpe_ratio, float)


def test_sensitivity_impact_scores_are_sorted() -> None:
    config = SensitivityConfig(
        template_id="dual_ma",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 6, 30),
        data_provider="mock",
        base_params={"short_window": 10, "long_window": 30, "target_percent": 0.95},
        param_ranges={
            "short_window": {"start": 5, "end": 15, "samples": 3},
            "long_window": {"start": 20, "end": 50, "samples": 3},
        },
        samples_per_param=4,
    )
    results, skipped = run_sensitivity_analysis(config)
    for i in range(len(results) - 1):
        assert results[i].impact_score >= results[i + 1].impact_score


def test_sensitivity_includes_both_axes() -> None:
    config = SensitivityConfig(
        template_id="macd_cross",
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 9, 30),
        data_provider="mock",
        base_params={"fast": 12, "slow": 26, "signal": 9, "target_percent": 0.95},
        param_ranges={
            "fast": {"start": 6, "end": 24, "samples": 3},
            "slow": {"start": 20, "end": 50, "samples": 3},
        },
    )
    results, skipped = run_sensitivity_analysis(config)
    param_names = {r.param_name for r in results}
    assert param_names == {"fast", "slow"}
