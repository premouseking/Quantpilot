"""标准库 logging 初始化（单行可读格式）。"""

from __future__ import annotations

import logging
import sys

_INITIALIZED = False


def configure_logging(level: str = "INFO") -> None:
    """幂等配置根 logger：紧凑时间戳 + 级别 + 名称 + 消息。"""
    global _INITIALIZED
    if _INITIALIZED:
        return

    level_value = getattr(logging, level.upper(), logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level_value)

    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).setLevel(max(level_value, logging.INFO))

    _INITIALIZED = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
