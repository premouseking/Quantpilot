"""Logging setup."""

from __future__ import annotations

import logging
import sys

_INITIALIZED = False


def configure_logging(level: str = "INFO") -> None:
    """Configure stdlib logging once with a compact, readable format."""
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
