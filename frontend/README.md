# Quantpilot Frontend

React + Vite + TypeScript 前端，提供策略选择、参数配置、回测执行和报告可视化。

## 启动

```bash
npm install
copy .env.example .env
npm run dev
```

打开 http://127.0.0.1:5173 ，前端通过 `vite` 代理把 `/api/*` 转发到后端（默认 `http://127.0.0.1:8000`）。

## 关键模块

- `src/runtimeConfig.ts`：profile、API base URL 单一事实源
- `src/services/apiClient.ts`：统一 HTTP 客户端，集中错误结构与请求封装
- `src/services/api.ts`：与后端 schema 对齐的类型化 API
- `src/queryClient.ts`：TanStack Query 全局默认配置
- `src/pages/BacktestPage.tsx`：回测配置与报告页
- `src/components/EquityChart.tsx`：ECharts 资金曲线
- `src/components/MetricsPanel.tsx`：核心绩效指标面板
- `src/components/TradesTable.tsx`：成交明细表
