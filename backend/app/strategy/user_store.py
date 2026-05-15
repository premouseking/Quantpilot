"""用户策略文件存储与加载。

MVP 范围：本地可信用户可在前端保存 Python 策略代码，后端写入
``RuntimeConfig.strategies_dir``。多用户阶段接入沙箱、资源限制与权限模型前，
不要将该能力暴露到不可信环境。

提供策略导入/导出、可见性管理与版本对比等策略管理功能。
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
_BUILTIN_IDS = {"dual_ma", "rsi_reversion", "macd_cross", "bollinger_breakout", "turtle_trading"}


@dataclass(frozen=True)
class UserStrategyRecord:
    id: str
    title: str
    description: str
    params_schema: dict[str, Any]
    source: str
    readonly: bool
    visibility: str
    tags: list[str]
    category: str
    forked_from: str | None
    forked_at: str | None
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


@dataclass(frozen=True)
class CommentRecord:
    id: str
    strategy_id: str
    author: str
    content: str
    created_at: str


_CATEGORIES = {
    "trend": "趋势跟踪",
    "reversal": "反转策略",
    "momentum": "动量策略",
    "mean_reversion": "均值回归",
    "arbitrage": "套利策略",
    "ml": "机器学习",
    "custom": "自定义",
}

_CATEGORY_VALUES = set(_CATEGORIES.keys())


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


def _extract_params_schema(code: str) -> dict[str, Any] | None:
    """从 Python 代码中的 PARAMS_SCHEMA 字面量提取参数 schema。"""
    try:
        module = ast.parse(code)
    except SyntaxError:
        return None

    for node in ast.walk(module):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "PARAMS_SCHEMA" for target in node.targets):
            continue
        try:
            value = ast.literal_eval(node.value)
        except Exception:
            return None
        return value if isinstance(value, dict) else None
    return None


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
        visibility=payload.get("visibility", "private"),
        tags=payload.get("tags") if isinstance(payload.get("tags"), list) else [],
        category=payload.get("category", "custom"),
        forked_from=payload.get("forked_from"),
        forked_at=payload.get("forked_at"),
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
    visibility: str = "private",
    tags: list[str] | None = None,
    category: str = "custom",
    forked_from: str | None = None,
) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    title = title.strip()
    description = description.strip()
    if not title:
        raise InvalidParamsError("title is required")
    if not code.strip():
        raise InvalidParamsError("code is required")

    schema = _validate_params_schema(_extract_params_schema(code) or params_schema)
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

    effective_visibility = visibility if not previous_payload else previous_payload.get("visibility", visibility)
    effective_tags = tags if tags is not None else previous_payload.get("tags", [])
    effective_category = category if not previous_payload else previous_payload.get("category", category)
    effective_forked_from = forked_from or previous_payload.get("forked_from")
    effective_forked_at = previous_payload.get("forked_at")
    if forked_from and not effective_forked_at:
        effective_forked_at = now
    payload = {
        "id": strategy_id,
        "title": title,
        "description": description,
        "params_schema": schema,
        "source": "user",
        "readonly": False,
        "visibility": effective_visibility,
        "tags": effective_tags,
        "category": effective_category,
        "forked_from": effective_forked_from,
        "forked_at": effective_forked_at,
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


def restore_strategy_version(
    strategy_id: str,
    version_id: str,
    *,
    version_note: str = "",
) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    target = get_strategy_version(strategy_id, version_id)
    code = target.code_path.read_text(encoding="utf-8")
    note = version_note.strip() or f"恢复自 {version_id}"
    return save_user_strategy(
        strategy_id=strategy_id,
        title=target.title,
        description=target.description,
        code=code,
        params_schema=target.params_schema,
        overwrite=True,
        version_note=note,
    )


EXPORT_FORMAT_VERSION = "1.1"
_VISIBILITY_VALUES = {"private", "public"}
_VISIBILITY_DESCRIPTIONS = {
    "private": "仅自己可见",
    "public": "在策略市场中公开，其他用户可以浏览、复制和使用",
}


def _validate_visibility(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in _VISIBILITY_VALUES:
        raise InvalidParamsError(
            f"visibility must be one of {sorted(_VISIBILITY_VALUES)}",
            visibility=value,
        )
    return normalized


def set_visibility(strategy_id: str, visibility: str) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    visibility = _validate_visibility(visibility)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    data["visibility"] = visibility
    metadata_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return _record_from_payload(data, metadata_path=metadata_path, code_path=code_path)


def export_strategy(strategy_id: str) -> dict[str, Any]:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    versions_payload: list[dict[str, Any]] = []
    for version in list_strategy_versions(strategy_id):
        version_code = version.code_path.read_text(encoding="utf-8")
        versions_payload.append(
            {
                "version_id": version.version_id,
                "title": version.title,
                "description": version.description,
                "params_schema": version.params_schema,
                "code": version_code,
                "created_at": version.created_at,
                "note": version.note,
            }
        )
    return {
        "format_version": EXPORT_FORMAT_VERSION,
        "exported_at": _now_iso(),
        "strategy": {
            "id": data["id"],
            "title": data["title"],
            "description": data.get("description", ""),
            "params_schema": data["params_schema"],
            "visibility": data.get("visibility", "private"),
            "tags": data.get("tags", []),
            "category": data.get("category", "custom"),
            "forked_from": data.get("forked_from"),
            "forked_at": data.get("forked_at"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
            "current_version": data.get("current_version"),
            "versions": versions_payload,
        },
    }


def import_strategy(payload: dict[str, Any], *, overwrite: bool = False) -> UserStrategyRecord:
    format_version = payload.get("format_version")
    if format_version not in {"1.0", "1.1"}:
        raise InvalidParamsError(
            f"Unsupported export format version: {format_version}",
            expected=EXPORT_FORMAT_VERSION,
        )
    strategy_data = payload.get("strategy")
    if not isinstance(strategy_data, dict):
        raise InvalidParamsError("export payload must contain a strategy object")
    strategy_id = _validate_strategy_id(strategy_data.get("id", ""))
    title = (strategy_data.get("title") or "").strip()
    if not title:
        raise InvalidParamsError("strategy title is required")
    description = (strategy_data.get("description") or "").strip()
    params_schema = strategy_data.get("params_schema") or {}
    if not isinstance(params_schema, dict):
        raise InvalidParamsError("params_schema must be an object")
    visibility = _validate_visibility(strategy_data.get("visibility", "private"))
    versions = strategy_data.get("versions")
    if not isinstance(versions, list) or len(versions) == 0:
        raise InvalidParamsError("strategy must include at least one version")
    current_code: str | None = None
    for version in versions:
        if not isinstance(version, dict):
            continue
        if version.get("version_id") == strategy_data.get("current_version"):
            current_code = version.get("code")
    if current_code is None:
        current_code = versions[-1].get("code", "")
    if not current_code or not current_code.strip():
        raise InvalidParamsError("current strategy code is required")
    metadata_path, code_path = _paths(strategy_id)
    if metadata_path.exists() and not overwrite:
        raise InvalidParamsError(
            "strategy already exists, use overwrite=true to replace",
            strategy_id=strategy_id,
        )
    import_params_schema = _validate_params_schema(
        _extract_params_schema(current_code) or params_schema
    )
    _validate_user_strategy_code(strategy_id, current_code)
    now = _now_iso()
    existing_payload: dict[str, Any] = {}
    existing_versions: list[dict[str, Any]] = []
    if overwrite and metadata_path.exists():
        existing_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        existing_versions = _ensure_legacy_versions(
            strategy_id,
            existing_payload,
            metadata_path=metadata_path,
            code_path=code_path,
        )
    import_version_records: list[dict[str, Any]] = []
    max_existing_version = max(
        (_extract_version_number(v["version_id"]) for v in existing_versions), default=0
    )
    for idx, version in enumerate(versions):
        version_code = version.get("code", "")
        if not version_code or not version_code.strip():
            continue
        imported_version_id = version.get("version_id", f"v{idx + 1}")
        next_version_number = max_existing_version + idx + 1
        new_version_id = f"v{next_version_number}"
        version_code_path = _version_code_path(strategy_id, new_version_id)
        version_code_path.write_text(version_code, encoding="utf-8")
        import_version_records.append(
            {
                "version_id": new_version_id,
                "title": version.get("title", title),
                "description": version.get("description", description),
                "params_schema": version.get("params_schema", import_params_schema),
                "code_file": version_code_path.name,
                "created_at": version.get("created_at", now),
                "note": version.get("note", f"导入自 {imported_version_id}"),
            }
        )
    code_path.write_text(current_code, encoding="utf-8")
    current_version = (
        import_version_records[-1]["version_id"] if import_version_records else "v1"
    )
    merged_versions = [*existing_versions, *import_version_records]
    imported_tags = strategy_data.get("tags") if isinstance(strategy_data.get("tags"), list) else []
    imported_category = strategy_data.get("category", "custom")
    payload_data = {
        "id": strategy_id,
        "title": title,
        "description": description,
        "params_schema": import_params_schema,
        "source": "user",
        "readonly": False,
        "visibility": visibility,
        "tags": imported_tags,
        "category": imported_category,
        "forked_from": strategy_data.get("forked_from"),
        "forked_at": strategy_data.get("forked_at"),
        "created_at": strategy_data.get("created_at") or now,
        "updated_at": now,
        "current_version": current_version,
        "version_note": f"已从文件导入（{len(import_version_records)} 个版本）",
        "versions": merged_versions,
        "code_file": code_path.name,
    }
    metadata_path.write_text(
        json.dumps(payload_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return _record_from_payload(payload_data, metadata_path=metadata_path, code_path=code_path)


def list_public_strategies() -> list[UserStrategyRecord]:
    records: list[UserStrategyRecord] = []
    for metadata_path in sorted(_strategies_dir().glob("*.json")):
        strategy_id = metadata_path.stem
        try:
            record = get_user_strategy(strategy_id)
            if record.visibility == "public":
                records.append(record)
        except Exception:
            continue
    return records


# ── 标签与分类 ────────────────────────────────────────────────


def list_all_tags() -> list[str]:
    tags: set[str] = set()
    for record in list_user_strategies():
        for tag in record.tags:
            if isinstance(tag, str) and tag.strip():
                tags.add(tag.strip())
    return sorted(tags)


def list_category_options() -> list[dict[str, str]]:
    return [{"value": key, "label": label} for key, label in _CATEGORIES.items()]


def update_strategy_tags(
    strategy_id: str, *, tags: list[str] | None = None, category: str | None = None
) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    if tags is not None:
        seen: set[str] = set()
        cleaned: list[str] = []
        for t in tags:
            if not isinstance(t, str):
                continue
            stripped = t.strip()
            if not stripped or stripped in seen:
                continue
            seen.add(stripped)
            cleaned.append(stripped)
        data["tags"] = cleaned[:10]
    if category is not None:
        if category not in _CATEGORY_VALUES:
            raise InvalidParamsError(
                f"category must be one of {sorted(_CATEGORY_VALUES)}",
                category=category,
            )
        data["category"] = category
    metadata_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return _record_from_payload(data, metadata_path=metadata_path, code_path=code_path)


# ── Fork 策略 ──────────────────────────────────────────────────


def fork_strategy(
    source_strategy_id: str,
    *,
    new_id: str,
    new_title: str,
) -> UserStrategyRecord:
    source = get_user_strategy(source_strategy_id)
    if source.visibility != "public":
        raise InvalidParamsError(
            "Only public strategies can be forked",
            strategy_id=source_strategy_id,
        )
    new_id = _validate_strategy_id(new_id)
    metadata_path, code_path = _paths(new_id)
    if metadata_path.exists():
        raise InvalidParamsError("strategy already exists", strategy_id=new_id)
    code = source.code_path.read_text(encoding="utf-8")
    new_title = new_title.strip() or f"{source.title} (Fork)"
    now = _now_iso()
    return save_user_strategy(
        strategy_id=new_id,
        title=new_title,
        description=source.description,
        code=code,
        params_schema=source.params_schema,
        visibility="private",
        tags=list(source.tags),
        category=source.category,
        forked_from=source_strategy_id,
        version_note=f"Fork 自 {source_strategy_id}",
    )


# ── 评论系统 ──────────────────────────────────────────────────

_COMMENT_ID_RE = re.compile(r"^cmt_[a-f0-9]{8}$")


def list_comments(strategy_id: str) -> list[CommentRecord]:
    record = get_user_strategy(strategy_id)
    data = json.loads(record.metadata_path.read_text(encoding="utf-8"))
    comments_payload = data.get("comments") or []
    if not isinstance(comments_payload, list):
        return []
    return [
        CommentRecord(
            id=c["id"],
            strategy_id=strategy_id,
            author=c.get("author", "anonymous"),
            content=c.get("content", ""),
            created_at=c.get("created_at", ""),
        )
        for c in comments_payload
        if isinstance(c, dict)
    ]


def add_comment(strategy_id: str, *, author: str, content: str) -> CommentRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    content = content.strip()
    if not content:
        raise InvalidParamsError("comment content is required")
    if len(content) > 500:
        raise InvalidParamsError("comment content must be under 500 characters")
    author = author.strip() or "anonymous"
    import secrets
    comment_id = f"cmt_{secrets.token_hex(4)}"
    now = _now_iso()
    comment_payload = {
        "id": comment_id,
        "author": author,
        "content": content,
        "created_at": now,
    }
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    comments = data.get("comments") or []
    if not isinstance(comments, list):
        comments = []
    comments.append(comment_payload)
    data["comments"] = comments
    metadata_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return CommentRecord(
        id=comment_id,
        strategy_id=strategy_id,
        author=author,
        content=content,
        created_at=now,
    )


def delete_comment(strategy_id: str, comment_id: str) -> None:
    if not _COMMENT_ID_RE.fullmatch(comment_id):
        raise InvalidParamsError("invalid comment id format", comment_id=comment_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    comments = data.get("comments") or []
    if not isinstance(comments, list):
        raise NotFoundError("Comment not found", comment_id=comment_id)
    filtered = [c for c in comments if isinstance(c, dict) and c.get("id") != comment_id]
    if len(filtered) == len(comments):
        raise NotFoundError("Comment not found", comment_id=comment_id)
    data["comments"] = filtered
    metadata_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def delete_user_strategy(strategy_id: str) -> None:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists() or not code_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    for version_code_path in _strategies_dir().glob(f"{strategy_id}.v*.py"):
        version_code_path.unlink(missing_ok=True)
    code_path.unlink(missing_ok=True)
    metadata_path.unlink(missing_ok=True)
