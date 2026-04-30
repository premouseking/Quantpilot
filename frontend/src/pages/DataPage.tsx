import React, { useState } from "react";
import {
  Card,
  Select,
  Space,
  Tag,
  DatePicker,
  Row,
  Col,
  Empty,
  Alert,
  Button,
  Upload,
  App as AntdApp,
  Tooltip,
} from "antd";
import {
  CheckCircleFilled,
  RiseOutlined,
  FallOutlined,
  AreaChartOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { UploadOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { KLineChart } from "../components/KLineChart";
import { QPColors } from "../theme";
import { fmtNumber, fmtPercent } from "../utils/format";

const { RangePicker } = DatePicker;

const FREQUENCIES = [
  { value: "daily", label: "日线" },
  { value: "1m", label: "1 分钟" },
  { value: "5m", label: "5 分钟" },
  { value: "15m", label: "15 分钟" },
  { value: "30m", label: "30 分钟" },
  { value: "1h", label: "1 小时" },
];

const DataPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [provider, setProvider] = useState("mock");
  const [symbol, setSymbol] = useState("MOCK001");
  const [frequency, setFrequency] = useState("daily");
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, "year"),
    dayjs(),
  ]);

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: api.listProviders,
  });

  const symbolsQuery = useQuery({
    queryKey: ["symbols", provider],
    queryFn: () => api.listSymbols(provider),
    enabled: Boolean(provider),
  });

  const barsQuery = useQuery({
    queryKey: ["bars", provider, symbol, frequency, range[0]?.toISOString(), range[1]?.toISOString()],
    queryFn: () =>
      api.getBars(provider, {
        symbol,
        start: range[0].startOf("day").toISOString(),
        end: range[1].endOf("day").toISOString(),
        frequency,
        limit: 1000,
      }),
    enabled: Boolean(provider && symbol && range[0] && range[1]),
    retry: 0,
  });

  const bars = barsQuery.data?.bars ?? [];
  const stats = React.useMemo(() => {
    if (bars.length === 0) return null;
    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume ?? 0);
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const change = (closes[closes.length - 1] - closes[0]) / closes[0];
    const avgClose = closes.reduce((s, v) => s + v, 0) / closes.length;
    const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
    const firstTs = bars[0].timestamp.slice(0, 10);
    const lastTs = bars[bars.length - 1].timestamp.slice(0, 10);
    return {
      high,
      low,
      change,
      count: bars.length,
      avgClose,
      avgVol,
      firstTs,
      lastTs,
    };
  }, [bars]);

  return (
    <div className="qp-page">
      <PageHeader
        title="数据接入"
        subtitle="登记数据源，预览行情质量，确认时间范围与字段完整性。"
        extra={
          <Upload
            accept=".csv"
            showUploadList={false}
            beforeUpload={() => {
              message.info("CSV 上传接口将在 Phase 1.5 落地，目前可手动放置到 backend/data/market/<frequency>/<symbol>.csv");
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>上传 CSV（占位）</Button>
          </Upload>
        }
      />

      <Card>
        <Space size="large" wrap>
          <div>
            <div style={{ fontSize: 12, color: QPColors.textMuted, marginBottom: 4 }}>
              数据源
            </div>
            <Select
              style={{ width: 160 }}
              loading={providersQuery.isLoading}
              value={provider}
              onChange={setProvider}
              options={(providersQuery.data?.providers ?? []).map((p) => ({
                value: p,
                label: p,
              }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: QPColors.textMuted, marginBottom: 4 }}>
              标的
            </div>
            <Select
              showSearch
              style={{ width: 200 }}
              loading={symbolsQuery.isLoading}
              value={symbol}
              onChange={setSymbol}
              options={(symbolsQuery.data?.symbols ?? []).map((s) => ({
                value: s,
                label: s,
              }))}
              notFoundContent={
                provider === "csv"
                  ? "未发现 CSV，请放置到 data/market/<frequency>/<symbol>.csv"
                  : undefined
              }
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: QPColors.textMuted, marginBottom: 4 }}>
              频率
            </div>
            <Select
              style={{ width: 120 }}
              value={frequency}
              onChange={setFrequency}
              options={FREQUENCIES}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: QPColors.textMuted, marginBottom: 4 }}>
              时间区间
            </div>
            <RangePicker
              value={range}
              onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
            />
          </div>
        </Space>
      </Card>

      {barsQuery.error && (
        <Alert
          type="warning"
          showIcon
          message="读取数据失败"
          description={(barsQuery.error as Error).message}
        />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <div className="qp-kpi">
            <span className="qp-kpi__label">
              <AreaChartOutlined /> 样本数
            </span>
            <span className="qp-kpi__value">{stats?.count ?? 0}</span>
            <span className="qp-kpi__delta">
              {stats ? `${stats.firstTs} → ${stats.lastTs}` : "—"}
            </span>
          </div>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <div className="qp-kpi qp-kpi--positive">
            <span className="qp-kpi__label">
              <RiseOutlined /> 区间最高
            </span>
            <span className="qp-kpi__value">
              {fmtNumber(stats?.high ?? 0, 3)}
            </span>
          </div>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <div className="qp-kpi qp-kpi--negative">
            <span className="qp-kpi__label">
              <FallOutlined /> 区间最低
            </span>
            <span className="qp-kpi__value">{fmtNumber(stats?.low ?? 0, 3)}</span>
          </div>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <div
            className={`qp-kpi ${
              (stats?.change ?? 0) >= 0 ? "qp-kpi--positive" : "qp-kpi--negative"
            }`}
          >
            <span className="qp-kpi__label">区间涨跌</span>
            <span className="qp-kpi__value">{fmtPercent(stats?.change ?? 0)}</span>
          </div>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <div className="qp-kpi">
            <span className="qp-kpi__label">均价</span>
            <span className="qp-kpi__value">{fmtNumber(stats?.avgClose ?? 0, 3)}</span>
            <span className="qp-kpi__delta">收盘价均值</span>
          </div>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <div className="qp-kpi">
            <span className="qp-kpi__label">日均成交</span>
            <span className="qp-kpi__value">
              {stats?.avgVol
                ? Math.round(stats.avgVol).toLocaleString("en-US")
                : "—"}
            </span>
          </div>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <span>{symbol} · {frequency}</span>
            <Tag bordered={false}>{provider}</Tag>
          </Space>
        }
        loading={barsQuery.isFetching}
      >
        {bars.length > 0 ? (
          <KLineChart bars={bars} height={400} />
        ) : (
          <Empty description="选择数据源、标的和区间以预览 K 线" />
        )}
      </Card>

      <Card
        title={
          <Space>
            <span>数据质量检查</span>
            <Tag color="orange">演示</Tag>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="完整的字段完整性、缺失交易日、异常价/量检查将在 Phase 1 数据质量 stage 中接入；当前展示静态摘要。"
          style={{ marginBottom: 12 }}
        />
        <Row gutter={[12, 12]}>
          {[
            { label: "字段完整性", value: "100%", ok: true },
            { label: "时间排序", value: "OK", ok: true },
            { label: "重复 K 线", value: 0, ok: true },
            { label: "价格异常", value: 0, ok: true },
            { label: "缺失交易日", value: "—", ok: null, hint: "需对照交易日历" },
            { label: "停复牌检测", value: "—", ok: null, hint: "Phase 1 数据质量 stage" },
          ].map((q) => (
            <Col xs={12} sm={8} md={6} lg={4} key={q.label}>
              <div className="qp-kpi">
                <span className="qp-kpi__label">
                  <Tooltip title={q.hint}>
                    {q.ok ? (
                      <CheckCircleFilled style={{ color: QPColors.success }} />
                    ) : (
                      <CalendarOutlined style={{ color: QPColors.textMuted }} />
                    )}
                  </Tooltip>{" "}
                  {q.label}
                </span>
                <span className="qp-kpi__value" style={{ fontSize: 18 }}>
                  {q.value}
                </span>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
};

export default DataPage;
