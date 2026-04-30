"""Report assembly: pack equity curve, trades, and metrics into JSON-friendly shapes."""

from __future__ import annotations

from typing import Any

from app.engine.backtest import BacktestResult
from app.engine.events import Fill, Order
from app.engine.portfolio import EquityPoint

from .metrics import DEFAULT_PERIODS_PER_YEAR, compute_metrics


def equity_curve_to_payload(points: list[EquityPoint]) -> list[dict[str, Any]]:
    return [
        {
            "timestamp": p.timestamp.isoformat(),
            "cash": p.cash,
            "market_value": p.market_value,
            "total_value": p.total_value,
        }
        for p in points
    ]


def fills_to_payload(fills: list[Fill]) -> list[dict[str, Any]]:
    return [
        {
            "order_id": f.order_id,
            "timestamp": f.timestamp.isoformat(),
            "symbol": f.symbol,
            "side": f.side.value,
            "quantity": f.quantity,
            "price": f.price,
            "commission": f.commission,
            "stamp_tax": f.stamp_tax,
            "slippage": f.slippage,
        }
        for f in fills
    ]


def orders_to_payload(orders: list[Order]) -> list[dict[str, Any]]:
    return [
        {
            "id": o.id,
            "timestamp": o.timestamp.isoformat(),
            "symbol": o.symbol,
            "side": o.side.value,
            "quantity": o.quantity,
            "order_type": o.order_type.value,
            "limit_price": o.limit_price,
            "status": o.status.value,
            "reject_reason": o.reject_reason,
        }
        for o in orders
    ]


def build_report(
    result: BacktestResult,
    *,
    periods_per_year: int = DEFAULT_PERIODS_PER_YEAR,
    risk_free: float = 0.0,
) -> dict[str, Any]:
    metrics = compute_metrics(
        result.equity_curve,
        result.fills,
        periods_per_year=periods_per_year,
        risk_free=risk_free,
    )
    return {
        "config": {
            "symbol": result.config.symbol,
            "frequency": result.config.frequency.value,
            "start": result.config.start.isoformat(),
            "end": result.config.end.isoformat(),
            "initial_cash": result.config.initial_cash,
            "benchmark_symbol": result.config.benchmark_symbol,
            "data_provider": result.config.data_provider,
            "template_id": result.config.template_id,
            "strategy_params": result.config.strategy_params,
            "cost_model": {
                "commission_rate": result.config.cost_model.commission_rate,
                "min_commission": result.config.cost_model.min_commission,
                "stamp_tax_rate": result.config.cost_model.stamp_tax_rate,
                "slippage_bps": result.config.cost_model.slippage_bps,
            },
        },
        "summary": {
            "final_value": result.final_value,
            "final_cash": result.final_cash,
            "final_position": result.final_position,
        },
        "metrics": metrics.to_dict(),
        "equity_curve": equity_curve_to_payload(result.equity_curve),
        "benchmark_curve": equity_curve_to_payload(result.benchmark_curve),
        "fills": fills_to_payload(result.fills),
        "orders": orders_to_payload(result.orders),
    }
