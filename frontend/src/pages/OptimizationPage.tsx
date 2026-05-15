/**
 * 参数优化页
 *
 * 支持网格搜索（同步 + SSE 实时流）与参数敏感性分析。
 */
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  ExperimentOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import dayjs, { Dayjs } from "dayjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  GridResultItem,
  GridSearchRequest,
  SensitivityResultItem,
} from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { fmtPercent } from "../utils/format";
import { QPColors } from "../theme";
import { runtimeConfig } from "../runtimeConfig";

interface SchemaProperty {
  type?: string;
  title?: string;
  default?: number;
  minimum?: number;
  maximum?: number;
}

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

interface FormValues {
  templateId: string;
  provider: string;
  symbol: string;
  range: [Dayjs, Dayjs];
  initialCash: number;
}

const DEFAULTS: FormValues = {
  templateId: "dual_ma",
  provider: "mock",
  symbol: "MOCK001",
  range: [dayjs("2023-01-01"), dayjs("2024-12-31")],
  initialCash: 1_000_000,
};

// ── SSE 流式通用工具 ─────────────────────────────────────────

interface StreamProgress {
  type: "progress" | "complete";
  completed: number;
  total: number;
  result?: GridResultItem;
  results?: GridResultItem[];
  valid_count?: number;
  skipped_count?: number;
  skipped?: Array<{ params: Record<string, number>; reason: string }>;
}

