"""参数敏感性分析。

对每个参数，固定其他参数为基准值，沿该参数轴向遍历采样，
测量策略表现的变化幅度，量化每个参数对最终绩效的影响程度。

支持：
- 无效采样点自动跳过
- 进度回调，用于 SSE 实时推送
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.analysis.metrics import compute_metrics
from app.core.errors import InvalidParamsError, StrategyError
from app.data.models import Frequency
from app.data.registry import get_data_provider_registry
from app.engine.backtest import BacktestConfig, run_backtest
from app.engine.costs import CostModel
from app.strategy.registry import create_strategy, get_template

ConstraintFn = Callable[[dict[str, Any]], str | None]


@dataclass
class SensitivityConfig:
    template_id: str
    symbol: str
    start: datetime
    end: datetime
    frequency: Frequency = Frequency.DAILY
    initial_cash: float = 1_000_000.0
    data_provider: str = "mock"
    base_params: dict[str, Any] = field(default_factory=dict)
    param_ranges: dict[str, dict[str, float | int]] = field(default_factory=dict)
    cost_model: CostModel = field(default_factory=CostModel)
    samples_per_param: int = 10


@dataclass
class SensitivityPoint:
    value: float | int
    cumulative_return: float
    sharpe_ratio: float
    max_drawdown: float


@dataclass
class SkippedPoint:
    param_name: str
    value: float | int
    reason: str


@dataclass
class SensitivityResult:
    param_name: str
    title: str
    points: list[SensitivityPoint]
    impact_score: float


ProgressCallback = Callable[[str, int, int, bool], None]


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


def _build_constraints(template_id: str) -> list[tuple[str, ConstraintFn]]:
    """构建参数约束。与 grid_search 共享逻辑，此处做简化版。"""
    constraints: list[tuple[str, ConstraintFn]] = []
    try:
        template = get_template(template_id)
        properties = (template.params_schema or {}).get("properties") or {}
    except Exception:
        return constraints

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

    return constraints


def _validate_params(template_id: str, params: dict[str, Any], constraints: list[tuple[str, ConstraintFn]]) -> str | None:
    """校验参数组合，返回 None 表示通过，否则返回错误消息。"""
    for _name, check_fn in constraints:
        reason = check_fn(params)
        if reason:
            return reason
    try:
        strategy = create_strategy(template_id)
        strategy.initialize(params)
        return None
    except (InvalidParamsError, StrategyError, ValueError, TypeError) as exc:
        return str(exc)
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def _generate_sample_values(
    start: float | int,
    end: float | int,
    samples: int,
    is_integer: bool,
) -> list[float | int]:
    if samples <= 1:
        return [start]
    step = (end - start) / (samples - 1)
    values: list[float | int] = []
    for i in range(samples):
        raw = start + step * i
        values.append(int(round(raw)) if is_integer else raw)
    return values


def _compute_impact_score(points: list[SensitivityPoint]) -> float:
    if len(points) < 2:
        return 0.0
    sharpe_values = [p.sharpe_ratio for p in points if p.sharpe_ratio is not None]
    if len(sharpe_values) < 2:
        return 0.0
    return max(sharpe_values) - min(sharpe_values)


def run_sensitivity_analysis(
    config: SensitivityConfig,
    on_progress: ProgressCallback | None = None,
) -> tuple[list[SensitivityResult], list[SkippedPoint]]:
    template = get_template(config.template_id)
    schema_properties = template.params_schema.get("properties") or {}
    defaults = _get_default_params(config.template_id)
    constraints = _build_constraints(config.template_id)

    registry = get_data_provider_registry()
    data_provider = registry.get(config.data_provider)
    base = {**defaults, **config.base_params} if config.base_params else defaults

    results: list[SensitivityResult] = []
    skipped: list[SkippedPoint] = []
    total_params = len(config.param_ranges)

    for param_idx, (param_name, param_range) in enumerate(config.param_ranges.items()):
        prop_schema = schema_properties.get(param_name, {})
        is_integer = prop_schema.get("type") == "integer"

        param_start = param_range.get("start")
        param_end = param_range.get("end")
        if param_start is None or param_end is None:
            continue

        samples_count = int(param_range.get("samples", config.samples_per_param))
        sample_values = _generate_sample_values(
            param_start, param_end, samples_count, is_integer,
        )

        points: list[SensitivityPoint] = []
        for val_idx, value in enumerate(sample_values):
            bt_params = {**base, param_name: value}

            # ── 约束校验 ──
            error = _validate_params(config.template_id, bt_params, constraints)
            if error:
                skipped.append(SkippedPoint(param_name=param_name, value=value, reason=error))
                if on_progress:
                    on_progress(param_name, val_idx + 1, len(sample_values), False)
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
                    strategy_params=bt_params,
                    data_provider=config.data_provider,
                    template_id=config.template_id,
                )
                strategy = create_strategy(config.template_id)
                bt_result = run_backtest(bt_config, strategy, data_provider)
                metrics = compute_metrics(bt_result.equity_curve, bt_result.fills)
                points.append(
                    SensitivityPoint(
                        value=value,
                        cumulative_return=metrics.cumulative_return,
                        sharpe_ratio=metrics.sharpe_ratio,
                        max_drawdown=metrics.max_drawdown,
                    )
                )
            except Exception as exc:
                skipped.append(
                    SkippedPoint(param_name=param_name, value=value, reason=f"{type(exc).__name__}: {exc}")
                )

            if on_progress:
                on_progress(param_name, val_idx + 1, len(sample_values), True)

        impact = _compute_impact_score(points)
        results.append(
            SensitivityResult(
                param_name=param_name,
                title=prop_schema.get("title", param_name),
                points=points,
                impact_score=impact,
            )
        )

    results.sort(key=lambda r: r.impact_score, reverse=True)
    return results, skipped
