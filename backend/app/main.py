"""FastAPI 应用入口。

组装路由、CORS、统一异常处理与结构化日志；刻意保持薄层。
耗时计算放在服务层与回测引擎中，路由处理函数不包含重型逻辑。
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import api_router
from app.core.config import get_runtime_config
from app.core.errors import ErrorCode, ErrorEnvelope, QuantpilotError
from app.core.logging import configure_logging, get_logger


def create_app() -> FastAPI:
    config = get_runtime_config()
    configure_logging(config.log_level)
    logger = get_logger("quantpilot.app")

    app = FastAPI(
        title="Quantpilot API",
        version="0.1.0",
        description="Quantpilot backtesting platform API",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(QuantpilotError)
    async def _quantpilot_error_handler(_request: Request, exc: QuantpilotError) -> JSONResponse:
        logger.warning("quantpilot error: %s | %s", exc.code.value, exc.message)
        return JSONResponse(status_code=exc.status, content=exc.to_envelope().model_dump())

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        envelope = ErrorEnvelope(
            code=ErrorCode.INVALID_PARAMS,
            message="Request validation failed",
            details={"errors": exc.errors()},
        )
        return JSONResponse(status_code=422, content=envelope.model_dump())

    @app.exception_handler(Exception)
    async def _internal_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error: %s", exc)
        envelope = ErrorEnvelope(
            code=ErrorCode.INTERNAL,
            message=str(exc) or "Internal server error",
        )
        return JSONResponse(status_code=500, content=envelope.model_dump())

    app.include_router(api_router)

    @app.get("/")
    def _root() -> dict[str, Any]:
        return {
            "name": "Quantpilot API",
            "version": "0.1.0",
            "docs": "/docs",
            "health": "/api/health",
        }

    logger.info(
        "Quantpilot API started | profile=%s host=%s port=%s",
        config.profile,
        config.api_host,
        config.api_port,
    )
    return app


app = create_app()
