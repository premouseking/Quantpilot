import React, { useMemo, useState } from "react";
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Empty,
  Input,
  Select,
  Row,
  Col,
} from "antd";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { RocketOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { api, BacktestRunSummary } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { Sparkline } from "../components/Sparkline";
import {
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  tone,
} from "../utils/format";
import { QPColors } from "../theme";

const BacktestRunsPage: React.FC = () => {
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.listBacktestRuns });
  const runs = runsQuery.data?.runs ?? [];

  const [keyword, setKeyword] = useState("");
  const [symbolFilter, setSymbolFilter] = useState<string | undefined>();
  const [templateFilter, setTemplateFilter] = useState<string | undefined>();

  const symbols = useMemo(
    () => Array.from(new Set(runs.map((r) => r.config?.symbol).filter(Boolean) as string[])),
    [runs],
  );
  const templates = useMemo(
    () => Array.from(new Set(runs.map((r) => r.config?.template_id).filter(Boolean) as string[])),
    [runs],
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return runs.filter((r) => {
      if (symbolFilter && r.config?.symbol !== symbolFilter) return false;
      if (templateFilter && r.config?.template_id !== templateFilter) return false;
      if (kw) {
        const hay =
          `${r.run_id} ${r.config?.symbol ?? ""} ${r.config?.template_id ?? ""} ${r.config?.frequency ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [runs, keyword, symbolFilter, templateFilter]);

  const visibleIds = useMemo(() => filtered.slice(0, 30).map((r) => r.run_id), [filtered]);

  const detailQueries = useQueries({
    queries: visibleIds.map((id) => ({
      queryKey: ["run-detail", id],
      queryFn: () => api.getBacktestRun(id),
      staleTime: 60_000,
    })),
  });

  const detailMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    visibleIds.forEach((id, i) => {
      const detail = detailQueries[i]?.data;
      if (detail) {
        map[id] = detail.report.equity_curve.map((p) => p.total_value);
      }
    });
    return map;
  }, [visibleIds, detailQueries]);

  const aggregate = useMemo(() => {
    if (filtered.length === 0) return null;
    const cum = filtered.map((r) => r.metrics?.cumulative_return ?? 0);
    const sharps = filtered.map((r) => r.metrics?.sharpe_ratio ?? 0);
    const wins = filtered.filter((r) => (r.metrics?.cumulative_return ?? 0) > 0).length;
    return {
      total: filtered.length,
      avgReturn: cum.reduce((s, v) => s + v, 0) / cum.length,
      bestReturn: Math.max(...cum),
      bestSharpe: Math.max(...sharps),
      winRate: wins / filtered.length,
    };
  }, [filtered]);

  const columns = [
    {
      title: "Run",
      dataIndex: "run_id",
      key: "run_id",
      width: 160,
      render: (v: string, row: BacktestRunSummary) => (
        <div>
          <Link to={`/runs/${v}`} className="qp-mono qp-link">
            {v}
          </Link>
          <div style={{ fontSize: 11, color: QPColors.textMuted }}>
            {fmtDateTime(row.created_at)}
          </div>
        </div>
      ),
    },
    {
      title: "标的 / 频率",
      key: "symbol",
      render: (_: unknown, row: BacktestRunSummary) => (
        <Space size={4}>
          <Tag bordered={false}>{row.config?.symbol ?? "—"}</Tag>
          <Tag bordered={false}>{row.config?.frequency ?? "—"}</Tag>
        </Space>
      ),
    },
    {
      title: "策略",
      key: "template",
      render: (_: unknown, row: BacktestRunSummary) =>
        row.config?.template_id ? (
          <Tag bordered={false}>{row.config.template_id}</Tag>
        ) : (
          <span className="qp-muted">—</span>
        ),
    },
    {
      title: "区间",
      key: "range",
      render: (_: unknown, row: BacktestRunSummary) =>
        row.config ? (
          <span className="qp-mono" style={{ fontSize: 12 }}>
            {row.config.start.slice(0, 10)} → {row.config.end.slice(0, 10)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "趋势",
      key: "spark",
      width: 130,
      render: (_: unknown, row: BacktestRunSummary) => (
        <Sparkline values={detailMap[row.run_id] ?? []} width={110} height={28} />
      ),
    },
    {
      title: "累计收益",
      key: "cumulative",
      align: "right" as const,
      render: (_: unknown, row: BacktestRunSummary) => {
        const v = row.metrics?.cumulative_return ?? 0;
        const t = tone(v);
        return (
          <span
            style={{
              color:
                t === "positive"
                  ? QPColors.success
                  : t === "negative"
                    ? QPColors.danger
                    : QPColors.textPrimary,
              fontWeight: 600,
            }}
          >
            {fmtPercent(v)}
          </span>
        );
      },
      sorter: (a: BacktestRunSummary, b: BacktestRunSummary) =>
        (a.metrics?.cumulative_return ?? 0) - (b.metrics?.cumulative_return ?? 0),
    },
    {
      title: "夏普",
      key: "sharpe",
      align: "right" as const,
      render: (_: unknown, row: BacktestRunSummary) =>
        fmtNumber(row.metrics?.sharpe_ratio ?? 0),
      sorter: (a: BacktestRunSummary, b: BacktestRunSummary) =>
        (a.metrics?.sharpe_ratio ?? 0) - (b.metrics?.sharpe_ratio ?? 0),
    },
    {
      title: "最大回撤",
      key: "mdd",
      align: "right" as const,
      render: (_: unknown, row: BacktestRunSummary) => (
        <span style={{ color: QPColors.danger }}>
          {fmtPercent(row.metrics?.max_drawdown ?? 0)}
        </span>
      ),
      sorter: (a: BacktestRunSummary, b: BacktestRunSummary) =>
        (a.metrics?.max_drawdown ?? 0) - (b.metrics?.max_drawdown ?? 0),
    },
    {
      title: "期末资金",
      key: "final_value",
      align: "right" as const,
      render: (_: unknown, row: BacktestRunSummary) => fmtMoney(row.summary?.final_value),
      sorter: (a: BacktestRunSummary, b: BacktestRunSummary) =>
        (a.summary?.final_value ?? 0) - (b.summary?.final_value ?? 0),
    },
  ];

  return (
    <div className="qp-page">
      <PageHeader
        title="回测记录"
        subtitle="所有回测都会持久化在本地，可点击 Run ID 查看完整报告。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => runsQuery.refetch()}>
              刷新
            </Button>
            <Link to="/backtest">
              <Button type="primary" icon={<RocketOutlined />}>
                新建回测
              </Button>
            </Link>
          </Space>
        }
      />

      {aggregate && (
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={6}>
            <div className="qp-kpi">
              <span className="qp-kpi__label">筛选后回测数</span>
              <span className="qp-kpi__value">{aggregate.total}</span>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <div className={`qp-kpi ${aggregate.avgReturn >= 0 ? "qp-kpi--positive" : "qp-kpi--negative"}`}>
              <span className="qp-kpi__label">平均累计收益</span>
              <span className="qp-kpi__value">{fmtPercent(aggregate.avgReturn)}</span>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="qp-kpi">
              <span className="qp-kpi__label">最佳夏普</span>
              <span className="qp-kpi__value">{fmtNumber(aggregate.bestSharpe)}</span>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="qp-kpi">
              <span className="qp-kpi__label">盈利占比</span>
              <span className="qp-kpi__value">{fmtPercent(aggregate.winRate, 0)}</span>
            </div>
          </Col>
        </Row>
      )}

      <Card>
        <Space wrap size={12} style={{ marginBottom: 12 }}>
          <Input
            allowClear
            placeholder="搜索 run_id / 标的 / 策略"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="按标的筛选"
            value={symbolFilter}
            onChange={setSymbolFilter}
            style={{ width: 160 }}
            options={symbols.map((s) => ({ value: s, label: s }))}
          />
          <Select
            allowClear
            placeholder="按策略筛选"
            value={templateFilter}
            onChange={setTemplateFilter}
            style={{ width: 200 }}
            options={templates.map((s) => ({ value: s, label: s }))}
          />
          {filtered.length !== runs.length && (
            <span className="qp-muted">
              {filtered.length} / {runs.length}
            </span>
          )}
        </Space>

        {filtered.length === 0 && !runsQuery.isLoading ? (
          <Empty
            description={
              runs.length === 0
                ? "尚未运行任何回测"
                : "当前筛选条件下没有回测"
            }
          >
            {runs.length === 0 && (
              <Link to="/backtest">
                <Button type="primary" icon={<RocketOutlined />}>
                  创建第一个回测
                </Button>
              </Link>
            )}
          </Empty>
        ) : (
          <Table
            rowKey="run_id"
            loading={runsQuery.isLoading}
            dataSource={filtered}
            columns={columns}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1100 }}
          />
        )}
      </Card>
    </div>
  );
};

export default BacktestRunsPage;
