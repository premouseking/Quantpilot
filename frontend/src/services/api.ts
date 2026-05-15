/**
 * 前端可调用的类型化 API：路径与载荷形状与后端 Pydantic Schema 对齐。
 */

import { apiClient } from "./apiClient";

export interface StrategyTemplate {
  id: string;
  title: string;
  description: string;
  params_schema: Record<string, unknown>;
  source: "builtin" | "user";
  readonly: boolean;
  visibility?: string;
  tags?: string[];
  category?: string;
  forked_from?: string | null;
  forked_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  current_version?: string | null;
  version_count?: number;
  code?: string;
}

export interface UserStrategyTemplate extends StrategyTemplate {
  code: string;
}

export interface StrategyVersionSummary {
  version_id: string;
  strategy_id: string;
  title: string;
  description: string;
  params_schema: Record<string, unknown>;
  created_at: string;
  note: string;
}

export interface StrategyVersionDetail extends StrategyVersionSummary {
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
  strategy_version?: string | null;
  cost_model: {
    commission_rate: number;
    min_commission: number;
    stamp_tax_rate: number;
    slippage_bps: number;
  };
}

export interface BacktestReportConfig {
  symbol: string;
  frequency: string;
  start: string;
  end: string;
  initial_cash: number;
  benchmark_symbol: string | null;
  data_provider?: string;
  template_id?: string | null;
  strategy_version?: string | null;
  strategy_params: Record<string, unknown>;
  cost_model: Record<string, number>;
}

export interface StrategyExportPayload {
  format_version: string;
  exported_at: string;
  strategy: {
    id: string;
    title: string;
    description: string;
    params_schema: Record<string, unknown>;
    visibility: string;
    created_at?: string | null;
    updated_at?: string | null;
    current_version?: string | null;
    versions: StrategyVersionDetail[];
  };
}

export interface VersionComparisonItem {
  version_id: string;
  run_count: number;
  best_run_id: string;
  best_created_at: string;
  cumulative_return: number | null;
  annualized_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  trade_count: number | null;
}

export interface VersionComparison {
  strategy_id: string;
  comparisons: VersionComparisonItem[];
  message?: string;
}

export interface VisibilityOptions {
  values: string[];
  descriptions: Record<string, string>;
}

export interface MarketplaceStrategy extends StrategyTemplate {
  code: string;
}

export interface StrategyComment {
  id: string;
  strategy_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface CategoryOption {
  value: string;
  label: string;
}

export interface GridSearchRequest {
  template_id: string;
  symbol: string;
  start: string;
  end: string;
  frequency?: string;
  initial_cash?: number;
  data_provider?: string;
  param_grid: Record<string, number[]>;
  sort_by?: string;
}

export interface GridResultItem {
  params: Record<string, number>;
  cumulative_return: number;
  annualized_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  trade_count: number;
  final_value: number;
  sortino_ratio: number;
  calmar_ratio: number;
}

export interface GridSearchResponse {
  template_id: string;
  symbol: string;
  total_combinations: number;
  valid_count: number;
  skipped_count: number;
  sort_by: string;
  results: GridResultItem[];
  skipped: Array<{ params: Record<string, number>; reason: string }>;
}

export interface SensitivityRequest {
  template_id: string;
  symbol: string;
  start: string;
  end: string;
  frequency?: string;
  initial_cash?: number;
  data_provider?: string;
  base_params: Record<string, number>;
  param_ranges: Record<string, { start: number; end: number; samples: number }>;
  samples_per_param?: number;
}

export interface SensitivityPoint {
  value: number;
  cumulative_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

export interface SensitivityResultItem {
  param_name: string;
  title: string;
  impact_score: number;
  points: SensitivityPoint[];
}

export interface SensitivityResponse {
  template_id: string;
  symbol: string;
  total_points: number;
  valid_points: number;
  skipped_count: number;
  results: SensitivityResultItem[];
  skipped: Array<{ param_name: string; value: number; reason: string }>;
}

export interface SaveUserStrategyRequest {
  id: string;
  title: string;
  description: string;
  code: string;
  params_schema: Record<string, unknown>;
  overwrite?: boolean;
  version_note?: string;
  visibility?: string;
  tags?: string[];
  category?: string;
  forked_from?: string | null;
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
  deleteUserStrategy: (id: string) => apiClient.delete<void>(`/api/strategies/user/${id}`),
  listStrategyVersions: (id: string) =>
    apiClient.get<{ versions: StrategyVersionSummary[] }>(`/api/strategies/user/${id}/versions`),
  getStrategyVersion: (id: string, versionId: string) =>
    apiClient.get<StrategyVersionDetail>(`/api/strategies/user/${id}/versions/${versionId}`),
  restoreStrategyVersion: (id: string, versionId: string, versionNote?: string) =>
    apiClient.post<StrategyTemplate>(
      `/api/strategies/user/${id}/versions/${versionId}/restore`,
      { version_note: versionNote ?? "" },
    ),
  runBacktest: (payload: BacktestRunRequest) =>
    apiClient.post<BacktestRunEnvelope>("/api/backtests/runs", payload),
  listBacktestRuns: () =>
    apiClient.get<{ runs: BacktestRunSummary[] }>("/api/backtests/runs"),
  getBacktestRun: (runId: string) =>
    apiClient.get<BacktestRunEnvelope>(`/api/backtests/runs/${runId}`),

