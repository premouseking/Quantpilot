/**
 * 前端可调用的类型化 API：路径与载荷形状与后端 Pydantic Schema 对齐。
 */

import { apiClient } from "./apiClient";

export interface StrategyTemplate {
  id: string;
  title: string;
  description: string;
  params_schema: Record<string, unknown>;
  code?: string;
}

export interface UserStrategyTemplate extends StrategyTemplate {
  code: string;
}

export interface DataProvider {
  providers: string[];
}

export interface SymbolList {
  symbols: string[];
}

export interface EquityPoint {
  timestamp: string;
  cash: number;
  market_value: number;
  total_value: number;
}

export interface FillRecord {
  order_id: string;
  timestamp: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  commission: number;
  stamp_tax: number;
  slippage: number;
}

export interface OrderRecord {
  id: string;
  timestamp: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  order_type: string;
  status: string;
  reject_reason: string | null;
  limit_price: number | null;
}

export interface BacktestMetrics {
  cumulative_return: number;
  annualized_return: number;
  annualized_volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  max_drawdown_start: string | null;
  max_drawdown_end: string | null;
  trade_count: number;
  win_rate: number;
  profit_loss_ratio: number;
}

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BarsResponse {
  provider: string;
  symbol: string;
  frequency: string;
  count: number;
  bars: Bar[];
}

export interface MarketCsvUploadResponse {
  saved_path: string;
  symbol: string;
  frequency: string;
  row_count: number;
}

export interface RuntimeInfo {
  profile: string;
  api_host: string;
  api_port: number;
  data_dir: string;
  runs_dir: string;
  market_dir: string;
}

export interface BacktestReport {
  config: {
    symbol: string;
    frequency: string;
    start: string;
    end: string;
    initial_cash: number;
    benchmark_symbol: string | null;
    data_provider?: string;
    template_id?: string | null;
    strategy_params: Record<string, unknown>;
    cost_model: Record<string, number>;
  };
  summary: {
    final_value: number;
    final_cash: number;
    final_position: number;
  };
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  benchmark_curve: EquityPoint[];
  fills: FillRecord[];
  orders: OrderRecord[];
}

export interface BacktestRunEnvelope {
  run_id: string;
  created_at: string;
  report: BacktestReport;
}

export interface BacktestRunSummary {
  run_id: string;
  created_at: string;
  config?: BacktestReport["config"];
  summary?: BacktestReport["summary"];
  metrics?: BacktestMetrics;
}

export interface BacktestRunRequest {
  template_id: string;
  symbol: string;
  start: string;
  end: string;
  frequency: string;
  initial_cash: number;
  data_provider: string;
  benchmark_symbol?: string | null;
  benchmark_provider?: string | null;
  strategy_params: Record<string, unknown>;
  cost_model: {
    commission_rate: number;
    min_commission: number;
    stamp_tax_rate: number;
    slippage_bps: number;
  };
}

export interface SaveUserStrategyRequest {
  id: string;
  title: string;
  description: string;
  code: string;
  params_schema: Record<string, unknown>;
  overwrite?: boolean;
}

export const api = {
  health: () => apiClient.get<{ status: string }>("/api/health"),
  runtime: () => apiClient.get<RuntimeInfo>("/api/runtime"),
  listProviders: () => apiClient.get<DataProvider>("/api/data/providers"),
  listSymbols: (provider: string) =>
    apiClient.get<SymbolList>(`/api/data/providers/${provider}/symbols`),
  getBars: (
    provider: string,
    params: {
      symbol: string;
      start: string;
      end: string;
      frequency?: string;
      limit?: number;
    },
  ) =>
    apiClient.get<BarsResponse>(`/api/data/providers/${provider}/bars`, {
      symbol: params.symbol,
      start: params.start,
      end: params.end,
      frequency: params.frequency ?? "daily",
      limit: params.limit ?? 1000,
    }),
  uploadMarketCsv: (params: { symbol: string; frequency: string; file: File }) => {
    const fd = new FormData();
    fd.append("symbol", params.symbol);
    fd.append("frequency", params.frequency);
    fd.append("file", params.file);
    return apiClient.post<MarketCsvUploadResponse>(
      "/api/data/providers/csv/upload",
      fd,
    );
  },
  listStrategyTemplates: () =>
    apiClient.get<{ templates: StrategyTemplate[] }>("/api/strategies/templates"),
  getStrategyTemplate: (id: string) =>
    apiClient.get<StrategyTemplate>(`/api/strategies/templates/${id}`),
  saveUserStrategy: (payload: SaveUserStrategyRequest) =>
    apiClient.post<StrategyTemplate>("/api/strategies/user", payload),
  getUserStrategy: (id: string) =>
    apiClient.get<UserStrategyTemplate>(`/api/strategies/user/${id}`),
  runBacktest: (payload: BacktestRunRequest) =>
    apiClient.post<BacktestRunEnvelope>("/api/backtests/runs", payload),
  listBacktestRuns: () =>
    apiClient.get<{ runs: BacktestRunSummary[] }>("/api/backtests/runs"),
  getBacktestRun: (runId: string) =>
    apiClient.get<BacktestRunEnvelope>(`/api/backtests/runs/${runId}`),
};
