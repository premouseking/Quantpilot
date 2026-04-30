import React, { useEffect, useState } from "react";
import {
  Card,
  List,
  Tag,
  Typography,
  Button,
  Space,
  Tooltip,
  App as AntdApp,
  Alert,
  Form,
  InputNumber,
  Empty,
  Row,
  Col,
} from "antd";
import {
  ExperimentOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { api, StrategyTemplate } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { QPColors } from "../theme";

const { Title, Paragraph } = Typography;

const SAMPLE_CODE = `# 内置双均线策略示例（只读演示）
# 后端真正的执行版本位于 app/strategy/templates/dual_ma.py
from app.strategy.base import Strategy, StrategyContext


class DualMovingAverageStrategy(Strategy):
    def initialize(self, params):
        self.short_window = int(params["short_window"])
        self.long_window = int(params["long_window"])
        self.target_percent = float(params["target_percent"])
        self.history = []
        self.last_signal = 0

    def on_bar(self, ctx: StrategyContext):
        self.history.append(ctx.bar.close)
        if len(self.history) < self.long_window:
            return
        short_ma = sum(self.history[-self.short_window:]) / self.short_window
        long_ma = sum(self.history[-self.long_window:]) / self.long_window
        signal = 1 if short_ma > long_ma else -1
        if signal != self.last_signal:
            ctx.order_target_percent(self.target_percent if signal == 1 else 0.0)
            self.last_signal = signal
`;

interface SchemaProperty {
  type: string;
  title?: string;
  default?: number;
  minimum?: number;
  maximum?: number;
}

const renderSchemaForm = (schema: any) => {
  const properties = (schema?.properties ?? {}) as Record<string, SchemaProperty>;
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;
  return (
    <Form layout="vertical">
      <div className="qp-form-grid">
        {entries.map(([key, prop]) => (
          <Form.Item
            key={key}
            label={prop.title ?? key}
            tooltip={`${prop.type}${prop.minimum !== undefined ? `, ≥ ${prop.minimum}` : ""}`}
          >
            <InputNumber
              defaultValue={prop.default}
              min={prop.minimum}
              max={prop.maximum}
              step={prop.type === "integer" ? 1 : 0.01}
              style={{ width: "100%" }}
              disabled
            />
          </Form.Item>
        ))}
      </div>
    </Form>
  );
};

const StrategiesPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState(SAMPLE_CODE);

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: api.listStrategyTemplates,
  });

  useEffect(() => {
    const list = templatesQuery.data?.templates ?? [];
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0].id);
    }
  }, [templatesQuery.data, selectedId]);

  const selected: StrategyTemplate | undefined = (templatesQuery.data?.templates ?? []).find(
    (t) => t.id === selectedId,
  );

  return (
    <div className="qp-page">
      <PageHeader
        title="策略"
        subtitle="基于内置模板和指标库快速搭建策略；版本管理、Git 集成与多用户保存正在规划中。"
        badge={<span className="qp-pill qp-pill--mock">编辑器只读演示</span>}
      />

      <Alert
        type="info"
        showIcon
        message="MVP 阶段，策略代码以后端内置模板为准。Monaco 编辑器已就绪，等到 Phase 2 接入策略保存接口后即可在浏览器中编写并运行用户自定义策略。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8} xl={7}>
        <Card title="策略模板" loading={templatesQuery.isLoading} style={{ height: "100%" }}>
          <List
            itemLayout="horizontal"
            dataSource={templatesQuery.data?.templates ?? []}
            renderItem={(item) => (
              <List.Item
                onClick={() => setSelectedId(item.id)}
                style={{
                  cursor: "pointer",
                  background:
                    selectedId === item.id
                      ? "rgba(189, 63, 41, 0.06)"
                      : undefined,
                  borderLeft:
                    selectedId === item.id
                      ? "2px solid #bd3f29"
                      : "2px solid transparent",
                  borderRadius: 0,
                  padding: 12,
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        background: "rgba(189, 63, 41, 0.08)",
                        color: QPColors.vermilion,
                        border: "1px solid rgba(189, 63, 41, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ExperimentOutlined />
                    </div>
                  }
                  title={
                    <Space>
                      <span>{item.title}</span>
                      <Tag bordered={false}>{item.id}</Tag>
                    </Space>
                  }
                  description={
                    <span style={{ color: QPColors.textMuted, fontSize: 12 }}>
                      {item.description}
                    </span>
                  }
                />
              </List.Item>
            )}
            locale={{ emptyText: <Empty description="暂无模板" /> }}
          />
        </Card>
        </Col>
        <Col xs={24} lg={16} xl={17}>
        <Card
          title={
            selected ? (
              <Space>
                <span>{selected.title}</span>
                <Tag>{selected.id}</Tag>
              </Space>
            ) : (
              "选择一个策略模板"
            )
          }
          extra={
            selected && (
              <Space>
                <Tooltip title="保存接口将在 Phase 2 落地">
                  <Button icon={<SaveOutlined />} disabled>
                    保存为我的策略
                  </Button>
                </Tooltip>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={() => {
                    if (!selected) return;
                    navigate(`/backtest?template=${selected.id}`);
                  }}
                >
                  用此模板回测
                </Button>
              </Space>
            )
          }
        >
          {!selected ? (
            <Empty />
          ) : (
            <>
              <Paragraph type="secondary" style={{ marginTop: 0 }}>
                {selected.description}
              </Paragraph>

              <Title level={5} style={{ marginTop: 16 }}>
                <CodeOutlined style={{ marginRight: 6 }} />
                参考实现
              </Title>
              <div className="qp-monaco">
                <Editor
                  height="320px"
                  defaultLanguage="python"
                  value={code}
                  onChange={(value) => {
                    setCode(value ?? "");
                    message.destroy();
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12.5,
                    scrollBeyondLastLine: false,
                    readOnly: false,
                    smoothScrolling: true,
                    renderLineHighlight: "gutter",
                  }}
                />
              </div>

              <Title level={5} style={{ marginTop: 16 }}>
                参数 schema
              </Title>
              {renderSchemaForm(selected.params_schema) ?? (
                <span className="qp-muted">该模板未声明参数</span>
              )}
            </>
          )}
        </Card>
        </Col>
      </Row>

      <Card title="内置指标库">
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          后端 <span className="qp-mono">app/strategy/indicators.py</span>{" "}
          中已实现的指标，策略代码中可直接调用：
        </Paragraph>
        <Row gutter={[12, 12]}>
          {INDICATOR_CATALOG.map((ind) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={ind.name}>
              <div
                style={{
                  border: "1px solid #dccfb2",
                  borderLeft: `2px solid ${ind.kind === "趋势" ? "#3f6b48" : "#bd3f29"}`,
                  borderRadius: 2,
                  padding: 14,
                  height: "100%",
                  background: "#fdf9ee",
                }}
                className="qp-clickable"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 6,
                  }}
                >
                  <span
                    className="qp-serif"
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      color: QPColors.ink,
                      letterSpacing: 0.5,
                    }}
                  >
                    {ind.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: QPColors.textMuted,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {ind.kind}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: QPColors.textPrimary }}>
                  {ind.description}
                </div>
                <div
                  className="qp-mono"
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px dotted #c4b48f",
                    fontSize: 11.5,
                  }}
                >
                  {ind.signature}
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
};

const INDICATOR_CATALOG: Array<{
  name: string;
  kind: string;
  description: string;
  signature: string;
}> = [
  {
    name: "SMA",
    kind: "趋势",
    description: "简单移动平均线，用于平滑价格趋势",
    signature: "sma(series, window)",
  },
  {
    name: "EMA",
    kind: "趋势",
    description: "指数加权移动平均，最近价格权重更高",
    signature: "ema(series, span)",
  },
  {
    name: "RSI",
    kind: "动量",
    description: "相对强弱指标，识别超买超卖",
    signature: "rsi(series, period=14)",
  },
  {
    name: "MACD",
    kind: "动量",
    description: "MACD 线 / 信号线 / 柱状差",
    signature: "macd(series, fast=12, slow=26, signal=9)",
  },
];

export default StrategiesPage;
