"""策略模板注册表与内置策略冒烟测试。"""

from __future__ import annotations

from datetime import datetime
import pytest

from app.core.config import get_runtime_config
from app.core.errors import InvalidParamsError
from app.data.mock_provider import MockDataProvider
from app.data.models import Frequency
from app.engine.backtest import BacktestConfig, run_backtest
from app.strategy.registry import create_strategy, get_template, list_templates
from app.strategy.user_store import get_strategy_version, restore_strategy_version, save_user_strategy


USER_STRATEGY_CODE = """
from app.strategy.base import Strategy, StrategyContext


class HoldAfterWarmupStrategy(Strategy):
    def initialize(self, params):
        self.target_percent = float(params.get("target_percent", 0.5))
        self.warmup = int(params.get("warmup", 3))
        self.count = 0
        self.invested = False

    def on_bar(self, ctx: StrategyContext):
        self.count += 1
        if self.count >= self.warmup and not self.invested:
            ctx.order_target_percent(self.target_percent)
            self.invested = True
"""

USER_PARAMS_SCHEMA = {
    "type": "object",
    "title": "用户持有策略",
    "properties": {
        "warmup": {"type": "integer", "title": "预热 Bar", "minimum": 1, "default": 3},
        "target_percent": {
            "type": "number",
            "title": "目标仓位",
            "minimum": 0.01,
            "maximum": 1,
            "default": 0.5,
        },
    },
    "required": ["warmup", "target_percent"],
}


def test_list_templates_exposes_required_builtin_strategies() -> None:
    templates = list_templates()
    ids = {template.id for template in templates}

    assert {"dual_ma", "rsi_reversion", "macd_cross"} <= ids
    assert len(ids) == len(templates)
    for template in templates:
        assert template.title
        assert template.description
        assert template.params_schema["type"] == "object"
        assert template.params_schema["properties"]
        assert create_strategy(template.id).name == template.id


def test_template_detail_contains_frontend_parameter_schema() -> None:
    template = get_template("rsi_reversion")

    assert template.params_schema["title"] == "RSI 反转"
    assert "window" in template.params_schema["properties"]
    assert "target_percent" in template.params_schema["required"]


@pytest.mark.parametrize(
    ("template_id", "params"),
    [
        ("dual_ma", {"short_window": 5, "long_window": 20, "target_percent": 0.9}),
        (
            "rsi_reversion",
            {"window": 14, "oversold": 30, "overbought": 70, "target_percent": 0.9},
        ),
        ("macd_cross", {"fast": 12, "slow": 26, "signal": 9, "target_percent": 0.9}),
    ],
)
def test_builtin_strategy_runs_end_to_end(template_id: str, params: dict[str, float]) -> None:
    provider = MockDataProvider()
    config = BacktestConfig(
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2024, 12, 31),
        frequency=Frequency.DAILY,
        initial_cash=1_000_000.0,
        strategy_params=params,
        template_id=template_id,
    )

    result = run_backtest(config, create_strategy(template_id), provider)

    assert result.final_value > 0
    assert result.final_value == result.equity_curve[-1].total_value
    assert all(point.total_value > 0 for point in result.equity_curve)


@pytest.mark.parametrize(
    ("template_id", "params"),
    [
        ("dual_ma", {"short_window": 20, "long_window": 5}),
        ("rsi_reversion", {"oversold": 80, "overbought": 20}),
        ("macd_cross", {"fast": 26, "slow": 12}),
    ],
)
def test_builtin_strategy_rejects_invalid_params(
    template_id: str, params: dict[str, float]
) -> None:
    strategy = create_strategy(template_id)

    with pytest.raises(InvalidParamsError):
        strategy.initialize(params)


def test_saved_user_strategy_is_listed_and_runs_end_to_end() -> None:
    save_user_strategy(
        strategy_id="my_hold_strategy",
        title="用户持有策略",
        description="预热后买入并持有",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )

    template = get_template("my_hold_strategy")
    assert template.title == "用户持有策略"
    assert "my_hold_strategy" in {item.id for item in list_templates()}

    provider = MockDataProvider()
    config = BacktestConfig(
        symbol="MOCK001",
        start=datetime(2023, 1, 1),
        end=datetime(2023, 3, 31),
        frequency=Frequency.DAILY,
        initial_cash=1_000_000.0,
        strategy_params={"warmup": 3, "target_percent": 0.5},
        template_id="my_hold_strategy",
    )
    result = run_backtest(config, create_strategy("my_hold_strategy"), provider)

    assert result.final_value > 0
    assert len(result.orders) >= 1


def test_saved_user_strategy_schema_follows_code_params_schema() -> None:
    code = """
from app.strategy.base import Strategy, StrategyContext


class CodeDefaultStrategy(Strategy):
    DEFAULT_PARAMS = {"warmup": 5, "target_percent": 0.7}

    def on_bar(self, ctx: StrategyContext):
        return None


PARAMS_SCHEMA = {
    "type": "object",
    "title": "代码参数定义",
    "properties": {
        "warmup": {"type": "integer", "title": "预热 Bar", "minimum": 1, "default": 8},
        "target_percent": {
            "type": "number",
            "title": "目标仓位",
            "minimum": 0.01,
            "maximum": 1,
            "default": 0.8,
        },
    },
    "required": ["warmup", "target_percent"],
}
"""
    save_user_strategy(
        strategy_id="code_default_strategy",
        title="代码默认值策略",
        description="schema 应跟随代码 PARAMS_SCHEMA",
        code=code,
        params_schema=USER_PARAMS_SCHEMA,
    )

    template = get_template("code_default_strategy")
    properties = template.params_schema["properties"]
    assert template.params_schema["title"] == "代码参数定义"
    assert properties["warmup"]["default"] == 8
    assert properties["target_percent"]["default"] == 0.8


def test_save_user_strategy_does_not_execute_module_level_code() -> None:
    marker_path = get_runtime_config().strategies_dir / "save_should_not_run.txt"
    code = f"""
from pathlib import Path
from app.strategy.base import Strategy, StrategyContext

Path(r"{marker_path.as_posix()}").write_text("executed", encoding="utf-8")


class SaveOnlyStrategy(Strategy):
    def on_bar(self, ctx: StrategyContext):
        return None
"""

    save_user_strategy(
        strategy_id="save_only_strategy",
        title="仅保存校验",
        description="保存时不应执行模块级代码",
        code=code,
        params_schema={"type": "object", "properties": {}, "required": []},
    )

    assert not marker_path.exists()


def test_restore_strategy_version_overwrites_current_strategy() -> None:
    v1_code = USER_STRATEGY_CODE.replace("0.5", "0.4")
    v2_code = USER_STRATEGY_CODE.replace("0.5", "0.8")
    save_user_strategy(
        strategy_id="restore_hold_strategy",
        title="恢复测试策略",
        description="第一版",
        code=v1_code,
        params_schema=USER_PARAMS_SCHEMA,
        version_note="v1",
    )
    save_user_strategy(
        strategy_id="restore_hold_strategy",
        title="恢复测试策略",
        description="第二版",
        code=v2_code,
        params_schema=USER_PARAMS_SCHEMA,
        overwrite=True,
        version_note="v2",
    )

    restored = restore_strategy_version("restore_hold_strategy", "v1")
    current_version = get_strategy_version("restore_hold_strategy", restored.current_version or "")

    assert restored.current_version == "v3"
    assert "0.4" in restored.code_path.read_text(encoding="utf-8")
    assert "0.4" in current_version.code_path.read_text(encoding="utf-8")
