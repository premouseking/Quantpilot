"""用户策略文件存储与加载。

MVP 范围：本地可信用户可在前端保存 Python 策略代码，后端写入
``RuntimeConfig.strategies_dir``。多用户阶段接入沙箱、资源限制与权限模型前，
不要将该能力暴露到不可信环境。
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from dataclasses import dataclass
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
    code_path: Path
    metadata_path: Path


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


def _validate_user_strategy_code(strategy_id: str, code_path: Path) -> None:
    try:
        module = _load_module(strategy_id, code_path)
        strategy_cls = _find_strategy_class(module)
        strategy_cls()
    except StrategyError:
        raise
    except Exception as exc:
        raise StrategyError(
            f"Failed to instantiate user strategy: {exc}",
            strategy_id=strategy_id,
        ) from exc


def save_user_strategy(
    *,
    strategy_id: str,
    title: str,
    description: str,
    code: str,
    params_schema: dict[str, Any],
    overwrite: bool = False,
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

    try:
        compile(code, str(code_path), "exec")
    except SyntaxError as exc:
        raise InvalidParamsError(
            f"strategy code syntax error: {exc.msg}",
            line=exc.lineno,
            offset=exc.offset,
        ) from exc

    previous_code = code_path.read_text(encoding="utf-8") if code_path.exists() else None
    code_path.write_text(code, encoding="utf-8")
    try:
        _validate_user_strategy_code(strategy_id, code_path)
    except Exception:
        if previous_code is None:
            code_path.unlink(missing_ok=True)
        else:
            code_path.write_text(previous_code, encoding="utf-8")
        raise

    payload = {
        "id": strategy_id,
        "title": title,
        "description": description,
        "params_schema": schema,
        "code_file": code_path.name,
    }
    metadata_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return UserStrategyRecord(
        id=strategy_id,
        title=title,
        description=description,
        params_schema=schema,
        code_path=code_path,
        metadata_path=metadata_path,
    )


def get_user_strategy(strategy_id: str) -> UserStrategyRecord:
    strategy_id = _validate_strategy_id(strategy_id)
    metadata_path, code_path = _paths(strategy_id)
    if not metadata_path.exists() or not code_path.exists():
        raise NotFoundError("User strategy not found", strategy_id=strategy_id)
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    return UserStrategyRecord(
        id=data["id"],
        title=data["title"],
        description=data.get("description", ""),
        params_schema=data["params_schema"],
        code_path=code_path,
        metadata_path=metadata_path,
    )


def list_user_strategies() -> list[UserStrategyRecord]:
    records: list[UserStrategyRecord] = []
    for metadata_path in sorted(_strategies_dir().glob("*.json")):
        strategy_id = metadata_path.stem
        try:
            records.append(get_user_strategy(strategy_id))
        except Exception:
            continue
    return records
