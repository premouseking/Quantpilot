"""AkShare 行情源（A 股日线 OHLCV）。

需网络；标的为 6 位代码（如 ``000001``、``600519``）。
分钟/小时级频次不在此实现（请用 ``mock`` 或 ``csv``）。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.errors import DataMissingError, InvalidParamsError

from .models import Frequency
from .provider import BAR_COLUMNS, DataProvider

logger = logging.getLogger(__name__)

_CN_TZ = ZoneInfo("Asia/Shanghai")


def _to_cn_yyyymmdd(d: datetime) -> str:
    """按中国日历日转为 AkShare 所需的 YYYYMMDD（避免 ISO UTC 与本地选日差一日）。"""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(_CN_TZ).strftime("%Y%m%d")


def normalize_akshare_symbol(symbol: str) -> str:
    """A 股六位代码；支持 ``sh600519`` / ``600519.SH`` 等常见写法。"""
    s = symbol.strip().upper()
    if not s:
        raise InvalidParamsError("symbol must be non-empty")
    if "." in s:
        s = s.split(".", 1)[0]
    for prefix in ("SH", "SZ", "BJ"):
        if s.startswith(prefix) and len(s) > len(prefix) and s[len(prefix) :].isdigit():
            s = s[len(prefix) :]
            break
    if len(s) >= 6 and s[:6].isdigit():
        s = s[:6]
    if len(s) != 6 or not s.isdigit():
        raise InvalidParamsError(
            f'AkShare 仅支持 A 股六位数字代码（如 600519）；当前为 "{symbol}"'
        )
    return s


def _pick_column(raw: pd.DataFrame, *candidates: str) -> str | None:
    cols = list(raw.columns)
    lower_index = {str(c).strip().lower(): c for c in cols}
    for name in candidates:
        if name in cols:
            return name
        key = name.lower()
        if key in lower_index:
            return lower_index[key]
    return None


def normalize_akshare_hist_df(raw: pd.DataFrame) -> pd.DataFrame:
    """将 AkShare ``stock_zh_a_hist`` 原始表映射为标准 OHLCV 列。"""
    if raw.empty:
        return pd.DataFrame(columns=list(BAR_COLUMNS))

    ts_col = _pick_column(raw, "日期", "date")
    open_col = _pick_column(raw, "开盘", "open")
    high_col = _pick_column(raw, "最高", "high")
    low_col = _pick_column(raw, "最低", "low")
    close_col = _pick_column(raw, "收盘", "close")
    vol_col = _pick_column(raw, "成交量", "volume")
    missing = [
        label
        for label, col in [
            ("timestamp", ts_col),
            ("open", open_col),
            ("high", high_col),
            ("low", low_col),
            ("close", close_col),
            ("volume", vol_col),
        ]
        if col is None
    ]
    if missing:
        raise ValueError(
            f"AkShare history frame missing columns {missing}; got {list(raw.columns)}"
        )

    out = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(raw[ts_col], errors="coerce"),
            "open": pd.to_numeric(raw[open_col], errors="coerce"),
            "high": pd.to_numeric(raw[high_col], errors="coerce"),
            "low": pd.to_numeric(raw[low_col], errors="coerce"),
            "close": pd.to_numeric(raw[close_col], errors="coerce"),
            "volume": pd.to_numeric(raw[vol_col], errors="coerce"),
        }
    )
    out = out.dropna(subset=["timestamp"])
    return out


@lru_cache(maxsize=1)
def _a_share_codes_cached() -> tuple[str, ...]:
    import akshare as ak  # type: ignore[import-untyped]

    df = ak.stock_info_a_code_name()
    if df.empty:
        return ()
    code_col = _pick_column(df, "代码", "code")
    if code_col is None:
        code_col = str(df.columns[0])
    codes = (
        df[code_col]
        .astype(str)
        .str.strip()
        .replace("", pd.NA)
        .dropna()
        .unique()
        .tolist()
    )
    normalized = []
    for c in codes:
        s = str(c).strip()
        if s.isdigit() and len(s) == 6:
            normalized.append(s)
        elif len(s) >= 6 and s[:6].isdigit():
            normalized.append(s[:6])
    return tuple(sorted(set(normalized)))


class AkShareDataProvider(DataProvider):
    name = "akshare"

    def __init__(self, *, adjust: str = "qfq") -> None:
        """``adjust``：``""`` 不复权，``"qfq"`` 前复权，``"hfq"`` 后复权。"""
        if adjust not in {"", "qfq", "hfq"}:
            raise InvalidParamsError('adjust must be one of "", "qfq", "hfq"')
        self._adjust = adjust

    def list_symbols(self) -> list[str]:
        try:
            return list(_a_share_codes_cached())
        except Exception as exc:
            logger.warning("AkShare list symbols failed, using minimal fallback: %s", exc)
            return ["000001", "600000", "600519"]

    def get_bars(
        self,
        symbol: str,
        frequency: Frequency,
        start: datetime,
        end: datetime,
    ) -> pd.DataFrame:
        if frequency != Frequency.DAILY:
            raise InvalidParamsError(
                f"AkShare provider supports daily bars only; got {frequency.value}. "
                "Use csv or mock for other frequencies."
            )
        if start > end:
            raise InvalidParamsError("start must be <= end")

        code = normalize_akshare_symbol(symbol)

        import akshare as ak  # type: ignore[import-untyped]

        start_s, end_s = _to_cn_yyyymmdd(start), _to_cn_yyyymmdd(end)
        try:
            raw = ak.stock_zh_a_hist(
                symbol=code,
                period="daily",
                start_date=start_s,
                end_date=end_s,
                adjust=self._adjust,
            )
        except Exception as exc:
            raise DataMissingError(
                f"AkShare request failed: {exc}",
                symbol=code,
                start=start.isoformat(),
                end=end.isoformat(),
            ) from exc

        if raw is None or raw.empty:
            raise DataMissingError(
                "AkShare 在该标的与日期区间内未返回任何日线。请确认代码为有效 A 股、"
                "区间含历史交易日且结束日不过于超前（数据源可能尚未更新）。",
                symbol=code,
                start=start.isoformat(),
                end=end.isoformat(),
            )

        try:
            frame = normalize_akshare_hist_df(raw)
        except ValueError as exc:
            raise DataMissingError(
                f"Failed to parse AkShare response: {exc}",
                symbol=code,
            ) from exc

        if frame.empty:
            raise DataMissingError(
                "Parsed AkShare frame is empty",
                symbol=code,
                start=start.isoformat(),
                end=end.isoformat(),
            )

        return self.normalize(frame)


def clear_akshare_symbol_cache() -> None:
    """测试辅助：清空标的列表 LRU 缓存。"""
    _a_share_codes_cached.cache_clear()