  // 策略导入导出
  exportStrategy: (strategyId: string) =>
    apiClient.post<StrategyExportPayload>("/api/strategies/export", {
      strategy_id: strategyId,
    }),
  importStrategy: (payload: StrategyExportPayload, overwrite?: boolean) =>
    apiClient.post<StrategyTemplate>("/api/strategies/import", {
      payload,
      overwrite: overwrite ?? false,
    }),

  // 可见性管理
  getVisibilityOptions: () =>
    apiClient.get<VisibilityOptions>("/api/strategies/visibility-options"),
  setVisibility: (strategyId: string, visibility: string) =>
    apiClient.put<StrategyTemplate>(
      `/api/strategies/user/${strategyId}/visibility`,
      { visibility },
    ),

  // 版本对比
  compareStrategyVersions: (strategyId: string) =>
    apiClient.get<VersionComparison>(`/api/strategies/user/${strategyId}/compare`),

  // 策略市场
  listMarketplaceStrategies: () =>
    apiClient.get<{ strategies: MarketplaceStrategy[] }>("/api/strategies/marketplace"),

  // 标签与分类
  listAllTags: () => apiClient.get<{ tags: string[] }>("/api/strategies/tags"),
  listCategories: () =>
    apiClient.get<{ categories: CategoryOption[] }>("/api/strategies/categories"),
  updateStrategyTags: (strategyId: string, tags: string[], category: string) =>
    apiClient.put<StrategyTemplate>(`/api/strategies/user/${strategyId}/tags`, {
      tags,
      category,
    }),

  // 参数优化
  runGridSearch: (payload: GridSearchRequest) =>
    apiClient.post<GridSearchResponse>("/api/optimization/grid-search", payload),
  runSensitivity: (payload: SensitivityRequest) =>
    apiClient.post<SensitivityResponse>("/api/optimization/sensitivity", payload),

  // 快速验证
  validateCode: (code: string) =>
    apiClient.post<{
      valid: boolean;
      errors: Array<{ type: string; message: string }>;
      warnings: Array<{ type: string; message: string }>;
      stats?: { bars_processed: number; orders_generated: number; final_value: number; trades: number };
    }>("/api/strategies/validate", { code }),

  // Fork 策略
  forkStrategy: (strategyId: string, newId: string, newTitle: string) =>
    apiClient.post<StrategyTemplate>(`/api/strategies/marketplace/${strategyId}/fork`, {
      new_id: newId,
      new_title: newTitle,
    }),

  // 评论
  listComments: (strategyId: string) =>
    apiClient.get<{ comments: StrategyComment[] }>(
      `/api/strategies/marketplace/${strategyId}/comments`,
    ),
  addComment: (strategyId: string, author: string, content: string) =>
    apiClient.post<StrategyComment>(`/api/strategies/marketplace/${strategyId}/comments`, {
      author,
      content,
    }),
  deleteComment: (strategyId: string, commentId: string) =>
    apiClient.delete<void>(`/api/strategies/marketplace/${strategyId}/comments/${commentId}`),
};
