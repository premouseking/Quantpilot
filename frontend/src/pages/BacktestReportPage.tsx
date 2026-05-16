import React, { useMemo } from "react";
import {
  Card,
  Tag,
  Tabs,
  Descriptions,
  Skeleton,
  Alert,
  Result,
  Button,
  Empty,
  Space,
  Row,
  Col,
} from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftOutlined,
  RocketOutlined,
  CodeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { MetricsPanel } from "../components/MetricsPanel";
import { EquityChart } from "../components/EquityChart";
import { DrawdownChart } from "../components/DrawdownChart";
import { MonthlyHeatmap } from "../components/MonthlyHeatmap";
import { ReturnDistribution } from "../components/ReturnDistribution";
import { TradesTable } from "../components/TradesTable";
import { PriceWithTrades } from "../components/PriceWithTrades";
import { Sparkline } from "../components/Sparkline";
import { TradeProfitChart } from "../components/TradeProfitChart";
import { HoldingPeriodChart } from "../components/HoldingPeriodChart";
import { buildRoundTripTrades, summarizeRoundTrips } from "../utils/analytics";
import { fmtDateTime, fmtMoney, fmtPercent, tone } from "../utils/format";

const downloadText = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const escapeCsv = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const BacktestReportPage: React.FC = () => {
  const { runId = "" } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getBacktestRun(runId),
    enabled: Boolean(runId),
  });

  const report = runQuery.data?.report;
  const config = report?.config;
  const provider = config?.data_provider ?? "mock";

  const barsQuery = useQuery({
    queryKey: [
      "report-bars",
      provider,
      config?.symbol,
      config?.frequency,
      config?.start,
      config?.end,
    ],
    queryFn: () =>
      api.getBars(provider, {
        symbol: config!.symbol,
        start: config!.start,
        end: config!.end,
        frequency: config!.frequency,
        limit: 5000,
      }),
    enabled: Boolean(config),
  });

  const summary = useMemo(() => {
    if (!report) return null;
    const profit = report.summary.final_value - report.config.initial_cash;
    const profitPct = profit / report.config.initial_cash;
    return { profit, profitPct };
  }, [report]);

  const roundTrips = useMemo(
    () => (report ? buildRoundTripTrades(report.fills) : []),
    [report],
  );
  const tradeSummary = useMemo(
    () => summarizeRoundTrips(roundTrips),
    [roundTrips],
  );

  if (runQuery.isLoading) {
    return (
      <div className="qp-page">
        <PageHeader title="回测报告" />
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </div>
    );
  }

  if (runQuery.isError || !report) {
    return (
      <div className="qp-page">
        <PageHeader title="回测报告" />
        <Card>
          <Result
            status="404"
            title="找不到该回测"
            subTitle={`Run ${runId} 不存在或已被删除`}
            extra={
              <Button type="primary" onClick={() => navigate("/runs")}>
                返回记录列表
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const equity = report.equity_curve;
  const benchmark = report.benchmark_curve;
  const fills = report.fills;
  const orders = report.orders;
  const t = tone(report.metrics.cumulative_return);
  const heroAccent =
    t === "positive" ? "#3f6b48" : t === "negative" ? "#bd3f29" : "#1a1612";
  const equityValues = equity.map((p) => p.total_value);
  const sparkColor =
    t === "positive" ? "#3f6b48" : t === "negative" ? "#bd3f29" : "#1a1612";

  const exportJson = () => {
    downloadText(
      `${runId}-report.json`,
      JSON.stringify(runQuery.data, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const exportTradesCsv = () => {
    const header = [
      "id",
      "symbol",
      "entry_time",
      "exit_time",
      "quantity",
      "entry_price",
      "exit_price",
      "gross_pnl",
      "fees",
      "slippage",
      "net_pnl",
      "return_pct",
      "holding_days",
    ];
    const rows = roundTrips.map((trade) => [
      trade.id,
      trade.symbol,
      trade.entryTime,
      trade.exitTime,
      trade.quantity,
      trade.entryPrice,
      trade.exitPrice,
      trade.grossPnl,
      trade.fees,
      trade.slippage,
      trade.netPnl,
      trade.returnPct,
      trade.holdingDays,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");
    downloadText(`${runId}-round-trips.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <div className="qp-page">
      <PageHeader
        title={`回测报告 · ${config?.symbol}`}
        subtitle={
          <span className="qp-mono">
            run_id={runId} · created={fmtDateTime(runQuery.data?.created_at)}
          </span>
        }
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/runs")}>
              返回列表
            </Button>
            <Button icon={<DownloadOutlined />} onClick={exportJson}>
              导出报告
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={exportTradesCsv}
              disabled={roundTrips.length === 0}
            >
              导出交易
            </Button>
            <Link to={`/backtest?template=${config?.template_id ?? ""}`}>
              <Button type="primary" icon={<RocketOutlined />}>
                复用配置
              </Button>
            </Link>
          </Space>
        }
        badge={
          <Tag
            color={t === "positive" ? "green" : t === "negative" ? "red" : "default"}
            style={{ fontSize: 12 }}
          >
            {fmtPercent(report.metrics.cumulative_return)}
          </Tag>
        }
      />

      <div className="qp-hero">
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={14}>
            <div className="qp-hero__eyebrow">
              回 测 报 告 · BACKTEST REPORT
            </div>
            <Space size={6} wrap style={{ marginBottom: 8 }}>
              <Tag bordered={false}>{config?.symbol}</Tag>
              <Tag bordered={false}>{config?.frequency}</Tag>
              {config?.template_id && (
                <Tag bordered={false} color="default">
                  {config.template_id}
                </Tag>
              )}
              <span className="qp-mono" style={{ fontSize: 12 }}>
                {config?.start.slice(0, 10)} → {config?.end.slice(0, 10)}
              </span>
            </Space>
            <div
              className="qp-hero__title qp-serif"
              style={{ marginTop: 4, fontSize: 30 }}
            >
              累计收益{" "}
              <span style={{ color: heroAccent }}>
                {fmtPercent(report.metrics.cumulative_return)}
              </span>
            </div>
            <div className="qp-hero__sub">
              年化 {fmtPercent(report.metrics.annualized_return)} · 夏普{" "}
              {report.metrics.sharpe_ratio.toFixed(2)} · 索提诺{" "}
              {report.metrics.sortino_ratio.toFixed(2)} · 卡尔马{" "}
              {report.metrics.calmar_ratio.toFixed(2)} · 最大回撤{" "}
              <span className="qp-negative">
                {fmtPercent(report.metrics.max_drawdown)}
              </span>
            </div>
            <div className="qp-hero__metrics">
              <div>
                <div className="qp-hero__metric-label">期末资金</div>
                <div className="qp-hero__metric-value">
                  {fmtMoney(report.summary.final_value)}
                </div>
              </div>
              <div>
                <div className="qp-hero__metric-label">盈亏</div>
                <div
                  className={`qp-hero__metric-value ${
                    (summary?.profit ?? 0) >= 0
                      ? "qp-hero__metric-value--gain"
                      : "qp-hero__metric-value--loss"
                  }`}
                >
                  {fmtMoney(summary?.profit ?? 0)}
                </div>
              </div>
              <div>
                <div className="qp-hero__metric-label">交易 / 胜率</div>
                <div className="qp-hero__metric-value">
                  {report.metrics.trade_count} /{" "}
                  {fmtPercent(report.metrics.win_rate)}
                </div>
              </div>
              <div>
                <div className="qp-hero__metric-label">基准</div>
                <div className="qp-hero__metric-value">
                  {config?.benchmark_symbol ?? "—"}
                </div>
              </div>
            </div>
          </Col>
          <Col xs={24} md={10}>
            <div
              style={{
                position: "relative",
                background: "#fbf6e6",
                padding: 16,
                border: "1px solid #dccfb2",
                borderLeft: "2px solid #1a1612",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#544a40",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 8,
                }}
              >
                EQUITY PREVIEW
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkline
                  values={equityValues}
                  width={360}
                  height={92}
                  stroke={sparkColor}
                  fill={sparkColor + "1a"}
                  strokeWidth={1.6}
                  baselineColor="rgba(26, 22, 18, 0.18)"
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#8a7f6f",
                  marginTop: 6,
                  paddingTop: 8,
                  borderTop: "1px dotted #c4b48f",
                }}
                className="qp-mono"
              >
                <span>{config?.start.slice(0, 10)}</span>
                <span>{config?.end.slice(0, 10)}</span>
              </div>
            </div>
          </Col>
        </Row>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="overview"
          items={[
            {
              key: "overview",
              label: "总览",
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <MetricsPanel metrics={report.metrics} />
                  <Card type="inner" title="资金曲线">
                    <EquityChart equityCurve={equity} benchmarkCurve={benchmark} />
                  </Card>
                  <Card type="inner" title="回撤曲线">
                    <DrawdownChart equityCurve={equity} />
                  </Card>
                </div>
              ),
            },
            {
              key: "distribution",
              label: "收益分布",
              children: (
                <div style={{ display: "grid", gap: 16 }}>
                  <Card type="inner" title="月度收益热力图">
                    <MonthlyHeatmap equityCurve={equity} />
                  </Card>
                  <Card type="inner" title="日收益分布直方图">
                    <ReturnDistribution equityCurve={equity} />
                  </Card>
                </div>
              ),
            },
            {
              key: "trades",
              label: `交易 (${fills.length})`,
              children: (
                <div style={{ display: "grid", gap: 16 }}>
                  <Row gutter={[12, 12]}>
                    <Col xs={12} md={6}>
                      <div className="qp-kpi">
                        <span className="qp-kpi__label">已平仓笔数</span>
                        <span className="qp-kpi__value">{tradeSummary.count}</span>
                        <span className="qp-kpi__delta">
                          胜 {tradeSummary.winCount} / 负 {tradeSummary.lossCount}
                        </span>
                      </div>
                    </Col>
                    <Col xs={12} md={6}>
                      <div
                        className={`qp-kpi ${
                          tradeSummary.totalNetPnl >= 0
                            ? "qp-kpi--positive"
                            : "qp-kpi--negative"
                        }`}
                      >
                        <span className="qp-kpi__label">已实现净收益</span>
                        <span className="qp-kpi__value">
                          {fmtMoney(tradeSummary.totalNetPnl)}
                        </span>
                        <span className="qp-kpi__delta">
                          平均 {fmtMoney(tradeSummary.avgNetPnl)}
                        </span>
                      </div>
                    </Col>
                    <Col xs={12} md={6}>
                      <div className="qp-kpi">
                        <span className="qp-kpi__label">单笔最好 / 最差</span>
                        <span className="qp-kpi__value">
                          {fmtMoney(tradeSummary.bestNetPnl)}
                        </span>
                        <span className="qp-kpi__delta">
                          最差 {fmtMoney(tradeSummary.worstNetPnl)}
                        </span>
                      </div>
                    </Col>
                    <Col xs={12} md={6}>
                      <div className="qp-kpi">
                        <span className="qp-kpi__label">平均持仓</span>
                        <span className="qp-kpi__value">
                          {tradeSummary.avgHoldingDays.toFixed(1)} 天
                        </span>
                        <span className="qp-kpi__delta">
                          最长 {tradeSummary.maxHoldingDays.toFixed(1)} 天
                        </span>
                      </div>
                    </Col>
                  </Row>
                  <Card type="inner" title="买卖点位">
                    {barsQuery.isLoading ? (
                      <Skeleton active paragraph={{ rows: 6 }} />
                    ) : barsQuery.data && barsQuery.data.bars.length > 0 ? (
                      <PriceWithTrades bars={barsQuery.data.bars} fills={fills} />
                    ) : (
                      <Alert
                        type="warning"
                        showIcon
                        message="无法加载行情数据，跳过买卖点图。"
                      />
                    )}
                  </Card>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card type="inner" title="每笔交易收益分析">
                        <TradeProfitChart trades={roundTrips} />
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card type="inner" title="持仓时间分布">
                        <HoldingPeriodChart trades={roundTrips} />
                      </Card>
                    </Col>
                  </Row>
                  <Card type="inner" title="已平仓交易明细">
                    {roundTrips.length === 0 ? (
                      <Empty description="暂无完整买卖配对交易" />
                    ) : (
                      <Row gutter={[12, 12]}>
                        {roundTrips.slice(0, 12).map((trade, index) => (
                          <Col xs={24} md={12} xl={8} key={trade.id}>
                            <div
                              className={`qp-kpi ${
                                trade.netPnl >= 0
                                  ? "qp-kpi--positive"
                                  : "qp-kpi--negative"
                              }`}
                            >
                              <span className="qp-kpi__label">
                                #{index + 1} {trade.symbol} ·{" "}
                                {trade.entryTime.slice(0, 10)} →{" "}
                                {trade.exitTime.slice(0, 10)}
                              </span>
                              <span className="qp-kpi__value">
                                {fmtMoney(trade.netPnl)}
                              </span>
                              <span className="qp-kpi__delta">
                                {fmtPercent(trade.returnPct)} ·{" "}
                                {trade.holdingDays.toFixed(1)} 天 ·{" "}
                                {trade.quantity.toLocaleString()} 股
                              </span>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    )}
                  </Card>
                  <Card type="inner" title="成交明细">
                    {fills.length === 0 ? (
                      <Empty description="本次回测没有产生成交" />
                    ) : (
                      <TradesTable fills={fills} />
                    )}
                  </Card>
                </div>
              ),
            },
            {
              key: "orders",
              label: `订单 (${orders.length})`,
              children: (
                <Card type="inner">
                  {orders.length === 0 ? (
                    <Empty description="本次回测没有产生订单" />
                  ) : (
                    <pre className="qp-mono" style={{ maxHeight: 400, overflow: "auto" }}>
                      {JSON.stringify(orders, null, 2)}
                    </pre>
                  )}
                </Card>
              ),
            },
            {
              key: "config",
              label: "配置",
              children: (
                <Card type="inner">
                  <Descriptions
                    bordered
                    size="small"
                    column={2}
                    labelStyle={{ width: 140 }}
                  >
                    <Descriptions.Item label="标的">{config?.symbol}</Descriptions.Item>
                    <Descriptions.Item label="频率">{config?.frequency}</Descriptions.Item>
                    <Descriptions.Item label="开始">
                      {fmtDateTime(config?.start)}
                    </Descriptions.Item>
                    <Descriptions.Item label="结束">
                      {fmtDateTime(config?.end)}
                    </Descriptions.Item>
                    <Descriptions.Item label="数据源">
                      {config?.data_provider ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="策略模板">
                      {config?.template_id ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="初始资金">
                      {fmtMoney(config?.initial_cash)}
                    </Descriptions.Item>
                    <Descriptions.Item label="基准">
                      {config?.benchmark_symbol ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="佣金率">
                      {fmtPercent(config?.cost_model.commission_rate)}
                    </Descriptions.Item>
                    <Descriptions.Item label="印花税率">
                      {fmtPercent(config?.cost_model.stamp_tax_rate)}
                    </Descriptions.Item>
                    <Descriptions.Item label="滑点 (bps)">
                      {config?.cost_model.slippage_bps}
                    </Descriptions.Item>
                    <Descriptions.Item label="最低佣金">
                      {fmtMoney(config?.cost_model.min_commission)}
                    </Descriptions.Item>
                  </Descriptions>
                  <div style={{ marginTop: 16 }}>
                    <div className="qp-section-title">
                      <CodeOutlined style={{ marginRight: 6 }} />
                      策略参数
                    </div>
                    <pre className="qp-mono" style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                      {JSON.stringify(config?.strategy_params ?? {}, null, 2)}
                    </pre>
                  </div>
                </Card>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default BacktestReportPage;
