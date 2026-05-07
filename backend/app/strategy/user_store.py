"""用户策略文件存储与加载。

MVP 范围：本地可信用户可在前端保存 Python 策略代码，后端写入
``RuntimeConfig.strategies_dir``。多用户阶段接入沙箱、资源限制与权限模型前，
不要将该能力暴露到不可信环境。
"""

from __future__ import annotations

import ast
import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any

from app.core.config import get_runtime_config
from app.core.errors import InvalidParamsError, NotFoundError, StrategyError
from app.strategy.base import Strategy

_ID_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")
_BUILTIN_IDS = {"dual_ma", "rsi_reversion", "macd_cross"}


@dataclass(frozen=True)
class UserStrategyRecord:
    id: str
    title: str
    description: str
    params_schema: dict[str, Any]
    source: str
    readonly: bool
    created_at: str | None
    updated_at: str | None
    current_version: str | None
    version_count: int
    code_path: Path
    metadata_path: Path


@dataclass(frozen=True)
class StrategyVersionRecord:
    strategy_id: str
    version_id: str
    title: str
    description: str
    params_schema: dict[str, Any]
    code_path: Path
    created_at: str
    note: str


def _strategies_dir() -> Path:
    config = get_runtime_config()
    config.strategies_dir.mkdir(parents=True, exist_ok=True)
    return config.strategies_dir


def _validate_strategy_id(strategy_id: str) -> str:
    normalized = strategy_id.strip()
    if not _ID_RE.fullmatch(normalized):
        raise InvalidParamsError(
            "strategy id must match ^[a-z][a-z0-9_]{2,63}$",
            strategy_id=strategy_id,
        )
    if normalized in _BUILTIN_IDS:
        raise InvalidParamsError(
            "strategy id conflicts with builtin template",
            strategy_id=normalized,
        )
    return normalized


