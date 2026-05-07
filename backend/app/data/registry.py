"""DataProvider 注册表：按名称解析已配置的数据源实例。

其他模块应通过本注册表获取 provider，避免在业务里直接 ``new`` 具体实现类。
"""

from __future__ import annotations

from app.core.config import get_runtime_config
from app.core.errors import NotFoundError

from .akshare_provider import AkShareDataProvider
from .csv_provider import CsvDataProvider
from .mock_provider import MockDataProvider
from .provider import DataProvider


class DataProviderRegistry:
    def __init__(self) -> None:
        config = get_runtime_config()
        self._providers: dict[str, DataProvider] = {
            "mock": MockDataProvider(),
            "csv": CsvDataProvider(base_dir=config.market_dir),
            "akshare": AkShareDataProvider(adjust=config.akshare_adjust),
        }

    def get(self, name: str) -> DataProvider:
        provider = self._providers.get(name)
        if provider is None:
            raise NotFoundError(
                f"Unknown data provider '{name}'",
                available=sorted(self._providers),
            )
        return provider

    def list(self) -> list[str]:
        return sorted(self._providers)


_registry: DataProviderRegistry | None = None


def get_data_provider_registry() -> DataProviderRegistry:
    global _registry
    if _registry is None:
        _registry = DataProviderRegistry()
    return _registry
