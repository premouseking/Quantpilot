import React from "react";
import {
  Card,
  Tag,
  Empty,
  Row,
  Col,
  Button,
  Space,
  Skeleton,
  Tooltip,
} from "antd";
import {
  RocketOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  RiseOutlined,
  FallOutlined,
  CheckCircleFilled,
  WarningFilled,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api, BacktestRunSummary } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { Sparkline } from "../components/Sparkline";
import {
  fmtPercent,
  fmtMoney,
  fmtDateTime,
  fmtNumber,
  tone,
} from "../utils/format";
import { QPColors } from "../theme";

const QuickAction: React.FC<{
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = ({ to, title, description, icon }) => (
  <Link to={to}>
    <Card
      hoverable
      className="qp-clickable"
      styles={{ body: { padding: 18 } }}
      style={{ height: "100%" }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            background: "rgba(189, 63, 41, 0.08)",
            color: QPColors.vermilion,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            border: "1px solid rgba(189, 63, 41, 0.25)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
          <div style={{ color: QPColors.textSecondary, fontSize: 12, lineHeight: 1.6 }}>
            {description}
          </div>
        </div>
      </div>
    </Card>
  </Link>
);

interface RecentCardProps {
  run: BacktestRunSummary;
  values: number[];
  loading: boolean;
}

const RecentRunCard: React.FC<RecentCardProps> = ({ run, values, loading }) => {
  const ret = run.metrics?.cumulative_return ?? 0;
  const t = tone(ret);
  return (
    <Link to={`/runs/${run.run_id}`}>
      <Card
        hoverable
        className="qp-clickable"
        styles={{ body: { padding: 16 } }}
        style={{ height: "100%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Space size={4}>
            <Tag bordered={false} style={{ marginRight: 0 }}>
              {run.config?.symbol ?? "—"}
            </Tag>
            <Tag bordered={false}>{run.config?.frequency ?? "daily"}</Tag>
          </Space>
          <span
            className="qp-mono"
            style={{ fontSize: 11, color: QPColors.textMuted }}
          >
            {run.run_id.slice(0, 11)}
          </span>
        </div>
        <div
          className="qp-serif"
          style={{
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: "-0.3px",
            color:
              t === "positive"
                ? QPColors.success
                : t === "negative"
                  ? QPColors.danger
                  : QPColors.textPrimary,
          }}
        >
          {fmtPercent(ret)}
          {t === "positive" && <RiseOutlined style={{ marginLeft: 6, fontSize: 14 }} />}
          {t === "negative" && <FallOutlined style={{ marginLeft: 6, fontSize: 14 }} />}
        </div>
        <div style={{ marginTop: 6 }}>
          {loading ? (
            <Skeleton.Input active size="small" style={{ height: 28, width: "100%" }} />
          ) : (
            <Sparkline values={values} width={220} height={36} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: QPColors.textSecondary,
            marginTop: 8,
          }}
        >
          <span>夏普 {fmtNumber(run.metrics?.sharpe_ratio)}</span>
          <span>{fmtMoney(run.summary?.final_value)}</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: QPColors.textMuted,
            marginTop: 4,
          }}
        >
          {fmtDateTime(run.created_at)}
        </div>
      </Card>
    </Link>
  );
};

const DashboardPage: React.FC = () => {
  const runtimeQuery = useQuery({ queryKey: ["runtime"], queryFn: api.runtime, retry: 0 });
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 0 });
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: api.listProviders,
    retry: 0,
  });
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: api.listStrategyTemplates,
    retry: 0,
  });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.listBacktestRuns });

  const runs = runsQuery.data?.runs ?? [];
  const recent = runs.slice(0, 4);

  const recentDetailQueries = useQueries({
    queries: recent.map((run) => ({
      queryKey: ["run-detail", run.run_id],
      queryFn: () => api.getBacktestRun(run.run_id),
      staleTime: 60_000,
    })),
  });

  const stats = React.useMemo(() => {
    if (runs.length === 0) return null;
    const cumReturns = runs.map((r) => r.metrics?.cumulative_return ?? 0);
    const sharps = runs.map((r) => r.metrics?.sharpe_ratio ?? 0);
    const wins = runs.filter((r) => (r.metrics?.cumulative_return ?? 0) > 0).length;
    return {
      total: runs.length,
      bestReturn: Math.max(...cumReturns),
      bestSharpe: Math.max(...sharps),
      winRate: wins / runs.length,
      avgTrades: runs.reduce((s, r) => s + (r.metrics?.trade_count ?? 0), 0) / runs.length,
    };
  }, [runs]);

  return (
    <div className="qp-page">
      <PageHeader
        title="平台概览"
        subtitle="快速查看研究状态、最近回测和入口操作。"
        extra={
          <Link to="/backtest">
            <Button type="primary" size="large" icon={<RocketOutlined />}>
              开始新回测
            </Button>
          </Link>
        }
      />

      <div className="qp-hero">
        <div className="qp-hero__eyebrow">研 究 概 览 · OVERVIEW</div>
        <div className="qp-hero__title qp-serif">量化研究平台 · Quantpilot</div>
        <div className="qp-hero__sub">
          一站式股票量化研究台账。导入行情、编辑策略、运行事件驱动回测、留下可追溯的绩效报告。
          当前为 MVP 版本，参数优化、实时推送、策略协作位于路线图中。
        </div>
        <div className="qp-hero__metrics">
          <div>
            <div className="qp-hero__metric-label">累计回测</div>
            <div className="qp-hero__metric-value">{stats?.total ?? 0}</div>
          </div>
          <div>
            <div className="qp-hero__metric-label">最佳累计收益</div>
            <div className="qp-hero__metric-value qp-hero__metric-value--gain">
              {fmtPercent(stats?.bestReturn ?? 0)}
            </div>
          </div>
          <div>
            <div className="qp-hero__metric-label">最佳夏普</div>
            <div className="qp-hero__metric-value">
              {fmtNumber(stats?.bestSharpe ?? 0)}
            </div>
          </div>
          <div>
            <div className="qp-hero__metric-label">盈利占比</div>
            <div className="qp-hero__metric-value">
              {fmtPercent(stats?.winRate ?? 0, 0)}
            </div>
          </div>
          <div>
            <div className="qp-hero__metric-label">平均交易次数</div>
            <div className="qp-hero__metric-value">
              {fmtNumber(stats?.avgTrades ?? 0, 1)}
            </div>
          </div>
        </div>
      </div>

      <Card title="快捷入口">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <QuickAction
              to="/data"
              icon={<DatabaseOutlined />}
              title="接入数据"
              description="选择 CSV 或模拟数据，预览行情质量与时间区间"
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <QuickAction
              to="/strategies"
              icon={<ExperimentOutlined />}
              title="策略编辑"
              description="基于内置模板和指标库快速搭建策略"
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <QuickAction
              to="/backtest"
              icon={<ThunderboltOutlined />}
              title="运行回测"
              description="设置参数与成本，一键执行事件驱动回测"
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <QuickAction
              to="/optimization"
              icon={<RocketOutlined />}
              title="参数优化"
              description="网格搜索 + 敏感性分析（演示数据）"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title="最近回测"
            extra={<Link to="/runs">查看全部</Link>}
            loading={runsQuery.isLoading}
          >
            {recent.length === 0 ? (
              <Empty
                description="还没有回测记录"
                style={{ padding: "20px 0" }}
              >
                <Link to="/backtest">
                  <Button type="primary" icon={<RocketOutlined />}>
                    创建第一个回测
                  </Button>
                </Link>
              </Empty>
            ) : (
              <Row gutter={[12, 12]}>
                {recent.map((run, i) => {
                  const detail = recentDetailQueries[i]?.data;
                  const values =
                    detail?.report.equity_curve.map((p) => p.total_value) ?? [];
                  return (
                    <Col key={run.run_id} xs={24} sm={12}>
                      <RecentRunCard
                        run={run}
                        values={values}
                        loading={recentDetailQueries[i]?.isLoading ?? false}
                      />
                    </Col>
                  );
                })}
              </Row>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="系统健康">
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <HealthRow
                label="后端 API"
                ok={healthQuery.isSuccess}
                loading={healthQuery.isLoading}
                detail={
                  healthQuery.isSuccess
                    ? `profile=${runtimeQuery.data?.profile ?? "—"}`
                    : healthQuery.isError
                      ? "请确认 uvicorn 已启动"
                      : "检测中"
                }
              />
              <HealthRow
                label="数据源"
                ok={(providersQuery.data?.providers ?? []).length > 0}
                loading={providersQuery.isLoading}
                detail={
                  providersQuery.data
                    ? `${providersQuery.data.providers.length} 个：${providersQuery.data.providers.join("、")}`
                    : "—"
                }
              />
              <HealthRow
                label="策略模板"
                ok={(templatesQuery.data?.templates ?? []).length > 0}
                loading={templatesQuery.isLoading}
                detail={
                  templatesQuery.data
                    ? `${templatesQuery.data.templates.length} 个模板已注册`
                    : "—"
                }
              />
              <HealthRow
                label="实时进度通道"
                ok={false}
                loading={false}
                pending
                detail="WebSocket 在 Phase 3.5 接入"
              />
              <HealthRow
                label="参数优化任务队列"
                ok={false}
                loading={false}
                pending
                detail="JobRegistry 在 Phase 5 接入"
              />
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

interface HealthRowProps {
  label: string;
  ok: boolean;
  loading: boolean;
  detail: string;
  pending?: boolean;
}

const HealthRow: React.FC<HealthRowProps> = ({ label, ok, loading, detail, pending }) => {
  let icon = (
    <ClockCircleOutlined style={{ color: QPColors.textMuted, fontSize: 16 }} />
  );
  let badge = (
    <Tag bordered={false} color="default">
      检测中
    </Tag>
  );
  if (!loading) {
    if (pending) {
      icon = <ClockCircleOutlined style={{ color: QPColors.warning, fontSize: 16 }} />;
      badge = (
        <Tag bordered={false} color="orange">
          规划中
        </Tag>
      );
    } else if (ok) {
      icon = <CheckCircleFilled style={{ color: QPColors.success, fontSize: 16 }} />;
      badge = (
        <Tag bordered={false} color="success">
          正常
        </Tag>
      );
    } else {
      icon = <WarningFilled style={{ color: QPColors.danger, fontSize: 16 }} />;
      badge = (
        <Tag bordered={false} color="error">
          异常
        </Tag>
      );
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <Space size={10}>
        {icon}
        <div>
          <div style={{ fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 12, color: QPColors.textMuted }}>
            <Tooltip title={detail}>{detail}</Tooltip>
          </div>
        </div>
      </Space>
      {badge}
    </div>
  );
};

export default DashboardPage;