def _validate_params_schema(schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(schema, dict):
        raise InvalidParamsError("params_schema must be an object")
    if schema.get("type", "object") != "object":
        raise InvalidParamsError("params_schema.type must be object")
    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        raise InvalidParamsError("params_schema.properties must be an object")
    required = schema.get("required", [])
    if not isinstance(required, list):
        raise InvalidParamsError("params_schema.required must be a list")
    for key, prop in properties.items():
        if not isinstance(key, str) or not key:
            raise InvalidParamsError("params_schema property keys must be non-empty strings")
        if not isinstance(prop, dict):
            raise InvalidParamsError("params_schema property values must be objects", key=key)
        prop_type = prop.get("type", "number")
        if prop_type not in {"integer", "number"}:
            raise InvalidParamsError(
                "only integer and number strategy params are supported in MVP",
                key=key,
                param_type=prop_type,
            )
    return {
        "type": "object",
        "title": schema.get("title") or "用户策略",
        "properties": properties,
        "required": required,
    }


def _paths(strategy_id: str) -> tuple[Path, Path]:
    base = _strategies_dir() / strategy_id
    return base.with_suffix(".json"), base.with_suffix(".py")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _version_code_path(strategy_id: str, version_id: str) -> Path:
    return _strategies_dir() / f"{strategy_id}.{version_id}.py"


def _extract_version_number(version_id: str) -> int:
    if not version_id.startswith("v"):
        return 0
    try:
        return int(version_id[1:])
    except ValueError:
        return 0


def _fallback_timestamp(metadata_path: Path, code_path: Path) -> str:
    timestamp = metadata_path.stat().st_mtime if metadata_path.exists() else code_path.stat().st_mtime
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def _ensure_legacy_versions(
    strategy_id: str,
    payload: dict[str, Any],
    *,
    metadata_path: Path,
    code_path: Path,
) -> list[dict[str, Any]]:
    versions = payload.get("versions")
    if isinstance(versions, list) and versions:
        return versions
    if not code_path.exists():
        return []

    legacy_version_id = "v1"
    legacy_code_path = _version_code_path(strategy_id, legacy_version_id)
    if not legacy_code_path.exists():
        legacy_code_path.write_text(code_path.read_text(encoding="utf-8"), encoding="utf-8")

    return [
        {
            "version_id": legacy_version_id,
            "title": payload["title"],
            "description": payload.get("description", ""),
            "params_schema": payload["params_schema"],
            "code_file": legacy_code_path.name,
            "created_at": payload.get("updated_at")
            or payload.get("created_at")
            or _fallback_timestamp(metadata_path, code_path),
            "note": payload.get("version_note") or "首次纳入版本历史",
        }
    ]


def _version_record_from_payload(strategy_id: str, payload: dict[str, Any]) -> StrategyVersionRecord:
    return StrategyVersionRecord(
        strategy_id=strategy_id,
        version_id=payload["version_id"],
        title=payload["title"],
        description=payload.get("description", ""),
        params_schema=payload["params_schema"],
        code_path=_strategies_dir() / payload["code_file"],
        created_at=payload["created_at"],
        note=payload.get("note", ""),
    )


def _record_from_payload(
    payload: dict[str, Any], *, metadata_path: Path, code_path: Path
) -> UserStrategyRecord:
    fallback_timestamp = _fallback_timestamp(metadata_path, code_path)
    versions = payload.get("versions")
    version_count = len(versions) if isinstance(versions, list) else 0
    return UserStrategyRecord(
        id=payload["id"],
        title=payload["title"],
        description=payload.get("description", ""),
        params_schema=payload["params_schema"],
        source=payload.get("source", "user"),
        readonly=bool(payload.get("readonly", False)),
        created_at=payload.get("created_at") or fallback_timestamp,
        updated_at=payload.get("updated_at") or fallback_timestamp,
        current_version=payload.get("current_version"),
        version_count=version_count,
        code_path=code_path,
        metadata_path=metadata_path,
    )


def _load_module(strategy_id: str, code_path: Path) -> ModuleType:
    module_name = f"app.user_strategies.{strategy_id}"
    spec = importlib.util.spec_from_file_location(module_name, code_path)
    if spec is None or spec.loader is None:
        raise StrategyError("Failed to load strategy module", strategy_id=strategy_id)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _find_strategy_class(module: ModuleType) -> type[Strategy]:
    for value in vars(module).values():
        if isinstance(value, type) and issubclass(value, Strategy) and value is not Strategy:
            return value
    raise StrategyError("Strategy code must define a Strategy subclass")


def instantiate_user_strategy(strategy_id: str) -> Strategy:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists() or not code_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    try:
        module = _load_module(strategy_id, code_path)
        strategy_cls = _find_strategy_class(module)
        strategy = strategy_cls()
    except StrategyError:
        raise
    except Exception as exc:
        raise StrategyError(
            f"Failed to instantiate user strategy: {exc}",
            strategy_id=strategy_id,
        ) from exc
    strategy.name = strategy_id
    return strategy


def _inherits_strategy(base: ast.expr) -> bool:
    if isinstance(base, ast.Name):
        return base.id == "Strategy"
    if isinstance(base, ast.Attribute):
        return base.attr == "Strategy"
    return False


def _defines_method(node: ast.ClassDef, method_name: str) -> bool:
    return any(
        isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)) and member.name == method_name
        for member in node.body
    )


def _validate_user_strategy_code(strategy_id: str, code: str) -> None:
    try:
        module = ast.parse(code, filename=f"{strategy_id}.py")
    except SyntaxError as exc:
        raise InvalidParamsError(
            f"strategy code syntax error: {exc.msg}",
            line=exc.lineno,
            offset=exc.offset,
        ) from exc

    strategy_classes = [
        node
        for node in module.body
        if isinstance(node, ast.ClassDef) and any(_inherits_strategy(base) for base in node.bases)
    ]
    if not strategy_classes:
        raise StrategyError(
            "Strategy code must define a Strategy subclass",
            strategy_id=strategy_id,
        )
    if not any(_defines_method(node, "on_bar") for node in strategy_classes):
        raise StrategyError(
            "Strategy subclass must implement on_bar",
            strategy_id=strategy_id,
        )


