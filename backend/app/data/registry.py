"""DataProvider registry.

Single place to look up a configured provider by name. Other modules should
depend on this rather than instantiating providers directly.
"""

from __future__ import annotations

from app.core.config import get_runtime_config
from app.core.errors import NotFoundError

from .csv_provider import CsvDataProvider
from .mock_provider import MockDataProvider
from .provider import DataProvider


class DataProviderRegistry:
    def __init__(self) -> None:
        config = get_runtime_config()
        self._providers: dict[str, DataProvider] = {
            "mock": MockDataProvider(),
            "csv": CsvDataProvider(base_dir=config.market_dir),
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
