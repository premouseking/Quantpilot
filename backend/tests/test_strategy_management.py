"""策略管理功能测试：导入导出、可见性、版本对比、策略市场。"""

from __future__ import annotations

import json

import pytest

from app.core.errors import InvalidParamsError, NotFoundError
from app.strategy.user_store import (
    _VISIBILITY_VALUES,
    delete_user_strategy,
    export_strategy,
    get_user_strategy,
    import_strategy,
    list_public_strategies,
    list_user_strategies,
    save_user_strategy,
    set_visibility,
)


USER_STRATEGY_CODE = """
from app.strategy.base import Strategy, StrategyContext


class ManagementTestStrategy(Strategy):
    def initialize(self, params):
        self.target_percent = float(params.get("target_percent", 0.5))
        self.bar_count = 0

    def on_bar(self, ctx: StrategyContext):
        self.bar_count += 1
        if self.bar_count == 1:
            ctx.order_target_percent(self.target_percent)
"""

USER_PARAMS_SCHEMA = {
    "type": "object",
    "title": "管理测试策略",
    "properties": {
        "target_percent": {
            "type": "number",
            "title": "目标仓位",
            "minimum": 0.01,
            "maximum": 1,
            "default": 0.5,
        },
    },
    "required": ["target_percent"],
}


# ── 可见性管理 ────────────────────────────────────────────────


