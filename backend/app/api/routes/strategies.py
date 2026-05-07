"""策略模板清单与详情。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.strategy.registry import get_template, get_template_source_code, list_templates
from app.strategy.user_store import get_user_strategy, save_user_strategy

router = APIRouter(prefix="/strategies", tags=["strategies"])


class SaveUserStrategyRequest(BaseModel):
    id: str = Field(min_length=3, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    code: str = Field(min_length=1)
    params_schema: dict[str, Any] = Field(default_factory=dict)
    overwrite: bool = False


def _template_to_dict(template: Any, *, include_code: bool = False) -> dict[str, Any]:
    payload = {
        "id": template.id,
        "title": template.title,
        "description": template.description,
        "params_schema": template.params_schema,
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
    )
    return {
        "id": record.id,
        "title": record.title,
        "description": record.description,
        "params_schema": record.params_schema,
    }


@router.get("/user/{strategy_id}")
def get_user_strategy_template(strategy_id: str) -> dict[str, Any]:
    record = get_user_strategy(strategy_id)
    code = record.code_path.read_text(encoding="utf-8")
    return {
        "id": record.id,
        "title": record.title,
        "description": record.description,
        "params_schema": record.params_schema,
        "code": code,
    }
