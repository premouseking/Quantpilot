"""Pytest 配置：每个用例隔离运行时目录与环境变量。"""

from __future__ import annotations

import os
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolate_runtime_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QUANTPILOT_PROFILE", "local")
    monkeypatch.setenv("QUANTPILOT_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("QUANTPILOT_RUNS_DIR", str(tmp_path / "data" / "runs"))
    monkeypatch.setenv("QUANTPILOT_MARKET_DIR", str(tmp_path / "data" / "market"))
    monkeypatch.setenv(
        "QUANTPILOT_STRATEGIES_DIR", str(tmp_path / "data" / "strategies")
    )

    from app.core import config as config_module
    from app.data import registry as data_registry_module
    from app.storage import run_store as run_store_module

    config_module.get_runtime_config.cache_clear()
    data_registry_module._registry = None  # noqa: SLF001
    run_store_module._run_store = None  # noqa: SLF001

    yield

    config_module.get_runtime_config.cache_clear()
    data_registry_module._registry = None  # noqa: SLF001
    run_store_module._run_store = None  # noqa: SLF001

    for key in (
        "QUANTPILOT_PROFILE",
        "QUANTPILOT_DATA_DIR",
        "QUANTPILOT_RUNS_DIR",
        "QUANTPILOT_MARKET_DIR",
        "QUANTPILOT_STRATEGIES_DIR",
    ):
        os.environ.pop(key, None)