async function* streamSseEndpoint(
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const url = `${runtimeConfig.apiBaseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          yield JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
        } catch {
          // skip malformed
        }
      }
    }
  }
}

// ── 辅助组件 ────────────────────────────────────────────────

const GridParamEditor: React.FC<{
  params: Record<string, { start: number; end: number; step: number }>;
  onChange: (params: Record<string, { start: number; end: number; step: number }>) => void;
  schemaProperties: Record<string, SchemaProperty>;
}> = ({ params, onChange, schemaProperties }) => {
  const update = (key: string, field: "start" | "end" | "step", value: number | null) => {
    if (value == null) return;
    onChange({ ...params, [key]: { ...params[key], [field]: value } });
  };
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {Object.entries(params).map(([key, range]) => {
        const prop = schemaProperties[key] ?? {};
        return (
          <Card key={key} size="small" title={prop.title ?? key}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item label="起始" style={{ marginBottom: 0 }}>
                  <InputNumber value={range.start} onChange={(v) => update(key, "start", v)} min={prop.minimum ?? 1} max={range.end} step={prop.type === "integer" ? 1 : 0.1} style={{ width: "100%" }} size="small" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="结束" style={{ marginBottom: 0 }}>
                  <InputNumber value={range.end} onChange={(v) => update(key, "end", v)} min={range.start} max={prop.maximum ?? 200} step={prop.type === "integer" ? 1 : 0.1} style={{ width: "100%" }} size="small" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="步长" style={{ marginBottom: 0 }}>
                  <InputNumber value={range.step} onChange={(v) => update(key, "step", v)} min={prop.type === "integer" ? 1 : 0.01} step={prop.type === "integer" ? 1 : 0.1} style={{ width: "100%" }} size="small" />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        );
      })}
    </Space>
  );
};

const SensitivityParamEditor: React.FC<{
  baseParams: Record<string, number>;
  ranges: Record<string, { start: number; end: number; samples: number }>;
  onChangeBase: (p: Record<string, number>) => void;
  onChangeRanges: (r: Record<string, { start: number; end: number; samples: number }>) => void;
  schemaProperties: Record<string, SchemaProperty>;
}> = ({ baseParams, ranges, onChangeBase, onChangeRanges, schemaProperties }) => (
  <Space direction="vertical" size={12} style={{ width: "100%" }}>
    {Object.entries(ranges).map(([key, range]) => {
      const prop = schemaProperties[key] ?? {};
      return (
        <Card key={key} size="small" title={prop.title ?? key}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="基准值" style={{ marginBottom: 0 }}>
                <InputNumber value={baseParams[key]} onChange={(v) => onChangeBase({ ...baseParams, [key]: v ?? prop.default ?? 0 })} min={prop.minimum} max={prop.maximum} step={prop.type === "integer" ? 1 : 0.1} style={{ width: "100%" }} size="small" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="范围起" style={{ marginBottom: 0 }}>
                <InputNumber value={range.start} onChange={(v) => onChangeRanges({ ...ranges, [key]: { ...range, start: v ?? 1 } })} min={prop.minimum ?? 1} max={range.end} size="small" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="范围止" style={{ marginBottom: 0 }}>
                <InputNumber value={range.end} onChange={(v) => onChangeRanges({ ...ranges, [key]: { ...range, end: v ?? 100 } })} min={range.start} size="small" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label="采样数" style={{ marginBottom: 0 }}>
                <InputNumber value={range.samples} onChange={(v) => onChangeRanges({ ...ranges, [key]: { ...range, samples: v ?? 5 } })} min={3} max={30} step={1} size="small" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      );
    })}
  </Space>
);

// ── 主页面 ───────────────────────────────────────────────────

const OptimizationPage: React.FC = () => {
  const [form] = Form.useForm<FormValues>();
  const [activeTab, setActiveTab] = useState("grid");
  const [streamMode, setStreamMode] = useState(true);
  const [sensMode, setSensMode] = useState(true);

  const watchedTemplateId = Form.useWatch("templateId", form) ?? DEFAULTS.templateId;
  const watchedProvider = Form.useWatch("provider", form) ?? DEFAULTS.provider;
  const watchedSymbol = Form.useWatch("symbol", form) ?? DEFAULTS.symbol;
  const watchedRange = Form.useWatch("range", form) ?? DEFAULTS.range;
  const watchedCash = Form.useWatch("initialCash", form) ?? DEFAULTS.initialCash;

  const templatesQuery = useQuery({ queryKey: ["templates"], queryFn: api.listStrategyTemplates });
  const templates = templatesQuery.data?.templates ?? [];
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: api.listProviders });
  const symbolsQuery = useQuery({
    queryKey: ["symbols", watchedProvider],
    queryFn: () => api.listSymbols(watchedProvider),
    enabled: Boolean(watchedProvider),
  });

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === watchedTemplateId), [templates, watchedTemplateId]);
  const schemaProps = useMemo(() => {
    const props = (selectedTemplate?.params_schema ?? {}) as {
      properties?: Record<string, SchemaProperty>;
    };
    return props.properties ?? {};
  }, [selectedTemplate]);

  // ── 网格参数 ──
  const defaultGridParams = useMemo(() => {
    const r: Record<string, { start: number; end: number; step: number }> = {};
    Object.entries(schemaProps).forEach(([key, prop]) => {
      const d = prop.default ?? 10;
      r[key] = {
        start: prop.minimum ?? Math.max(1, Math.floor(d * 0.5)),
        end: prop.maximum ?? Math.floor(d * 2),
        step: prop.type === "integer" ? 1 : Math.max(0.5, d * 0.1),
      };
    });
    return r;
  }, [schemaProps]);
  const [gridParams, setGridParams] = useState(defaultGridParams);
  React.useEffect(() => setGridParams(defaultGridParams), [defaultGridParams]);

  // ── 流式状态 ──
  const [streaming, setStreaming] = useState(false);
  const [sensStreaming, setSensStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamTotal, setStreamTotal] = useState(0);
  const [sensStreamProgress, setSensStreamProgress] = useState(0);
  const [sensStreamTotal, setSensStreamTotal] = useState(0);
  const [streamResults, setStreamResults] = useState<GridResultItem[]>([]);
  const [streamSkipped, setStreamSkipped] = useState<Array<{ params: Record<string, number>; reason: string }>>([]);
  const [sensStreamSkipped, setSensStreamSkipped] = useState<Array<{ param_name: string; value: number; reason: string }>>([]);
  const [streamComplete, setStreamComplete] = useState(false);
  const [sensStreamComplete, setSensStreamComplete] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sensAbortRef = useRef<AbortController | null>(null);

  // ── 流式敏感度结果 ──
  const [sensStreamResults, setSensStreamResults] = useState<SensitivityResultItem[]>([]);

  // ── 同步网格搜索 ──
  const gridMutation = useMutation({
    mutationFn: () => {
      const paramGrid: Record<string, number[]> = {};
      Object.entries(gridParams).forEach(([key, range]) => {
        const values: number[] = [];
        for (let v = range.start; v <= range.end + range.step * 0.01; v += range.step) {
          values.push(schemaProps[key]?.type === "integer" ? Math.round(v) : parseFloat(v.toFixed(4)));
        }
        paramGrid[key] = values;
      });
      const [start, end] = watchedRange;
      return api.runGridSearch({
        template_id: watchedTemplateId,
        symbol: watchedSymbol,
        start: start.startOf("day").toISOString(),
        end: end.endOf("day").toISOString(),
        initial_cash: watchedCash,
        data_provider: watchedProvider,
        param_grid: paramGrid,
        sort_by: "sharpe_ratio",
      });
    },
  });

  // ── 网格搜索参数展开 ──
  const buildGridPayload = (): GridSearchRequest => {
    const paramGrid: Record<string, number[]> = {};
    Object.entries(gridParams).forEach(([key, range]) => {
      const values: number[] = [];
      for (let v = range.start; v <= range.end + range.step * 0.01; v += range.step) {
        values.push(schemaProps[key]?.type === "integer" ? Math.round(v) : parseFloat(v.toFixed(4)));
      }
      paramGrid[key] = values;
    });
    const [start, end] = watchedRange;
    return {
      template_id: watchedTemplateId,
      symbol: watchedSymbol,
      start: start.startOf("day").toISOString(),
      end: end.endOf("day").toISOString(),
      initial_cash: watchedCash,
      data_provider: watchedProvider,
      param_grid: paramGrid,
      sort_by: "sharpe_ratio",
    };
  };

  // ── 启动 / 取消流式搜索 ──
  const startStreamSearch = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setStreamProgress(0);
    setStreamResults([]);
    setStreamSkipped([]);
    setStreamComplete(false);

    try {
      const stream = streamSseEndpoint("/api/optimization/grid-search/stream", buildGridPayload(), controller.signal);
      for await (const evt of stream) {
        setStreamProgress(evt.completed as number);
        setStreamTotal(evt.total as number);
        if (evt.result) setStreamResults((prev) => [...prev, evt.result as GridResultItem]);
        if (evt.type === "complete") {
          if (evt.results) setStreamResults(evt.results as GridResultItem[]);
          if (evt.skipped) setStreamSkipped(evt.skipped as Array<{ params: Record<string, number>; reason: string }>);
          setStreamComplete(true);
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancelStreamSearch = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  // ── 敏感性流式搜索 ──
  const startSensStream = async () => {
    const [start, end] = watchedRange;
    const controller = new AbortController();
    sensAbortRef.current = controller;
    setSensStreaming(true);
    setSensStreamProgress(0);
    setSensStreamResults([]);
    setSensStreamSkipped([]);
    setSensStreamComplete(false);

    try {
      const stream = streamSseEndpoint("/api/optimization/sensitivity/stream", {
        template_id: watchedTemplateId,
        symbol: watchedSymbol,
        start: start.startOf("day").toISOString(),
        end: end.endOf("day").toISOString(),
        initial_cash: watchedCash,
        data_provider: watchedProvider,
        base_params: baseParams,
        param_ranges: sensRanges,
        samples_per_param: 8,
      }, controller.signal);

      for await (const evt of stream) {
        setSensStreamProgress(evt.completed as number);
        setSensStreamTotal(evt.total as number);
        if (evt.type === "complete") {
          if (evt.results) setSensStreamResults(evt.results as SensitivityResultItem[]);
          if (evt.skipped) setSensStreamSkipped(evt.skipped as Array<{ param_name: string; value: number; reason: string }>);
          setSensStreamComplete(true);
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
    } finally {
      setSensStreaming(false);
      sensAbortRef.current = null;
    }
  };

  const cancelSensStream = () => {
    sensAbortRef.current?.abort();
    setSensStreaming(false);
  };

  // ── 热力图 ──
  const results = streamMode ? streamResults : (gridMutation.data?.results ?? []);
  const skippedCount = streamMode ? streamSkipped.length : (gridMutation.data?.skipped_count ?? 0);
  const totalCombos = streamMode ? streamTotal : (gridMutation.data?.total_combinations ?? 0);
  const validCount = streamMode ? (streamComplete ? streamResults.length : streamResults.length) : (gridMutation.data?.valid_count ?? 0);

  const heatmapOption = useMemo(() => {
    if (results.length === 0) return {};
    const paramKeys = Object.keys(gridParams);
    if (paramKeys.length < 2) return {};
    const [keyX, keyY] = paramKeys;
    const xValues = [...new Set(results.map((r) => r.params[keyX]))].sort((a, b) => a - b);
    const yValues = [...new Set(results.map((r) => r.params[keyY]))].sort((a, b) => a - b);
    const data: [number, number, number][] = results.map((r) => {
      const xi = xValues.indexOf(r.params[keyX]);
      const yi = yValues.indexOf(r.params[keyY]);
      return [xi, yi, r.sharpe_ratio];
    });
    const sharpeValues = results.map((r) => r.sharpe_ratio);
    const maxAbs = Math.max(Math.abs(Math.max(...sharpeValues)), Math.abs(Math.min(...sharpeValues)), 1);
    return {
      tooltip: {
        formatter: (p: { data: [number, number, number] }) => {
          const [xi, yi, v] = p.data;
          return `${keyX}=${xValues[xi]}, ${keyY}=${yValues[yi]}<br/>Sharpe: ${v.toFixed(3)}`;
        },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 40 },
      xAxis: { type: "category", data: xValues, name: schemaProps[keyX]?.title ?? keyX, nameLocation: "center", nameGap: 8 },
      yAxis: { type: "category", data: yValues, name: schemaProps[keyY]?.title ?? keyY, nameLocation: "center", nameGap: 20 },
      visualMap: { min: -maxAbs, max: maxAbs, inRange: { color: ["#bd3f29", "#fdf9ee", "#3f6b48"] }, calculable: true, orient: "horizontal", bottom: 0 },
      series: [{ type: "heatmap", data, label: { show: true, fontSize: 10, formatter: (p: { data: [number, number, number] }) => p.data[2].toFixed(2) }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" } } }],
    };
  }, [results, gridParams, schemaProps]);

  // ── 敏感性 ──
  const [baseParams, setBaseParams] = useState<Record<string, number>>({});
  const [sensRanges, setSensRanges] = useState<Record<string, { start: number; end: number; samples: number }>>({});
  const defaultBaseParams = useMemo(() => {
    const r: Record<string, number> = {};
    Object.entries(schemaProps).forEach(([k, p]) => { r[k] = p.default ?? 10; });
    return r;
  }, [schemaProps]);
  const defaultSensRanges = useMemo(() => {
    const r: Record<string, { start: number; end: number; samples: number }> = {};
    Object.entries(schemaProps).forEach(([k, p]) => {
      const d = p.default ?? 10;
      r[k] = { start: p.minimum ?? Math.max(1, Math.floor(d * 0.3)), end: p.maximum ?? Math.floor(d * 2), samples: 8 };
    });
    return r;
  }, [schemaProps]);
  React.useEffect(() => { setBaseParams(defaultBaseParams); setSensRanges(defaultSensRanges); }, [defaultBaseParams, defaultSensRanges]);

  const sensMutation = useMutation({
    mutationFn: () => {
      const [start, end] = watchedRange;
      return api.runSensitivity({
        template_id: watchedTemplateId, symbol: watchedSymbol,
        start: start.startOf("day").toISOString(), end: end.endOf("day").toISOString(),
        initial_cash: watchedCash, data_provider: watchedProvider,
        base_params: baseParams, param_ranges: sensRanges, samples_per_param: 8,
      });
    },
  });

  const sensResultsForDisplay = sensMode ? sensStreamResults : (sensMutation.data?.results ?? []);

  const sensChartOption = useMemo(() => {
    const sensResults = sensResultsForDisplay;
    if (sensResults.length === 0) return {};
    return {
      tooltip: { trigger: "axis" },
      legend: { data: sensResults.map((r) => r.title), bottom: 0 },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: { type: "category", name: "参数值", nameLocation: "center", nameGap: 8, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: "夏普比率" },
      series: sensResults.map((r) => ({
        name: r.title, type: "line",
        data: r.points.map((p) => ({ value: p.sharpe_ratio, name: String(p.value) })),
        symbol: "circle", symbolSize: 6, lineStyle: { width: 2 },
      })),
      color: [QPColors.vermilion, QPColors.gain, "#c4942f", "#4a7c9b"],
    };
  }, [sensResultsForDisplay]);

  const estimatedCombinations = useMemo(() => {
    let total = 1;
    Object.values(gridParams).forEach((range) => {
      total *= Math.max(1, Math.floor((range.end - range.start) / range.step) + 1);
    });
    return total;
  }, [gridParams]);

  const topResults = useMemo(() => {
    return [...results].sort((a, b) => (b.sharpe_ratio ?? 0) - (a.sharpe_ratio ?? 0)).slice(0, 10);
  }, [results]);

  return (
    <div className="qp-page">
      <PageHeader
        title="参数优化"
        subtitle="网格搜索（同步 / 实时流）与参数敏感性分析。"
        badge={<Tag icon={<ExperimentOutlined />} color="volcano" bordered={false}>策略优化</Tag>}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="优化配置" size="small">
            <Form form={form} layout="vertical" initialValues={DEFAULTS} size="small">
              <Form.Item label="策略模板" name="templateId">
                <Select loading={templatesQuery.isLoading} options={templates.map((t) => ({ value: t.id, label: `${t.title} (${t.id})` }))} />
              </Form.Item>
              <Form.Item label="数据源" name="provider">
                <Select options={(providersQuery.data?.providers ?? []).map((p) => ({ value: p, label: p }))} />
              </Form.Item>
              <Form.Item label="标的" name="symbol">
                <Select showSearch options={(symbolsQuery.data?.symbols ?? []).map((s) => ({ value: s, label: s }))} />
              </Form.Item>
              <Form.Item label="时间范围" name="range">
                <RangePicker style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="初始资金" name="initialCash">
                <InputNumber min={10000} step={100000} style={{ width: "100%" }} />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: "grid",
                label: "网格搜索",
                children: (
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <Alert
                      type="info"
                      showIcon
                      message={`预计 ${estimatedCombinations} 次回测 · ${Object.keys(gridParams).length} 个参数维度 · 无效组合自动跳过`}
                      action={
                        <Space size={4}>
                          <Tag bordered={false} color={streamMode ? "volcano" : "default"} onClick={() => setStreamMode(true)} style={{ cursor: "pointer" }}>实时流</Tag>
                          <Tag bordered={false} color={!streamMode ? "volcano" : "default"} onClick={() => setStreamMode(false)} style={{ cursor: "pointer" }}>同步</Tag>
                        </Space>
                      }
                    />

                    <GridParamEditor params={gridParams} onChange={setGridParams} schemaProperties={schemaProps} />

                    {streamMode ? (
                      <Space direction="vertical" size={12} style={{ width: "100%" }}>
                        {streaming ? (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <Progress percent={streamTotal > 0 ? Math.round((streamProgress / streamTotal) * 100) : 0} style={{ flex: 1, marginBottom: 0 }} status="active" />
                              <Button icon={<PauseCircleOutlined />} danger onClick={cancelStreamSearch}>取消</Button>
                            </div>
                            <Text type="secondary">
                              进度：{streamProgress}/{streamTotal}
                              {streamSkipped.length > 0 && <span style={{ marginLeft: 12, color: QPColors.ochre }}>已跳过 {streamSkipped.length} 组无效参数</span>}
                            </Text>
                            {streamResults.length > 0 && (
                              <Card size="small" title={`实时结果（${streamResults.length} 个有效组合）`}>
                                <Table<GridResultItem>
                                  dataSource={[...streamResults].sort((a, b) => (b.sharpe_ratio ?? 0) - (a.sharpe_ratio ?? 0)).slice(0, 10)}
                                  rowKey={(r) => JSON.stringify(r.params)}
                                  size="small" pagination={false}
                                  columns={[
                                    { title: "参数", key: "p", render: (_, r) => Object.entries(r.params).map(([k, v]) => <Tag key={k} bordered={false}>{k}={v}</Tag>) },
                                    { title: "Sharpe", dataIndex: "sharpe_ratio", key: "s", align: "right", render: (v: number) => v?.toFixed(3) },
                                    { title: "累计收益", dataIndex: "cumulative_return", key: "c", align: "right", render: (v: number) => fmtPercent(v) },
                                    { title: "最大回撤", dataIndex: "max_drawdown", key: "m", align: "right", render: (v: number) => fmtPercent(v) },
                                  ]}
                                />
                              </Card>
                            )}
                          </>
                        ) : streamComplete ? (
                          <Alert type="success" showIcon message="搜索完成" />
                        ) : (
                          <Button type="primary" icon={<ThunderboltOutlined />} block onClick={startStreamSearch}>
                            启动实时流搜索（预计 {estimatedCombinations} 次回测）
                          </Button>
                        )}
                      </Space>
                    ) : (
                      <>
                        <Button type="primary" icon={<ThunderboltOutlined />} loading={gridMutation.isPending} onClick={() => gridMutation.mutate()} block>
                          执行网格搜索（预计 {estimatedCombinations} 次回测）
                        </Button>
                        {gridMutation.isPending && <Text type="secondary">正在执行网格搜索，请耐心等待...</Text>}
                      </>
                    )}

                    {/* 共享结果展示 */}
                    {results.length > 0 && (streamMode ? streamComplete || !streaming : gridMutation.data) && (
                      <>
                        <Row gutter={12}>
                          <Col span={6}><Statistic title="组合数" value={totalCombos} suffix={skippedCount > 0 ? <Tag color="warning" style={{ marginLeft: 4 }}>跳过 {skippedCount}</Tag> : undefined} /></Col>
                          <Col span={6}><Statistic title="最优 Sharpe" value={topResults[0]?.sharpe_ratio ?? 0} precision={3} /></Col>
                          <Col span={6}><Statistic title="最优收益" value={topResults[0]?.cumulative_return != null ? `${(topResults[0].cumulative_return * 100).toFixed(2)}%` : "-"} valueStyle={{ color: (topResults[0]?.cumulative_return ?? 0) >= 0 ? "#3f6b48" : "#bd3f29" }} /></Col>
                          <Col span={6}><Statistic title="平均 Sharpe" value={results.length > 0 ? results.reduce((a, b) => a + (b.sharpe_ratio ?? 0), 0) / results.length : 0} precision={3} /></Col>
                        </Row>

                        {(streamMode ? streamSkipped : gridMutation.data?.skipped) && (streamMode ? streamSkipped.length : (gridMutation.data?.skipped?.length ?? 0)) > 0 && (
                          <Card size="small" title={`已跳过 ${streamMode ? streamSkipped.length : gridMutation.data?.skipped?.length} 个无效组合`}>
                            <Table
                              dataSource={streamMode ? streamSkipped : (gridMutation.data?.skipped ?? [])}
                              rowKey={(r) => JSON.stringify(r.params)}
                              size="small" pagination={{ pageSize: 5 }}
                              columns={[
                                { title: "参数", key: "p", render: (_, r) => Object.entries(r.params).map(([k, v]) => <Tag key={k} bordered={false}>{k}={v}</Tag>) },
                                { title: "跳过原因", dataIndex: "reason", key: "r", ellipsis: true },
                              ]}
                            />
                          </Card>
                        )}

                        {Object.keys(gridParams).length >= 2 && results.length >= 4 && (
                          <Card size="small" title="夏普比率热力图">
                            <ReactECharts option={heatmapOption} style={{ height: 320 }} />
                          </Card>
                        )}

                        <Card size="small" title={`Top ${Math.min(10, results.length)} 结果`}>
                          <Table<GridResultItem>
                            dataSource={topResults}
                            rowKey={(r) => JSON.stringify(r.params)}
                            size="small" pagination={false}
                            columns={[
                              { title: "参数", key: "p", render: (_, r) => Object.entries(r.params).map(([k, v]) => <Tag key={k} bordered={false}>{k}={v}</Tag>) },
                              { title: "Sharpe", dataIndex: "sharpe_ratio", key: "s", align: "right", render: (v: number) => v?.toFixed(3), sorter: (a, b) => a.sharpe_ratio - b.sharpe_ratio, defaultSortOrder: "descend" },
                              { title: "累计收益", dataIndex: "cumulative_return", key: "c", align: "right", render: (v: number) => fmtPercent(v) },
                              { title: "最大回撤", dataIndex: "max_drawdown", key: "m", align: "right", render: (v: number) => fmtPercent(v) },
                              { title: "交易次数", dataIndex: "trade_count", key: "t", align: "right" },
                            ]}
                          />
                        </Card>
                      </>
                    )}
                  </Space>
                ),
              },
              {
                key: "sensitivity",
                label: "敏感性分析",
                children: (
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <Alert
                      type="info"
                      showIcon
                      message="敏感性分析：固定其他参数为基准值，逐一沿参数轴采样，量化每个参数对夏普比率的影响程度。无效采样点自动跳过。"
                      action={
                        <Space size={4}>
                          <Tag bordered={false} color={sensMode ? "volcano" : "default"} onClick={() => setSensMode(true)} style={{ cursor: "pointer" }}>实时流</Tag>
                          <Tag bordered={false} color={!sensMode ? "volcano" : "default"} onClick={() => setSensMode(false)} style={{ cursor: "pointer" }}>同步</Tag>
                        </Space>
                      }
                    />
                    <SensitivityParamEditor baseParams={baseParams} ranges={sensRanges} onChangeBase={setBaseParams} onChangeRanges={setSensRanges} schemaProperties={schemaProps} />
                    {sensMode ? (
                      <Space direction="vertical" size={12} style={{ width: "100%" }}>
                        {sensStreaming ? (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <Progress percent={sensStreamTotal > 0 ? Math.round((sensStreamProgress / sensStreamTotal) * 100) : 0} style={{ flex: 1, marginBottom: 0 }} status="active" />
                              <Button icon={<PauseCircleOutlined />} danger onClick={cancelSensStream}>取消</Button>
                            </div>
                            <Text type="secondary">进度：{sensStreamProgress}/{sensStreamTotal} 个采样点</Text>
                          </>
                        ) : sensStreamComplete ? (
                          <Alert type="success" showIcon message="分析完成" />
                        ) : (
                          <Button type="primary" icon={<ThunderboltOutlined />} block onClick={startSensStream}>启动实时流分析</Button>
                        )}
                      </Space>
                    ) : (
                      <>
                        <Button type="primary" icon={<PlayCircleOutlined />} loading={sensMutation.isPending} onClick={() => sensMutation.mutate()} block>执行敏感性分析</Button>
                        {sensMutation.isPending && <Text type="secondary">正在执行...</Text>}
                      </>
                    )}
                    {sensResultsForDisplay.length > 0 && (sensMode ? sensStreamComplete || !sensStreaming : sensMutation.data) && (
                      <>
                        {/* 跳过提示 */}
                        {((sensMode ? sensStreamSkipped.length : (sensMutation.data?.skipped_count ?? 0)) > 0) && (
                          <Card size="small" title={`已跳过 ${sensMode ? sensStreamSkipped.length : sensMutation.data?.skipped_count} 个无效采样点`}>
                            <Table
                              dataSource={sensMode ? sensStreamSkipped : (sensMutation.data?.skipped ?? [])}
                              rowKey={(r) => `${r.param_name}_${r.value}`}
                              size="small" pagination={{ pageSize: 5 }}
                              columns={[
                                { title: "参数", dataIndex: "param_name", key: "p", width: 120 },
                                { title: "值", dataIndex: "value", key: "v", align: "right", width: 80, render: (v: number) => typeof v === "number" && Number.isInteger(v) ? v : v?.toFixed(2) },
                                { title: "跳过原因", dataIndex: "reason", key: "r", ellipsis: true },
                              ]}
                            />
                          </Card>
                        )}
                        <Row gutter={12}>
                          {sensResultsForDisplay.map((r) => (
                            <Col span={Math.max(6, Math.floor(24 / sensResultsForDisplay.length))} key={r.param_name}>
                              <Statistic title={`${r.title} 影响度`} value={r.impact_score?.toFixed(3)}
                                valueStyle={{ color: r.impact_score === sensResultsForDisplay[0]?.impact_score ? QPColors.vermilion : QPColors.ink }} />
                            </Col>
                          ))}
                        </Row>
                        <Card size="small" title="敏感性曲线"><ReactECharts option={sensChartOption} style={{ height: 320 }} /></Card>
                        {sensResultsForDisplay.map((r) => (
                          <Card key={r.param_name} size="small" title={`${r.title} — 采样点`}>
                            <Table<SensitivityResultItem["points"][number]>
                              dataSource={r.points} rowKey="value" size="small" pagination={false}
                              columns={[
                                { title: "参数值", dataIndex: "value", key: "v", align: "right", render: (v: number) => typeof v === "number" && Number.isInteger(v) ? v : v?.toFixed(2) },
                                { title: "Sharpe", dataIndex: "sharpe_ratio", key: "s", align: "right", render: (v: number) => v?.toFixed(3) },
                                { title: "累计收益", dataIndex: "cumulative_return", key: "c", align: "right", render: (v: number) => fmtPercent(v) },
                                { title: "最大回撤", dataIndex: "max_drawdown", key: "m", align: "right", render: (v: number) => fmtPercent(v) },
                              ]}
                            />
                          </Card>
                        ))}
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Col>
      </Row>
    </div>
  );
};

export default OptimizationPage;
