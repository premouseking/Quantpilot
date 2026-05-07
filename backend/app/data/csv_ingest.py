"""把用户上传的 CSV 校验后写入 ``market_dir/<frequency>/<symbol>.csv``。"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pandas as pd

from app.core.errors import InvalidParamsError

from .models import Frequency
from .provider import BAR_COLUMNS, DataProvider

_SYMBOL_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def normalize_upload_symbol(symbol: str) -> str:
    s = symbol.strip()
    if not s or not _SYMBOL_RE.fullmatch(s):
        raise InvalidParamsError(
            "symbol must be 1–64 chars: letters, digits, '.', '_', '-'",
            symbol=symbol,
        )
    return s


def parse_upload_csv_bytes(raw: bytes, *, max_bytes: int) -> pd.DataFrame:
    if len(raw) > max_bytes:
        raise InvalidParamsError(
            f"CSV exceeds maximum size ({max_bytes} bytes)",
            max_bytes=max_bytes,
        )
    if not raw.strip():
        raise InvalidParamsError("Empty CSV file")

    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:  # noqa: BLE001 — 用户文件格式不可信
        raise InvalidParamsError(f"Could not parse CSV: {exc}") from exc

    df.columns = [str(c).strip().lower() for c in df.columns]
    if "timestamp" not in df.columns and "date" in df.columns:
        df = df.rename(columns={"date": "timestamp"})

    required = set(BAR_COLUMNS)
    missing = required - set(df.columns)
    if missing:
        raise InvalidParamsError(
            f"Missing columns: {sorted(missing)}",
            expected=sorted(required),
            got=sorted(df.columns),
        )

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=list(BAR_COLUMNS))
    if df.empty:
        raise InvalidParamsError("No valid rows after parsing timestamps and OHLCV")

    try:
        normalized = DataProvider.normalize(df)
    except ValueError as exc:
        raise InvalidParamsError(str(exc)) from exc

    return normalized


def write_market_csv(
    df: pd.DataFrame,
    *,
    market_dir: Path,
    frequency: Frequency,
    symbol: str,
) -> Path:
    freq_dir = Path(market_dir) / frequency.value
    freq_dir.mkdir(parents=True, exist_ok=True)
    dest = freq_dir / f"{symbol}.csv"
    df.to_csv(dest, index=False)
    return dest
