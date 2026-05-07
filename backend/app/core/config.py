"""RuntimeConfig：由环境变量派生的运行时配置唯一入口。

按 profile 在进程启动时一次性解析；业务代码须依赖本对象，禁止直接读 os.environ。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Profile = Literal["local", "docker-dev", "prod"]


class RuntimeConfig(BaseSettings):
    """进程级运行时配置。

    环境变量统一带 ``QUANTPILOT_`` 前缀，经 ``get_runtime_config()`` 在启动时解析。
    业务代码应依赖本对象而非裸读环境变量。
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

    market_csv_max_upload_bytes: int = Field(
        default=15 * 1024 * 1024,
        description="POST 上传单份行情 CSV 的最大字节数（写入 market_dir）",
    )

    akshare_adjust: str = Field(
        default="qfq",
        description='AkShare stock_zh_a_hist 复权方式：""（不复权）| "qfq"（前复权）| "hfq"（后复权）',
    )

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
        """若缺失则创建运行时目录。

        启动时调用一次，避免冷安装后首个请求才建目录带来的延迟尖峰。
        """
        for path in (self.data_dir, self.runs_dir, self.market_dir, self.strategies_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_runtime_config() -> RuntimeConfig:
    """返回进程内单例 ``RuntimeConfig``。"""
    config = RuntimeConfig()
    config.ensure_dirs()
    return config
