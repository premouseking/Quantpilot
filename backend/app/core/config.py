"""RuntimeConfig: single source of truth for environment-driven configuration.

Profile-aware, eagerly resolved at process start. Business code must depend on
this object, never read directly from os.environ.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Profile = Literal["local", "docker-dev", "prod"]


class RuntimeConfig(BaseSettings):
    """Process-wide runtime configuration.

    All env vars are prefixed with ``QUANTPILOT_`` and resolved once at startup
    via ``get_runtime_config()``. Business code should depend on this object,
    not on environment variables directly.
    """

    model_config = SettingsConfigDict(
        env_prefix="QUANTPILOT_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    profile: Profile = "local"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    log_level: str = "INFO"

    data_dir: Path = Field(default=Path("./data"))
    runs_dir: Path = Field(default=Path("./data/runs"))
    market_dir: Path = Field(default=Path("./data/market"))
    strategies_dir: Path = Field(default=Path("./data/strategies"))

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    def ensure_dirs(self) -> None:
        """Create runtime directories if missing.

        Called once at startup to avoid first-request latency on a cold install.
        """
        for path in (self.data_dir, self.runs_dir, self.market_dir, self.strategies_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_runtime_config() -> RuntimeConfig:
    """Return the singleton RuntimeConfig instance."""
    config = RuntimeConfig()
    config.ensure_dirs()
    return config