def test_new_strategy_defaults_to_private_visibility() -> None:
    save_user_strategy(
        strategy_id="visibility_default",
        title="可见性默认策略",
        description="默认可见性应为 private",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    record = get_user_strategy("visibility_default")
    assert record.visibility == "private"


def test_save_with_explicit_public_visibility() -> None:
    save_user_strategy(
        strategy_id="visibility_public",
        title="公开策略",
        description="创建时设为公开",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    record = get_user_strategy("visibility_public")
    assert record.visibility == "public"


def test_set_visibility_toggle() -> None:
    save_user_strategy(
        strategy_id="visibility_toggle",
        title="切换可见性",
        description="测试可见性切换",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="private",
    )
    record = set_visibility("visibility_toggle", "public")
    assert record.visibility == "public"

    record = set_visibility("visibility_toggle", "private")
    assert record.visibility == "private"


def test_set_visibility_rejects_invalid_value() -> None:
    save_user_strategy(
        strategy_id="visibility_bad",
        title="无效可见性测试",
        description="测试拒绝无效值",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    with pytest.raises(InvalidParamsError, match="visibility must be one of"):
        set_visibility("visibility_bad", "secret")


def test_set_visibility_on_nonexistent_strategy() -> None:
    with pytest.raises(NotFoundError):
        set_visibility("nonexistent_strategy", "public")


def test_overwrite_preserves_visibility() -> None:
    save_user_strategy(
        strategy_id="visibility_preserve",
        title="保持可见性",
        description="第一版",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    save_user_strategy(
        strategy_id="visibility_preserve",
        title="保持可见性更新",
        description="第二版",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        overwrite=True,
        version_note="更新",
    )
    record = get_user_strategy("visibility_preserve")
    assert record.visibility == "public"


# ── 策略导入导出 ──────────────────────────────────────────────


def test_export_strategy_contains_all_versions() -> None:
    v1_code = USER_STRATEGY_CODE.replace("0.5", "0.3")
    v2_code = USER_STRATEGY_CODE.replace("0.5", "0.7")
    save_user_strategy(
        strategy_id="export_test",
        title="导出测试",
        description="第一版",
        code=v1_code,
        params_schema=USER_PARAMS_SCHEMA,
        version_note="v1",
    )
    save_user_strategy(
        strategy_id="export_test",
        title="导出测试",
        description="第二版",
        code=v2_code,
        params_schema=USER_PARAMS_SCHEMA,
        overwrite=True,
        version_note="v2",
    )

    exported = export_strategy("export_test")

    assert exported["format_version"] == "1.1"
    assert "exported_at" in exported
    strategy_data = exported["strategy"]
    assert strategy_data["id"] == "export_test"
    assert strategy_data["title"] == "导出测试"
    assert strategy_data["visibility"] == "private"
    versions = strategy_data["versions"]
    assert len(versions) >= 2
    version_codes = {v["code"] for v in versions}
    assert v1_code in version_codes
    assert v2_code in version_codes


def test_export_nonexistent_strategy_raises() -> None:
    with pytest.raises(NotFoundError):
        export_strategy("nonexistent_export")


def test_import_creates_new_strategy_from_export() -> None:
    save_user_strategy(
        strategy_id="import_source",
        title="导入源策略",
        description="源策略描述",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    exported = export_strategy("import_source")
    exported["strategy"]["id"] = "imported_dest"
    exported["strategy"]["title"] = "导入的目标策略"

    record = import_strategy(exported)
    assert record.id == "imported_dest"
    assert record.title == "导入的目标策略"
    assert record.visibility == "public"
    assert record.version_count >= 1


def test_import_rejects_existing_strategy_without_overwrite() -> None:
    save_user_strategy(
        strategy_id="import_existing",
        title="已存在的策略",
        description="不应被覆盖",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    exported = export_strategy("import_existing")

    with pytest.raises(InvalidParamsError, match="already exists"):
        import_strategy(exported, overwrite=False)


def test_import_overwrites_existing_strategy() -> None:
    save_user_strategy(
        strategy_id="import_overwrite_test",
        title="原始策略",
        description="将被覆盖",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    exported = export_strategy("import_overwrite_test")
    exported["strategy"]["title"] = "覆盖后的标题"
    exported["strategy"]["description"] = "已覆盖"

    record = import_strategy(exported, overwrite=True)
    assert record.title == "覆盖后的标题"
    assert record.description == "已覆盖"


def test_import_rejects_invalid_format_version() -> None:
    with pytest.raises(InvalidParamsError, match="Unsupported export format version"):
        import_strategy({"format_version": "0.1", "strategy": {}})


def test_import_rejects_missing_strategy_object() -> None:
    with pytest.raises(InvalidParamsError, match="must contain a strategy object"):
        import_strategy({"format_version": "1.0"})


def test_import_rejects_empty_versions() -> None:
    with pytest.raises(InvalidParamsError, match="at least one version"):
        import_strategy({"format_version": "1.0", "strategy": {"id": "test", "title": "test", "versions": []}})


# ── 策略市场 ──────────────────────────────────────────────────


def test_list_public_strategies_only_returns_public() -> None:
    save_user_strategy(
        strategy_id="market_public_1",
        title="市场公开策略 1",
        description="公开",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    save_user_strategy(
        strategy_id="market_public_2",
        title="市场公开策略 2",
        description="公开",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    save_user_strategy(
        strategy_id="market_private",
        title="市场私有策略",
        description="私有",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="private",
    )

    public_records = list_public_strategies()
    public_ids = {r.id for r in public_records}

    assert "market_public_1" in public_ids
    assert "market_public_2" in public_ids
    assert "market_private" not in public_ids


def test_list_public_strategies_empty_when_none_public() -> None:
    save_user_strategy(
        strategy_id="all_private",
        title="全私有策略",
        description="私有",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="private",
    )
    public_records = list_public_strategies()
    assert len([r for r in public_records if r.id == "all_private"]) == 0


# ── 导出内容完整性 ────────────────────────────────────────────


def test_export_includes_all_metadata_fields() -> None:
    save_user_strategy(
        strategy_id="export_metadata",
        title="元数据导出测试",
        description="测试所有字段",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    exported = export_strategy("export_metadata")
    strategy = exported["strategy"]

    required_fields = {
        "id", "title", "description", "params_schema",
        "visibility", "created_at", "updated_at",
        "current_version", "versions",
    }
    assert required_fields <= set(strategy.keys())
    assert len(strategy["versions"]) >= 1
    for version in strategy["versions"]:
        version_fields = {
            "version_id", "title", "description",
            "params_schema", "code", "created_at", "note",
        }
        assert version_fields <= set(version.keys())
        assert version["code"].strip()
