"""策略模板清单与详情。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.strategy.registry import get_template, list_templates

router = APIRouter(prefix="/strategies", tags=["strategies"])


def _template_to_dict(template: Any) -> dict[str, Any]:
    return {
        "id": template.id,
        "title": template.title,
        "description": template.description,
        "params_schema": template.params_schema,
    }


@router.get("/templates")
def list_strategy_templates() -> dict[str, Any]:
    return {"templates": [_template_to_dict(t) for t in list_templates()]}


@router.get("/templates/{template_id}")
def get_strategy_template(template_id: str) -> dict[str, Any]:
    return _template_to_dict(get_template(template_id))
