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
import { fmtDateTime, fmtMoney, fmtPercent, tone } from "../utils/format";

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
