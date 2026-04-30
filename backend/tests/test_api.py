"""API smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from app.main import create_app

    return TestClient(create_app())


def test_health_endpoint() -> None:
    client = _client()
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_list_data_providers() -> None:
    client = _client()
    resp = client.get("/api/data/providers")
    assert resp.status_code == 200
    assert "mock" in resp.json()["providers"]


def test_list_strategy_templates() -> None:
    client = _client()
    resp = client.get("/api/strategies/templates")
    assert resp.status_code == 200
    ids = [t["id"] for t in resp.json()["templates"]]
    assert "dual_ma" in ids


def test_run_and_fetch_backtest() -> None:
    client = _client()
    payload = {
        "template_id": "dual_ma",
        "symbol": "MOCK001",
        "start": "2023-01-01T00:00:00",
        "end": "2024-06-30T00:00:00",
        "frequency": "daily",
        "initial_cash": 500_000.0,
        "data_provider": "mock",
        "strategy_params": {"short_window": 5, "long_window": 20, "target_percent": 0.9},
    }
    resp = client.post("/api/backtests/runs", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "run_id" in data
    assert "report" in data
    assert "metrics" in data["report"]

    run_id = data["run_id"]
    fetched = client.get(f"/api/backtests/runs/{run_id}")
    assert fetched.status_code == 200
    assert fetched.json()["run_id"] == run_id
