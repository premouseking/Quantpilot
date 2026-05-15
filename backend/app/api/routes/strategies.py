"""策略模板清单、详情、导入导出、可见性与版本对比。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from app.storage.run_store import get_run_store
from app.strategy.registry import get_template, get_template_source_code, list_templates
from app.strategy.user_store import (
    _CATEGORIES,
    _VISIBILITY_DESCRIPTIONS,
    _VISIBILITY_VALUES,
    add_comment,
    delete_comment,
    delete_user_strategy,
    export_strategy,
    fork_strategy,
    get_strategy_version,
    get_user_strategy,
    import_strategy,
    list_all_tags,
    list_category_options,
    list_comments,
    list_public_strategies,
    list_strategy_versions,
    restore_strategy_version,
    save_user_strategy,
    set_visibility,
    update_strategy_tags,
)

router = APIRouter(prefix="/strategies", tags=["strategies"])


class SaveUserStrategyRequest(BaseModel):
    id: str = Field(min_length=3, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    code: str = Field(min_length=1)
    params_schema: dict[str, Any] = Field(default_factory=dict)
    overwrite: bool = False
    version_note: str = Field(default="", max_length=200)
    visibility: str = Field(default="private")
    tags: list[str] = Field(default_factory=list, max_length=10)
    category: str = Field(default="custom")
    forked_from: str | None = None


class RestoreStrategyVersionRequest(BaseModel):
    version_note: str = Field(default="", max_length=200)


class ImportStrategyRequest(BaseModel):
    payload: dict[str, Any]
    overwrite: bool = False


class SetVisibilityRequest(BaseModel):
    visibility: str = Field(min_length=1, max_length=20)


class UpdateTagsRequest(BaseModel):
    tags: list[str] = Field(default_factory=list, max_length=10)
    category: str = Field(default="custom")


class ForkStrategyRequest(BaseModel):
    new_id: str = Field(min_length=3, max_length=64)
    new_title: str = Field(default="", max_length=120)


class AddCommentRequest(BaseModel):
    author: str = Field(default="anonymous", max_length=60)
    content: str = Field(min_length=1, max_length=500)


def _template_to_dict(template: Any, *, include_code: bool = False) -> dict[str, Any]:
    payload = {
        "id": template.id,
        "title": template.title,
        "description": template.description,
        "params_schema": template.params_schema,
        "source": template.source,
        "readonly": template.readonly,
        "visibility": getattr(template, "visibility", "private"),
        "tags": getattr(template, "tags", []),
        "category": getattr(template, "category", "custom"),
        "forked_from": getattr(template, "forked_from", None),
        "forked_at": getattr(template, "forked_at", None),
        "created_at": template.created_at,
        "updated_at": template.updated_at,
        "current_version": template.current_version,
        "version_count": template.version_count,
    }
    if include_code:
        payload["code"] = get_template_source_code(template.id)
    return payload


@router.get("/templates")
def list_strategy_templates() -> dict[str, Any]:
    return {"templates": [_template_to_dict(t) for t in list_templates()]}


@router.get("/templates/{template_id}")
def get_strategy_template(template_id: str) -> dict[str, Any]:
    return _template_to_dict(get_template(template_id), include_code=True)


@router.post("/user")
def save_user_strategy_template(request: SaveUserStrategyRequest) -> dict[str, Any]:
    record = save_user_strategy(
        strategy_id=request.id,
        title=request.title,
        description=request.description,
        code=request.code,
        params_schema=request.params_schema,
        overwrite=request.overwrite,
        version_note=request.version_note,
        visibility=request.visibility,
        tags=request.tags,
        category=request.category,
        forked_from=request.forked_from,
    )
    return _user_strategy_to_dict(record)


def _user_strategy_to_dict(record: Any) -> dict[str, Any]:
    return {
        "id": record.id,
        "title": record.title,
        "description": record.description,
        "params_schema": record.params_schema,
        "source": record.source,
        "readonly": record.readonly,
        "visibility": record.visibility,
        "tags": record.tags,
        "category": record.category,
        "forked_from": record.forked_from,
        "forked_at": record.forked_at,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "current_version": record.current_version,
        "version_count": record.version_count,
    }


@router.get("/user/{strategy_id}")
def get_user_strategy_template(strategy_id: str) -> dict[str, Any]:
    record = get_user_strategy(strategy_id)
    code = record.code_path.read_text(encoding="utf-8")
    return {
        **_user_strategy_to_dict(record),
        "code": code,
    }


@router.get("/user/{strategy_id}/versions")
def list_user_strategy_versions(strategy_id: str) -> dict[str, Any]:
    versions = list_strategy_versions(strategy_id)
    return {
        "versions": [
            {
                "version_id": version.version_id,
                "strategy_id": version.strategy_id,
                "title": version.title,
                "description": version.description,
                "params_schema": version.params_schema,
                "created_at": version.created_at,
                "note": version.note,
            }
            for version in versions
        ]
    }


@router.get("/user/{strategy_id}/versions/{version_id}")
def get_user_strategy_version(strategy_id: str, version_id: str) -> dict[str, Any]:
    version = get_strategy_version(strategy_id, version_id)
    return {
        "version_id": version.version_id,
        "strategy_id": version.strategy_id,
        "title": version.title,
        "description": version.description,
        "params_schema": version.params_schema,
        "created_at": version.created_at,
        "note": version.note,
        "code": version.code_path.read_text(encoding="utf-8"),
    }


@router.post("/user/{strategy_id}/versions/{version_id}/restore")
def restore_user_strategy_version(
    strategy_id: str,
    version_id: str,
    request: RestoreStrategyVersionRequest,
) -> dict[str, Any]:
    record = restore_strategy_version(
        strategy_id,
        version_id,
        version_note=request.version_note,
    )
    return _user_strategy_to_dict(record)


@router.delete("/user/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_strategy_template(strategy_id: str) -> Response:
    delete_user_strategy(strategy_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 策略导入导出 ──────────────────────────────────────────────


@router.post("/export")
def export_strategy_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    strategy_id = payload.get("strategy_id", "")
    return export_strategy(strategy_id)


@router.post("/import")
def import_strategy_endpoint(request: ImportStrategyRequest) -> dict[str, Any]:
    record = import_strategy(request.payload, overwrite=request.overwrite)
    return _user_strategy_to_dict(record)


# ── 可见性管理 ────────────────────────────────────────────────


@router.get("/visibility-options")
def get_visibility_options() -> dict[str, Any]:
    return {
        "values": sorted(_VISIBILITY_VALUES),
        "descriptions": _VISIBILITY_DESCRIPTIONS,
    }


@router.put("/user/{strategy_id}/visibility")
def set_strategy_visibility(strategy_id: str, request: SetVisibilityRequest) -> dict[str, Any]:
    record = set_visibility(strategy_id, request.visibility)
    return _user_strategy_to_dict(record)


# ── 版本对比 ──────────────────────────────────────────────────


@router.get("/user/{strategy_id}/compare")
def compare_strategy_versions(strategy_id: str) -> dict[str, Any]:
    """对比同一策略不同版本的已记录回测表现。"""
    store = get_run_store()
    all_runs = store.list_runs(limit=200)
    matched_runs: list[dict[str, Any]] = []
    for run in all_runs:
        config = run.get("config") or {}
        if config.get("template_id") == strategy_id:
            matched_runs.append(run)
    if not matched_runs:
        return {"strategy_id": strategy_id, "comparisons": [], "message": "尚未找到该策略的回测记录，请先用各版本执行回测后再对比。"}

    version_groups: dict[str, list[dict[str, Any]]] = {}
    for run in matched_runs:
        version = (run.get("config") or {}).get("strategy_version") or "未标记版本"
        if version not in version_groups:
            version_groups[version] = []
        version_groups[version].append(run)

    comparisons: list[dict[str, Any]] = []
    for version, runs in version_groups.items():
        best = max(runs, key=lambda r: (r.get("metrics") or {}).get("cumulative_return", -999))
        metrics = best.get("metrics") or {}
        comparisons.append(
            {
                "version_id": version,
                "run_count": len(runs),
                "best_run_id": best.get("run_id"),
                "best_created_at": best.get("created_at"),
                "cumulative_return": metrics.get("cumulative_return"),
                "annualized_return": metrics.get("annualized_return"),
                "sharpe_ratio": metrics.get("sharpe_ratio"),
                "max_drawdown": metrics.get("max_drawdown"),
                "win_rate": metrics.get("win_rate"),
                "trade_count": metrics.get("trade_count"),
            }
        )

    comparisons.sort(
        key=lambda c: c.get("cumulative_return") or -999,
        reverse=True,
    )
    return {"strategy_id": strategy_id, "comparisons": comparisons}


# ── 快速验证 ──────────────────────────────────────────────────


class ValidateCodeRequest(BaseModel):
    code: str = Field(min_length=1)


@router.post("/validate")
def validate_strategy_code(request: ValidateCodeRequest) -> dict[str, Any]:
    """编译策略代码并用 Mock 数据执行迷你回测，快速反馈错误。"""
    import ast as ast_module
    import sys as sys_module
    from types import ModuleType

    errors: list[dict[str, Any]] = []
    # 1. 语法检查
    try:
        tree = ast_module.parse(request.code)
    except SyntaxError as exc:
        return {
            "valid": False,
            "errors": [{"type": "syntax", "message": f"Line {exc.lineno}: {exc.msg}"}],
            "warnings": [],
        }

    # 2. 检查 Strategy 子类
    strategy_classes = [
        node
        for node in ast_module.walk(tree)
        if isinstance(node, ast_module.ClassDef)
        and any(
            (isinstance(base, ast_module.Name) and base.id == "Strategy")
            or (isinstance(base, ast_module.Attribute) and base.attr == "Strategy")
            for base in node.bases
        )
    ]
    if not strategy_classes:
        errors.append({"type": "structure", "message": "代码中必须定义一个 Strategy 子类"})

    on_bar_found = any(
        isinstance(member, (ast_module.FunctionDef, ast_module.AsyncFunctionDef))
        and member.name == "on_bar"
        for node in strategy_classes
        for member in node.body
    )
    if not on_bar_found:
        errors.append({"type": "structure", "message": "Strategy 子类必须实现 on_bar 方法"})

    if errors:
        return {"valid": False, "errors": errors, "warnings": []}

    # 3. 运行时验证：用极小数据集做一次迷你回测
    try:
        import importlib.util

        module_name = f"app.strategy_validate_{id(request.code)}"
        spec = importlib.util.spec_from_loader(module_name, loader=None)
        if spec is None:
            spec = importlib.util.spec_from_file_location(
                module_name,
                "<validate>",
                submodule_search_locations=[],
            )
        module = importlib.util.module_from_spec(spec)
        sys_module.modules[module_name] = module
        compile(request.code, "<validate>", "exec")
        exec(request.code, module.__dict__)

        strategy_cls = None
        for value in vars(module).values():
            if isinstance(value, type) and hasattr(value, "on_bar") and value.__name__ != "Strategy":
                from app.strategy.base import Strategy
                try:
                    if issubclass(value, Strategy) and value is not Strategy:
                        strategy_cls = value
                        break
                except TypeError:
                    continue

        if strategy_cls is None:
            return {
                "valid": False,
                "errors": [{"type": "runtime", "message": "无法找到有效的 Strategy 子类"}],
                "warnings": [],
            }

        # Mini backtest
        from datetime import datetime as dt
        from app.data.mock_provider import MockDataProvider
        from app.data.models import Frequency
        from app.engine.backtest import BacktestConfig, run_backtest
        from app.engine.costs import CostModel

        provider = MockDataProvider()
        strategy = strategy_cls()
        config = BacktestConfig(
            symbol="MOCK001",
            start=dt(2024, 1, 1),
            end=dt(2024, 1, 31),
            frequency=Frequency.DAILY,
            initial_cash=1_000_000.0,
            strategy_params={},
        )
        result = run_backtest(config, strategy, provider)
        warnings: list[dict[str, Any]] = []
        if len(result.orders) == 0:
            warnings.append({"type": "inactive", "message": "策略在测试期间未产生任何订单，建议检查入场逻辑"})

        return {
            "valid": True,
            "errors": [],
            "warnings": warnings,
            "stats": {
                "bars_processed": len(result.equity_curve),
                "orders_generated": len(result.orders),
                "final_value": result.final_value,
                "trades": len(result.fills),
            },
        }
    except Exception as exc:
        return {
            "valid": False,
            "errors": [{"type": "runtime", "message": f"{type(exc).__name__}: {exc}"}],
            "warnings": [],
        }


# ── 标签与分类 ────────────────────────────────────────────────


@router.get("/tags")
def get_all_tags() -> dict[str, Any]:
    return {"tags": list_all_tags()}


@router.get("/categories")
def get_categories() -> dict[str, Any]:
    return {"categories": list_category_options()}


@router.put("/user/{strategy_id}/tags")
def set_strategy_tags(strategy_id: str, request: UpdateTagsRequest) -> dict[str, Any]:
    record = update_strategy_tags(
        strategy_id,
        tags=request.tags,
        category=request.category,
    )
    return _user_strategy_to_dict(record)


# ── Fork 策略 ──────────────────────────────────────────────────


@router.post("/marketplace/{strategy_id}/fork")
def fork_marketplace_strategy(strategy_id: str, request: ForkStrategyRequest) -> dict[str, Any]:
    new_title = request.new_title.strip() or ""
    record = fork_strategy(
        strategy_id,
        new_id=request.new_id,
        new_title=new_title,
    )
    return _user_strategy_to_dict(record)


# ── 评论 ──────────────────────────────────────────────────────


@router.get("/marketplace/{strategy_id}/comments")
def get_strategy_comments(strategy_id: str) -> dict[str, Any]:
    comments = list_comments(strategy_id)
    return {
        "comments": [
            {
                "id": c.id,
                "strategy_id": c.strategy_id,
                "author": c.author,
                "content": c.content,
                "created_at": c.created_at,
            }
            for c in comments
        ]
    }


@router.post("/marketplace/{strategy_id}/comments")
def add_strategy_comment(strategy_id: str, request: AddCommentRequest) -> dict[str, Any]:
    comment = add_comment(
        strategy_id,
        author=request.author,
        content=request.content,
    )
    return {
        "id": comment.id,
        "strategy_id": comment.strategy_id,
        "author": comment.author,
        "content": comment.content,
        "created_at": comment.created_at,
    }


@router.delete("/marketplace/{strategy_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_strategy_comment(strategy_id: str, comment_id: str) -> Response:
    delete_comment(strategy_id, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 策略市场 ──────────────────────────────────────────────────


@router.get("/marketplace")
def list_marketplace_strategies() -> dict[str, Any]:
    records = list_public_strategies()
    return {
        "strategies": [
            {
                **_user_strategy_to_dict(record),
                "code": record.code_path.read_text(encoding="utf-8"),
            }
            for record in records
        ]
    }
