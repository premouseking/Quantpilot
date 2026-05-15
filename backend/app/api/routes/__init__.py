"""按业务域划分的 API 路由聚合。"""

from fastapi import APIRouter

from .backtests import router as backtests_router
from .data import router as data_router
from .health import router as health_router
from .optimization import router as optimization_router
from .strategies import router as strategies_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(data_router)
api_router.include_router(strategies_router)
api_router.include_router(backtests_router)
api_router.include_router(optimization_router)

__all__ = ["api_router"]
