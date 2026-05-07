"""API 冒烟测试。"""

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
    names = resp.json()["providers"]
    assert "mock" in names
    assert "csv" in names
    assert "akshare" in names


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


def test_upload_market_csv_writes_and_reads() -> None:
    client = _client()
    csv_content = (
        b"timestamp,open,high,low,close,volume\n"
        b"2024-01-02,10.0,11.0,9.5,10.5,1000\n"
        b"2024-01-03,10.5,12.0,10.4,11.75,950\n"
    )
    resp = client.post(
        "/api/data/providers/csv/upload",
        data={"symbol": "UPLTEST", "frequency": "daily"},
        files={"file": ("upload.csv", csv_content, "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["symbol"] == "UPLTEST"
    assert data["frequency"] == "daily"
    assert data["row_count"] == 2

    bars = client.get(
        "/api/data/providers/csv/bars",
        params={
            "symbol": "UPLTEST",
            "start": "2024-01-01T00:00:00",
            "end": "2024-01-10T23:59:59",
            "frequency": "daily",
        },
    )
    assert bars.status_code == 200, bars.text
    assert bars.json()["count"] == 2
