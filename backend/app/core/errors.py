"""Unified error envelope.

One shape for all backend errors so the frontend can render a single error
component and route handlers can stay free of ad-hoc error formatting.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ErrorCode(str, Enum):
    INVALID_PARAMS = "invalid_params"
    NOT_FOUND = "not_found"
    DATA_MISSING = "data_missing"
    DATA_QUALITY = "data_quality"
    STRATEGY_ERROR = "strategy_error"
    BACKTEST_FAILED = "backtest_failed"
    INTERNAL = "internal"


class ErrorEnvelope(BaseModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] | None = None


class QuantpilotError(Exception):
    """Base class for typed application errors."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details

    def to_envelope(self) -> ErrorEnvelope:
        return ErrorEnvelope(code=self.code, message=self.message, details=self.details)


class NotFoundError(QuantpilotError):
    def __init__(self, message: str, **details: Any) -> None:
        super().__init__(ErrorCode.NOT_FOUND, message, status=404, details=details or None)


class InvalidParamsError(QuantpilotError):
    def __init__(self, message: str, **details: Any) -> None:
        super().__init__(ErrorCode.INVALID_PARAMS, message, status=400, details=details or None)


class DataMissingError(QuantpilotError):
    def __init__(self, message: str, **details: Any) -> None:
        super().__init__(ErrorCode.DATA_MISSING, message, status=404, details=details or None)


class StrategyError(QuantpilotError):
    def __init__(self, message: str, **details: Any) -> None:
        super().__init__(ErrorCode.STRATEGY_ERROR, message, status=400, details=details or None)


class BacktestFailedError(QuantpilotError):
    def __init__(self, message: str, **details: Any) -> None:
        super().__init__(ErrorCode.BACKTEST_FAILED, message, status=500, details=details or None)
