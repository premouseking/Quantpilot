"""回测报告 JSON 持久化与加载。

每轮运行落盘为 ``<runs_dir>/<run_id>.json``。MVP 采用单文件方案；
若需按标签检索、多用户并发，可升级为 SQLite/PostgreSQL。
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_runtime_config
from app.core.errors import NotFoundError


class RunStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = Path(base_dir) if base_dir else get_runtime_config().runs_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path(self, run_id: str) -> Path:
        if not run_id or "/" in run_id or "\\" in run_id:
            raise NotFoundError(f"Invalid run id: {run_id!r}")
        return self.base_dir / f"{run_id}.json"

    def create_run_id(self) -> str:
        return f"bt_{uuid.uuid4().hex[:12]}"

    def save(self, run_id: str, report: dict[str, Any]) -> dict[str, Any]:
        envelope = {
            "run_id": run_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "report": report,
        }
        path = self._path(run_id)
        with self._lock:
            with path.open("w", encoding="utf-8") as f:
                json.dump(envelope, f, ensure_ascii=False, indent=2)
        return envelope

    def load(self, run_id: str) -> dict[str, Any]:
        path = self._path(run_id)
        if not path.exists():
            raise NotFoundError(f"Backtest run {run_id} not found")
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        entries: list[tuple[float, dict[str, Any]]] = []
        for path in sorted(self.base_dir.glob("bt_*.json")):
            try:
                with path.open("r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue
            summary = {
                "run_id": data.get("run_id"),
                "created_at": data.get("created_at"),
                "summary": (data.get("report") or {}).get("summary"),
                "config": (data.get("report") or {}).get("config"),
                "metrics": (data.get("report") or {}).get("metrics"),
            }
            entries.append((path.stat().st_mtime, summary))
        entries.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in entries[:limit]]


_run_store: RunStore | None = None


def get_run_store() -> RunStore:
    global _run_store
    if _run_store is None:
        _run_store = RunStore()
    return _run_store
