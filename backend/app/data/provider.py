"""DataProvider 抽象：引擎与 HTTP 层共用的行情契约。

需提供 symbol、频率与起止日后，返回按时间升序、无重复时间戳的 OHLCV DataFrame。
实现包括 mock、CSV，后续可扩展 Parquet/DuckDB 等。
"""


from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

import pandas as pd

from .models import Frequency

BAR_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


class DataProvider(ABC):
    """数据源抽象基类。

    约束：
    - 输出 DataFrame 列顺序必须为 ``BAR_COLUMNS``，按 timestamp 升序。
    - 重复时间戳：默认策略为丢弃并告警（实现类可选择在标准化阶段处理）。
    - 无数据时抛出 ``DataMissingError``。
    """

    name: str = "abstract"

    @abstractmethod
    def list_symbols(self) -> list[str]:
        """返回当前源可提供的全部标的代码。"""

    @abstractmethod
    def get_bars(
        self,
        symbol: str,
        frequency: Frequency,
        start: datetime,
        end: datetime,
    ) -> pd.DataFrame:
        """返回 ``symbol`` 在 ``[start, end]``（闭区间）内的 OHLCV。"""

    @staticmethod
    def normalize(df: pd.DataFrame) -> pd.DataFrame:
        """将原始 DataFrame 规范为 ``BAR_COLUMNS`` 列序，排序并去重 timestamp。"""
        missing = set(BAR_COLUMNS) - set(df.columns)
        if missing:
            raise ValueError(f"DataProvider output missing columns: {sorted(missing)}")
        out = df[BAR_COLUMNS].copy()
        out["timestamp"] = pd.to_datetime(out["timestamp"])
        out = out.sort_values("timestamp", kind="stable")
        out = out.drop_duplicates(subset=["timestamp"], keep="last")
        out = out.reset_index(drop=True)
        return out
