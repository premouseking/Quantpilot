"""参数网格搜索引擎。

对策略参数的笛卡尔积组合逐一遍历，每个组合执行一次回测，
收集绩效指标，返回按指定排序键排列的结果矩阵。

支持：
- 无效参数组合自动跳过（捕获策略 initialize 阶段的校验错误）
- 进度回调，用于 SSE 实时推送
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from itertools import product
from typing import Any

from app.analysis.metrics import compute_metrics
from app.core.errors import InvalidParamsError, StrategyError
from app.data.models import Frequency
from app.data.registry import get_data_provider_registry
from app.engine.backtest import BacktestConfig, run_backtest
from app.engine.costs import CostModel
from app.strategy.registry import create_strategy, get_template


@dataclass
class GridSearchConfig:
    template_id: str
    symbol: str
    start: datetime
    end: datetime
    frequency: Frequency = Frequency.DAILY
    initial_cash: float = 1_000_000.0
    data_provider: str = "mock"
    param_grid: dict[str, list[float | int]] = field(default_factory=dict)
    cost_model: CostModel = field(default_factory=CostModel)
    sort_by: str = "sharpe_ratio"


@dataclass
class GridResultItem:
    params: dict[str, float | int]
    cumulative_return: float
    annualized_return: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    trade_count: int
    final_value: float
    sortino_ratio: float
    calmar_ratio: float


@dataclass
class SkippedCombination:
    params: dict[str, float | int]
    reason: str


ProgressCallback = Callable[[int, int, GridResultItem | None], None]


def _get_default_params(template_id: str) -> dict[str, Any]:
    """从策略模板的 params_schema 提取默认参数值。"""
    try:
        template = get_template(template_id)
        properties = (template.params_schema or {}).get("properties") or {}
    except Exception:
        return {}
    defaults: dict[str, Any] = {}
    for key, prop in properties.items():
        if isinstance(prop, dict) and "default" in prop:
            defaults[key] = prop["default"]
    return defaults


def _interpolate_params(
    template_id: str,
    param_grid: dict[str, list[float | int]],
) -> list[dict[str, Any]]:
    if not param_grid:
        raise InvalidParamsError("param_grid must contain at least one parameter axis")
    defaults = _get_default_params(template_id)
    keys = list(param_grid.keys())
    values = list(param_grid.values())
    combinations: list[dict[str, Any]] = []
    for combo in product(*values):
        merged = {**defaults}
        merged.update(dict(zip(keys, combo)))
        combinations.append(merged)
    return combinations


def _validate_params_with_strategy(
    template_id: str,
    params: dict[str, Any],
) -> str | None:
    """尝试用给定参数初始化策略，返回 None 表示通过，否则返回错误消息。"""
    try:
        strategy = create_strategy(template_id)
        strategy.initialize(params)
        return None
    except (InvalidParamsError, StrategyError, ValueError, TypeError) as exc:
        return str(exc)
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


ConstraintFn = Callable[[dict[str, Any]], str | None]

def _build_param_constraints(template_id: str) -> list[tuple[str, ConstraintFn]]:
    """根据策略模板的 params_schema 构建参数约束检查器。

    通用约束：
    - 任何标记为 integer/number 且定义了 minimum/maximum 的参数自动校验范围

    交叉约束（由模板 ID 推断）：
    - dual_ma / sma 类：short_window < long_window
    - macd_cross：fast < slow
    """
    constraints: list[tuple[str, ConstraintFn]] = []

    try:
        template = get_template(template_id)
        schema = template.params_schema
        properties = schema.get("properties") or {}
    except Exception:
        properties = {}

    for key, prop in properties.items():
        minimum = prop.get("minimum")
        maximum = prop.get("maximum")
        if minimum is not None or maximum is not None:
            def _make_range_check(k: str, mn: float | None, mx: float | None):
                def _check(params: dict[str, Any]) -> str | None:
                    v = params.get(k)
                    if v is None:
                        return None
                    if mn is not None and v < mn:
                        return f"{k}={v} < minimum={mn}"
                    if mx is not None and v > mx:
                        return f"{k}={v} > maximum={mx}"
                    return None
                return _check
            constraints.append((f"{key}_range", _make_range_check(key, minimum, maximum)))

    # 交叉约束：short < long for sma-based strategies
    if "short_window" in properties and "long_window" in properties:
        def _check_short_lt_long(params: dict[str, Any]) -> str | None:
            sw = params.get("short_window")
            lw = params.get("long_window")
            if sw is not None and lw is not None and sw >= lw:
                return f"short_window({sw}) must be < long_window({lw})"
            return None
        constraints.append(("short_lt_long", _check_short_lt_long))

    if "fast" in properties and "slow" in properties:
        def _check_fast_lt_slow(params: dict[str, Any]) -> str | None:
            f = params.get("fast")
            s = params.get("slow")
            if f is not None and s is not None and f >= s:
                return f"fast({f}) must be < slow({s})"
            return None
        constraints.append(("fast_lt_slow", _check_fast_lt_slow))

    if "entry_window" in properties and "exit_window" in properties:
        def _check_entry_gt_exit(params: dict[str, Any]) -> str | None:
            ew = params.get("entry_window")
            xw = params.get("exit_window")
            if ew is not None and xw is not None and ew < xw:
                return f"entry_window({ew}) should be >= exit_window({xw})"
            return None
        constraints.append(("entry_ge_exit", _check_entry_gt_exit))

    return constraints


def run_grid_search(
    config: GridSearchConfig,
    on_progress: ProgressCallback | None = None,
) -> tuple[list[GridResultItem], list[SkippedCombination]]:
    """执行网格搜索，跳过无效参数组合。"""
    registry = get_data_provider_registry()
    data_provider = registry.get(config.data_provider)

    parameter_sets = _interpolate_params(config.template_id, config.param_grid)
    constraints = _build_param_constraints(config.template_id)
    total = len(parameter_sets)

    results: list[GridResultItem] = []
    skipped: list[SkippedCombination] = []

    for idx, params in enumerate(parameter_sets):
        # ── 约束预检 ──
        skip_reason: str | None = None
        for _constraint_name, check_fn in constraints:
            reason = check_fn(params)
            if reason:
                skip_reason = reason
                break

        if skip_reason:
            skipped.append(SkippedCombination(params=params, reason=skip_reason))
            if on_progress:
                on_progress(idx + 1, total, None)
            continue

        # ── 运行时校验 ──
        runtime_error = _validate_params_with_strategy(config.template_id, params)
        if runtime_error:
            skipped.append(SkippedCombination(params=params, reason=runtime_error))
            if on_progress:
                on_progress(idx + 1, total, None)
            continue

        # ── 执行回测 ──
        try:
            bt_config = BacktestConfig(
                symbol=config.symbol,
                start=config.start,
                end=config.end,
                frequency=config.frequency,
                initial_cash=config.initial_cash,
                cost_model=config.cost_model,
                strategy_params=params,
                data_provider=config.data_provider,
                template_id=config.template_id,
            )
            strategy_fresh = create_strategy(config.template_id)
            bt_result = run_backtest(bt_config, strategy_fresh, data_provider)
            metrics = compute_metrics(bt_result.equity_curve, bt_result.fills)
            item = GridResultItem(
                params=params,
                cumulative_return=metrics.cumulative_return,
                annualized_return=metrics.annualized_return,
                sharpe_ratio=metrics.sharpe_ratio,
                max_drawdown=metrics.max_drawdown,
                win_rate=metrics.win_rate,
                trade_count=metrics.trade_count,
                final_value=bt_result.final_value,
                sortino_ratio=metrics.sortino_ratio,
                calmar_ratio=metrics.calmar_ratio,
            )
            results.append(item)
        except Exception as exc:
            skipped.append(
                SkippedCombination(params=params, reason=f"{type(exc).__name__}: {exc}")
            )

        if on_progress:
            on_progress(idx + 1, total, results[-1] if results else None)

    sort_key = config.sort_by
    reverse = sort_key not in {"max_drawdown"}
    results.sort(
        key=lambda r: getattr(r, sort_key, 0.0) or 0.0,
        reverse=reverse,
    )
    return results, skipped
