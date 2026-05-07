# Quantpilot Backend

FastAPI 服务 + 事件驱动回测引擎。

## 模块

- `app/core/`：RuntimeConfig、日志、错误结构
- `app/api/routes/`：按领域拆分的 API 路由
- `app/data/`：DataProvider 抽象、CSV、Mock、`akshare`（A 股日线，需联网）
- `app/strategy/`：策略基类、双均线模板、指标库
- `app/engine/`：事件、撮合、组合、回测主循环
- `app/analysis/`：绩效指标、报告
- `app/services/`：领域服务层
- `app/storage/`：回测结果文件存储
- `tests/`：pytest 测试

## 启动

```bash
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

## 测试

```bash
pytest
```

## 数据源

| 名称 | 说明 |
|------|------|
| `mock` | 本地随机 walk，联调 / 无网可用 |
| `csv` | 读 `QUANTPILOT_MARKET_DIR`（默认 `./data/market`）下目录 `daily/`（或对应频率名）中的 `标的代码.csv` |
| `akshare` | 东方财富接口拉 A 股 **日线**，标的为 6 位代码（如 `000001`、`600519`）；需可访问外网；复权方式见 `QUANTPILOT_AKSHARE_ADJUST`（默认 `qfq` 前复权） |

CSV 列需包含：`timestamp`（或 `date`）、`open`、`high`、`low`、`close`、`volume`（列名大小写不敏感）。示例路径：`data/market/daily/000001.csv`。
