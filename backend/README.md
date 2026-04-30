# Quantpilot Backend

FastAPI 服务 + 事件驱动回测引擎。

## 模块

- `app/core/`：RuntimeConfig、日志、错误结构
- `app/api/routes/`：按领域拆分的 API 路由
- `app/data/`：DataProvider 抽象、CSV、Mock 数据源
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
