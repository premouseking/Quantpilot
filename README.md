# Quantpilot

股票量化策略回测平台。MVP 目标：本地/内网单用户研究平台，支持 CSV 与模拟数据、Python 策略编辑、Bar 级事件驱动回测、绩效分析与可视化。

## 技术栈

- 后端：Python 3.10+ / FastAPI / Pandas / NumPy
- 前端：React 18 + Vite + TypeScript + TanStack Query + Ant Design + ECharts
- 数据：CSV、Mock；后续引入 Parquet + DuckDB + Polars 作为数据湖
- 实时：FastAPI ASGI + WebSocket（第二轮接入）
- 任务：本地内存任务队列；后续可升级 Celery/RQ + Redis

## 仓库结构

- `backend/`：FastAPI 应用、回测引擎、数据层、策略层、指标分析
- `frontend/`：React + Vite 前端
- `data/`：本地行情数据示例（gitignore 中，按需添加）
- `docs/`：开发文档与设计说明

## 本地开发

### 后端

```bash
cd backend
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -e .[dev]
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

健康检查：http://127.0.0.1:8000/api/health

### 前端

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

默认地址：http://127.0.0.1:5173 ，自动代理 `/api` 到 `http://127.0.0.1:8000` 。

### 测试

```bash
cd backend
pytest
```

## MVP 边界

- 已实现：DataProvider 抽象、CSV/Mock 数据源、双均线策略模板、Bar 事件驱动回测、佣金/印花税/滑点、资金曲线、核心绩效指标、回测 API、最小前端页面与图表。
- 暂未实现：实时进度 WebSocket、参数优化、策略多版本管理、用户/权限、Parquet 数据湖、Tick 高频。

完整的产品定位、技术架构、领域模型、分阶段交付路线和工程规范见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
