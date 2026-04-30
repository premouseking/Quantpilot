"""Backtest service: orchestrates data, strategy, engine, and storage."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.analysis.metrics import DEFAULT_PERIODS_PER_YEAR
from app.analysis.report import build_report
from app.core.errors import InvalidParamsError
from app.data.models import Frequency
from app.data.registry import get_data_provider_registry
from app.engine.backtest import BacktestConfig, run_backtest
from app.engine.costs import CostModel
from app.storage.run_store import get_run_store
from app.strategy.registry import create_strategy


def _periods_per_year(frequency: Frequency) -> int:
    if frequency == Frequency.DAILY:
        return 252
    if frequency == Frequency.MINUTE_1:
        return 252 * 240
    if frequency == Frequency.MINUTE_5:
        return 252 * 48
    if frequency == Frequency.MINUTE_15:
        return 252 * 16
    if frequency == Frequency.MINUTE_30:
        return 252 * 8
    if frequency == Frequency.HOUR_1:
        return 252 * 4
    return DEFAULT_PERIODS_PER_YEAR


def run_backtest_request(payload: dict[str, Any]) -> dict[str, Any]:
    """Execute a backtest from a request payload and persist the report."""
    try:
        symbol = payload["symbol"]
        start = datetime.fromisoformat(payload["start"])
        end = datetime.fromisoformat(payload["end"])
        frequency = Frequency(payload.get("frequency", Frequency.DAILY.value))
        provider_name = payload.get("data_provider", "mock")
        template_id = payload["template_id"]
        strategy_params = payload.get("strategy_params") or {}
        initial_cash = float(payload.get("initial_cash", 1_000_000.0))
        benchmark_symbol = payload.get("benchmark_symbol")
        benchmark_provider_name = payload.get("benchmark_provider", provider_name)
    except KeyError as exc:
        raise InvalidParamsError(f"Missing field: {exc}") from exc
    except ValueError as exc:
        raise InvalidParamsError(f"Invalid field value: {exc}") from exc

    cost_payload = payload.get("cost_model") or {}
    cost_model = CostModel(
        commission_rate=float(cost_payload.get("commission_rate", 0.0003)),
        min_commission=float(cost_payload.get("min_commission", 5.0)),
        stamp_tax_rate=float(cost_payload.get("stamp_tax_rate", 0.001)),
        slippage_bps=float(cost_payload.get("slippage_bps", 5.0)),
    )

    config = BacktestConfig(
        symbol=symbol,
        start=start,
        end=end,
        frequency=frequency,
        initial_cash=initial_cash,
        cost_model=cost_model,
        strategy_params=strategy_params,
        benchmark_symbol=benchmark_symbol,
        data_provider=provider_name,
        template_id=template_id,
    )

    registry = get_data_provider_registry()
    data_provider = registry.get(provider_name)
    benchmark_provider = registry.get(benchmark_provider_name) if benchmark_symbol else None
    strategy = create_strategy(template_id)

    result = run_backtest(config, strategy, data_provider, benchmark_provider)
    report = build_report(
        result,
        periods_per_year=_periods_per_year(frequency),
    )

    store = get_run_store()
    run_id = store.create_run_id()
    envelope = store.save(run_id, report)
    return envelope
