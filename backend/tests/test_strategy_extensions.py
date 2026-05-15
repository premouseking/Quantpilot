"""策略管理扩展功能测试：标签、分类、Fork、评论、导出 v1.1。"""

from __future__ import annotations

import pytest

from app.core.errors import InvalidParamsError, NotFoundError
from app.strategy.user_store import (
    add_comment,
    delete_comment,
    export_strategy,
    fork_strategy,
    get_user_strategy,
    import_strategy,
    list_all_tags,
    list_category_options,
    list_comments,
    list_public_strategies,
    save_user_strategy,
    set_visibility,
    update_strategy_tags,
)

USER_STRATEGY_CODE = """
from app.strategy.base import Strategy, StrategyContext


class ExtTestStrategy(Strategy):
    def initialize(self, params):
        self.pct = float(params.get("target_percent", 0.5))
    def on_bar(self, ctx: StrategyContext):
        if ctx.bar.close > 0:
            ctx.order_target_percent(self.pct)
"""

USER_PARAMS_SCHEMA = {
    "type": "object",
    "title": "扩展测试策略",
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


# ── 标签与分类 ────────────────────────────────────────────────


def test_default_tags_and_category() -> None:
    save_user_strategy(
        strategy_id="tags_default",
        title="默认标签策略",
        description="默认值测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    record = get_user_strategy("tags_default")
    assert record.tags == []
    assert record.category == "custom"


def test_save_with_tags_and_category() -> None:
    save_user_strategy(
        strategy_id="tags_explicit",
        title="带标签策略",
        description="显式标签测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        tags=["趋势跟踪", "均线"],
        category="trend",
    )
    record = get_user_strategy("tags_explicit")
    assert "趋势跟踪" in record.tags
    assert "均线" in record.tags
    assert record.category == "trend"


def test_update_strategy_tags() -> None:
    save_user_strategy(
        strategy_id="tags_update",
        title="标签更新策略",
        description="测试更新",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        tags=["旧标签"],
        category="custom",
    )
    record = update_strategy_tags(
        "tags_update",
        tags=["动量", "反转"],
        category="momentum",
    )
    assert set(record.tags) == {"动量", "反转"}
    assert record.category == "momentum"


def test_update_strategy_tags_dedup_and_trim() -> None:
    save_user_strategy(
        strategy_id="tags_clean",
        title="标签清理策略",
        description="测试清理",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    record = update_strategy_tags(
        "tags_clean",
        tags=["  趋势  ", "趋势", "", "动量"],
        category="custom",
    )
    assert record.tags == ["趋势", "动量"]


def test_update_strategy_tags_max_10() -> None:
    save_user_strategy(
        strategy_id="tags_max",
        title="标签上限策略",
        description="测试上限",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    many_tags = [f"tag{i}" for i in range(15)]
    record = update_strategy_tags("tags_max", tags=many_tags)
    assert len(record.tags) == 10


def test_update_strategy_tags_rejects_invalid_category() -> None:
    save_user_strategy(
        strategy_id="tags_bad_cat",
        title="无效分类策略",
        description="测试无效分类",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    with pytest.raises(InvalidParamsError, match="category must be one of"):
        update_strategy_tags("tags_bad_cat", category="invalid_cat")


def test_list_all_tags_aggregates_across_strategies() -> None:
    save_user_strategy(
        strategy_id="tags_agg_1",
        title="聚合标签策略 1",
        description="标签聚合",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        tags=["趋势", "A股"],
    )
    save_user_strategy(
        strategy_id="tags_agg_2",
        title="聚合标签策略 2",
        description="标签聚合",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        tags=["动量", "A股"],
    )
    all_tags = list_all_tags()
    assert "A股" in all_tags
    assert "趋势" in all_tags
    assert "动量" in all_tags


def test_list_categories_returns_all() -> None:
    categories = list_category_options()
    values = {c["value"] for c in categories}
    assert "trend" in values
    assert "custom" in values
    assert len(categories) == 7


# ── Fork ──────────────────────────────────────────────────────


def test_fork_strategy_creates_new_private_copy() -> None:
    save_user_strategy(
        strategy_id="fork_source",
        title="Fork 源策略",
        description="源",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
        tags=["趋势", "均线"],
        category="trend",
    )
    record = fork_strategy(
        "fork_source",
        new_id="forked_copy",
        new_title="Fork 副本策略",
    )
    assert record.id == "forked_copy"
    assert record.title == "Fork 副本策略"
    assert record.visibility == "private"
    assert record.forked_from == "fork_source"
    assert "趋势" in record.tags
    assert record.category == "trend"


def test_fork_strategy_rejects_private_source() -> None:
    save_user_strategy(
        strategy_id="private_source",
        title="私有源策略",
        description="不应被 Fork",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="private",
    )
    with pytest.raises(InvalidParamsError, match="Only public strategies can be forked"):
        fork_strategy("private_source", new_id="bad_fork", new_title="Bad")


def test_fork_strategy_rejects_duplicate_id() -> None:
    save_user_strategy(
        strategy_id="existing_fork",
        title="已存在策略",
        description="测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    with pytest.raises(InvalidParamsError, match="already exists"):
        fork_strategy("existing_fork", new_id="existing_fork", new_title="Dup")


# ── 评论 ──────────────────────────────────────────────────────


def test_add_and_list_comments() -> None:
    save_user_strategy(
        strategy_id="comment_test",
        title="评论测试策略",
        description="测试评论",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    added = add_comment(
        "comment_test",
        author="测试者",
        content="第一条评论",
    )
    assert added.author == "测试者"
    assert added.content == "第一条评论"
    assert added.id.startswith("cmt_")

    comments = list_comments("comment_test")
    assert len(comments) == 1
    assert comments[0].content == "第一条评论"


def test_add_comment_default_author() -> None:
    save_user_strategy(
        strategy_id="comment_anon",
        title="匿名评论测试",
        description="测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    added = add_comment("comment_anon", author="", content="匿名评论")
    assert added.author == "anonymous"


def test_add_comment_rejects_empty_content() -> None:
    save_user_strategy(
        strategy_id="comment_empty",
        title="空评论测试",
        description="测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    with pytest.raises(InvalidParamsError, match="comment content is required"):
        add_comment("comment_empty", author="test", content="  ")


def test_delete_comment() -> None:
    save_user_strategy(
        strategy_id="comment_del",
        title="删除评论测试",
        description="测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    added = add_comment("comment_del", author="test", content="待删除")
    assert len(list_comments("comment_del")) == 1
    delete_comment("comment_del", added.id)
    assert len(list_comments("comment_del")) == 0


def test_delete_nonexistent_comment_raises() -> None:
    save_user_strategy(
        strategy_id="comment_nodel",
        title="无评论测试",
        description="测试",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
    )
    with pytest.raises(NotFoundError):
        delete_comment("comment_nodel", "cmt_deadbeef")


# ── 导出 v1.1 ────────────────────────────────────────────────


def test_export_v11_includes_tags_and_category() -> None:
    save_user_strategy(
        strategy_id="export_v11",
        title="v1.1 导出测试",
        description="测试新字段",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
        tags=["动量", "A股"],
        category="momentum",
    )
    exported = export_strategy("export_v11")
    assert exported["format_version"] == "1.1"

    strategy_data = exported["strategy"]
    assert strategy_data["tags"] == ["动量", "A股"]
    assert strategy_data["category"] == "momentum"
    assert strategy_data["visibility"] == "public"


def test_import_v10_is_still_accepted() -> None:
    save_user_strategy(
        strategy_id="import_v10_source",
        title="v1.0 源策略",
        description="测试向后兼容",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        visibility="public",
    )
    exported = export_strategy("import_v10_source")
    exported["format_version"] = "1.0"
    exported["strategy"]["id"] = "imported_from_v10"
    exported["strategy"]["title"] = "从 v1.0 导入"

    record = import_strategy(exported)
    assert record.id == "imported_from_v10"
    assert record.tags == []
    assert record.category == "custom"


def test_import_v11_preserves_tags_and_category() -> None:
    save_user_strategy(
        strategy_id="import_v11_source",
        title="v1.1 源策略",
        description="测试标签保留",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        tags=["趋势", "A股"],
        category="trend",
    )
    exported = export_strategy("import_v11_source")
    exported["strategy"]["id"] = "imported_v11_dest"
    exported["strategy"]["title"] = "v1.1 导入目标"

    record = import_strategy(exported)
    assert record.tags == ["趋势", "A股"]
    assert record.category == "trend"


def test_overwrite_preserves_tags() -> None:
    save_user_strategy(
        strategy_id="overwrite_tags",
        title="覆盖标签测试",
        description="第一版",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        tags=["原始标签"],
        category="custom",
    )
    save_user_strategy(
        strategy_id="overwrite_tags",
        title="覆盖标签测试",
        description="第二版",
        code=USER_STRATEGY_CODE,
        params_schema=USER_PARAMS_SCHEMA,
        overwrite=True,
        version_note="更新",
    )
    record = get_user_strategy("overwrite_tags")
    assert "原始标签" in record.tags
    assert record.category == "custom"
