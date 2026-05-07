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
    templates = resp.json()["templates"]
    ids = [t["id"] for t in templates]
    assert "dual_ma" in ids
    assert "rsi_reversion" in ids
    assert "macd_cross" in ids
    dual_ma = next(t for t in templates if t["id"] == "dual_ma")
    assert dual_ma["source"] == "builtin"
    assert dual_ma["readonly"] is True


def test_strategy_template_detail_returns_source_code() -> None:
    client = _client()

    dual_ma = client.get("/api/strategies/templates/dual_ma")
    assert dual_ma.status_code == 200
    assert "def on_bar" in dual_ma.json()["code"]
    assert "DualMovingAverageStrategy" in dual_ma.json()["code"]

    rsi = client.get("/api/strategies/templates/rsi_reversion")
    assert rsi.status_code == 200
    assert "RsiReversionStrategy" in rsi.json()["code"]

    macd = client.get("/api/strategies/templates/macd_cross")
    assert macd.status_code == 200
    assert "MacdCrossStrategy" in macd.json()["code"]


def test_save_user_strategy_template() -> None:
    client = _client()
    payload = {
        "id": "api_hold_strategy",
        "title": "API 持有策略",
        "description": "预热后买入",
        "code": (
            "from app.strategy.base import Strategy, StrategyContext\n\n"
            "class ApiHoldStrategy(Strategy):\n"
            "    def initialize(self, params):\n"
            "        self.done = False\n"
            "    def on_bar(self, ctx: StrategyContext):\n"
            "        if not self.done:\n"
            "            ctx.order_target_percent(float(ctx.params.get('target_percent', 0.5)))\n"
            "            self.done = True\n"
        ),
        "params_schema": {
            "type": "object",
            "title": "API 持有策略",
            "properties": {
                "target_percent": {
                    "type": "number",
                    "title": "目标仓位",
                    "minimum": 0.01,
                    "maximum": 1,
                    "default": 0.5,
                }
            },
            "required": ["target_percent"],
        },
        "version_note": "初始版本",
    }

    resp = client.post("/api/strategies/user", json=payload)
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == "api_hold_strategy"
    assert resp.json()["source"] == "user"
    assert resp.json()["readonly"] is False
    assert resp.json()["updated_at"]
    assert resp.json()["current_version"] == "v1"
    assert resp.json()["version_count"] == 1

    templates = client.get("/api/strategies/templates")
    assert templates.status_code == 200
    template_list = templates.json()["templates"]
    ids = [t["id"] for t in template_list]
    assert "api_hold_strategy" in ids
    saved = next(t for t in template_list if t["id"] == "api_hold_strategy")
    assert saved["source"] == "user"
    assert saved["readonly"] is False
    assert saved["created_at"]
    assert saved["updated_at"]
    assert saved["current_version"] == "v1"
    assert saved["version_count"] == 1


def test_strategy_version_history_and_detail() -> None:
    client = _client()
    base_payload = {
        "id": "api_versioned_strategy",
        "title": "版本化策略",
        "description": "第一个版本",
        "code": (
            "from app.strategy.base import Strategy, StrategyContext\n\n"
            "class ApiVersionedStrategy(Strategy):\n"
            "    def on_bar(self, ctx: StrategyContext):\n"
            "        return None\n"
        ),
        "params_schema": {"type": "object", "properties": {}, "required": []},
        "version_note": "v1 初始化",
    }

    created = client.post("/api/strategies/user", json=base_payload)
    assert created.status_code == 200, created.text

    updated = client.post(
        "/api/strategies/user",
        json={
            **base_payload,
            "title": "版本化策略",
            "description": "第二个版本",
            "code": (
                "from app.strategy.base import Strategy, StrategyContext\n\n"
                "class ApiVersionedStrategy(Strategy):\n"
                "    def on_bar(self, ctx: StrategyContext):\n"
                "        ctx.order_target_percent(0.5)\n"
            ),
            "overwrite": True,
            "version_note": "加入目标仓位",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["current_version"] == "v2"
    assert updated.json()["version_count"] == 2

    versions = client.get("/api/strategies/user/api_versioned_strategy/versions")
    assert versions.status_code == 200, versions.text
    version_list = versions.json()["versions"]
    assert [item["version_id"] for item in version_list] == ["v2", "v1"]
    assert version_list[0]["note"] == "加入目标仓位"
    assert version_list[1]["note"] == "v1 初始化"

    version_detail = client.get("/api/strategies/user/api_versioned_strategy/versions/v1")
    assert version_detail.status_code == 200, version_detail.text
    assert version_detail.json()["version_id"] == "v1"
    assert "return None" in version_detail.json()["code"]


def test_delete_user_strategy_template() -> None:
    client = _client()
    payload = {
        "id": "api_delete_strategy",
        "title": "API 删除策略",
        "description": "测试删除",
        "code": (
            "from app.strategy.base import Strategy, StrategyContext\n\n"
            "class ApiDeleteStrategy(Strategy):\n"
            "    def on_bar(self, ctx: StrategyContext):\n"
            "        return None\n"
        ),
        "params_schema": {"type": "object", "properties": {}, "required": []},
    }

    created = client.post("/api/strategies/user", json=payload)
    assert created.status_code == 200, created.text

    deleted = client.delete("/api/strategies/user/api_delete_strategy")
    assert deleted.status_code == 204, deleted.text

    detail = client.get("/api/strategies/user/api_delete_strategy")
    assert detail.status_code == 404


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