def save_user_strategy(
    *,
    strategy_id: str,
    title: str,
    description: str,
    code: str,
    params_schema: dict[str, Any],
    overwrite: bool = False,
    version_note: str = "",
) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    title = title.strip()
    description = description.strip()
    if not title:
        raise InvalidParamsError("title is required")
    if not code.strip():
        raise InvalidParamsError("code is required")

    schema = _validate_params_schema(params_schema)
    metadata_path, code_path = _paths(strategy_id)
    if not overwrite and (metadata_path.exists() or code_path.exists()):
        raise InvalidParamsError("strategy already exists", strategy_id=strategy_id)

    _validate_user_strategy_code(strategy_id, code)
    previous_payload: dict[str, Any] = {}
    if overwrite and metadata_path.exists():
        try:
            previous_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            previous_payload = {}

    version_note = version_note.strip()
    now = _now_iso()
    previous_versions = (
        _ensure_legacy_versions(
            strategy_id,
            previous_payload,
            metadata_path=metadata_path,
            code_path=code_path,
        )
        if previous_payload
        else []
    )
    next_version_number = max((_extract_version_number(v["version_id"]) for v in previous_versions), default=0) + 1
    current_version = f"v{next_version_number}"
    version_snapshot = {
        "version_id": current_version,
        "title": title,
        "description": description,
        "params_schema": schema,
        "code_file": _version_code_path(strategy_id, current_version).name,
        "created_at": now,
        "note": version_note,
    }

    code_path.write_text(code, encoding="utf-8")
    _version_code_path(strategy_id, current_version).write_text(code, encoding="utf-8")

    payload = {
        "id": strategy_id,
        "title": title,
        "description": description,
        "params_schema": schema,
        "source": "user",
        "readonly": False,
        "created_at": previous_payload.get("created_at") or now,
        "updated_at": now,
        "current_version": current_version,
        "version_note": version_note,
        "versions": [*previous_versions, version_snapshot],
        "code_file": code_path.name,
    }
    metadata_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return _record_from_payload(payload, metadata_path=metadata_path, code_path=code_path)


def get_user_strategy(strategy_id: str) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists() or not code_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not data.get("versions"):
        data["versions"] = _ensure_legacy_versions(
            strategy_id,
            data,
            metadata_path=metadata_path,
            code_path=code_path,
        )
        data["current_version"] = data["versions"][-1]["version_id"] if data["versions"] else None
    return _record_from_payload(data, metadata_path=metadata_path, code_path=code_path)


def list_user_strategies() -> list[UserStrategyRecord]:
    records: list[UserStrategyRecord] = []
    for metadata_path in sorted(_strategies_dir().glob("*.json")):
        strategy_id = metadata_path.stem
        try:
            records.append(get_user_strategy(strategy_id))
        except Exception:
            continue
    return records


def list_strategy_versions(strategy_id: str) -> list[StrategyVersionRecord]:
    record = get_user_strategy(strategy_id)
    payload = json.loads(record.metadata_path.read_text(encoding="utf-8"))
    versions = payload.get("versions") or []
    return [
        _version_record_from_payload(strategy_id, version_payload)
        for version_payload in sorted(
            versions,
            key=lambda item: _extract_version_number(item["version_id"]),
            reverse=True,
        )
    ]


def get_strategy_version(strategy_id: str, version_id: str) -> StrategyVersionRecord:
    for version in list_strategy_versions(strategy_id):
        if version.version_id == version_id:
            return version
    raise NotFoundError("Strategy version not found", strategy_id=strategy_id, version_id=version_id)


def delete_user_strategy(strategy_id: str) -> None:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists() or not code_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    for version_code_path in _strategies_dir().glob(f"{strategy_id}.v*.py"):
        version_code_path.unlink(missing_ok=True)
    code_path.unlink(missing_ok=True)
    metadata_path.unlink(missing_ok=True)
