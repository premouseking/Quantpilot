import React, { useEffect, useState } from "react";
import {
  Card,
  List,
  Tag,
  Typography,
  Button,
  Space,
  App as AntdApp,
  Alert,
  Form,
  Input,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { api, SaveUserStrategyRequest, StrategyTemplate } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { QPColors } from "../theme";

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const BUILTIN_IDS = new Set(["dual_ma", "rsi_reversion", "macd_cross"]);

const SAMPLE_CODE = "";

interface SchemaProperty {
  type: string;
  title?: string;
  default?: number;
  minimum?: number;
  maximum?: number;
}

interface SaveFormValues {
  id: string;
  title: string;
  description: string;
  schemaJson: string;
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
  const queryClient = useQueryClient();
  const [saveForm] = Form.useForm<SaveFormValues>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState(SAMPLE_CODE);

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: api.listStrategyTemplates,
  });

  const templateDetailQuery = useQuery({
    queryKey: ["strategy-template", selectedId],
    queryFn: () => api.getStrategyTemplate(selectedId as string),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const selectedIsUserStrategy = Boolean(selectedId && !BUILTIN_IDS.has(selectedId));

  useEffect(() => {
    const list = templatesQuery.data?.templates ?? [];
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0].id);
    }
  }, [templatesQuery.data, selectedId]);

  const selected: StrategyTemplate | undefined = (templatesQuery.data?.templates ?? []).find(
    (t) => t.id === selectedId,
  );

  useEffect(() => {
    if (!selected || !templateDetailQuery.data) return;
    setCode(templateDetailQuery.data.code ?? "");
    saveForm.setFieldsValue({
      id: selectedIsUserStrategy ? selected.id : `${selected.id}_custom`,
      title: selectedIsUserStrategy ? selected.title : `${selected.title} 副本`,
      description: selected.description,
      schemaJson: JSON.stringify(templateDetailQuery.data.params_schema, null, 2),
    });
  }, [selected, selectedIsUserStrategy, templateDetailQuery.data, saveForm]);

  const saveMutation = useMutation({
    mutationFn: (payload: SaveUserStrategyRequest) => api.saveUserStrategy(payload),
    onSuccess: async (saved) => {
      message.success(`策略已保存：${saved.id}`);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["strategy-template", saved.id] });
      setSelectedId(saved.id);
    },
    onError: (error: unknown) => {
      message.error(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const handleSave = (values: SaveFormValues) => {
    let paramsSchema: Record<string, unknown>;
    try {
      paramsSchema = JSON.parse(values.schemaJson || "{}") as Record<string, unknown>;
    } catch {
      message.warning("参数 schema 必须是合法 JSON");
      return;
    }
    saveMutation.mutate({
      id: values.id,
      title: values.title,
      description: values.description ?? "",
      code,
      params_schema: paramsSchema,
      overwrite: selectedIsUserStrategy && selectedId === values.id,
    });
  };

  return (
    <div className="qp-page">
      <PageHeader
        title="策略"
        subtitle="基于内置模板和指标库快速搭建策略；本地 MVP 支持保存可信 Python 策略并用于回测。"
        badge={<span className="qp-pill qp-pill--mock">本地可信执行</span>}
      />

      <Alert
        type="info"
        showIcon
        message="当前保存的用户策略会写入后端 data/strategies，并进入回测模板列表。多用户或共享环境上线前必须先接入沙箱、资源限制和依赖白名单。"
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
                <Button
                  icon={<SaveOutlined />}
                  loading={saveMutation.isPending}
                  onClick={() => saveForm.submit()}
                >
                  {selectedIsUserStrategy ? "保存修改" : "保存为我的策略"}
                </Button>
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

              <Form<SaveFormValues>
                form={saveForm}
                layout="vertical"
                onFinish={handleSave}
                style={{ marginTop: 12 }}
              >
                <div className="qp-form-grid">
                  <Form.Item
                    label="策略 ID"
                    name="id"
                    rules={[
                      { required: true, message: "请输入策略 ID" },
                      {
                        pattern: /^[a-z][a-z0-9_]{2,63}$/,
                        message: "仅支持小写字母、数字、下划线，且以字母开头",
                      },
                    ]}
                  >
                    <Input disabled={selectedIsUserStrategy} />
                  </Form.Item>
                  <Form.Item
                    label="策略名称"
                    name="title"
                    rules={[{ required: true, message: "请输入策略名称" }]}
                  >
                    <Input />
                  </Form.Item>
                </div>
                <Form.Item label="策略描述" name="description">
                  <Input />
                </Form.Item>

              <Title level={5} style={{ marginTop: 16 }}>
                <CodeOutlined style={{ marginRight: 6 }} />
                Python 策略代码
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
                    readOnly: saveMutation.isPending,
                    smoothScrolling: true,
                    renderLineHighlight: "gutter",
                  }}
                />
              </div>

              <Title level={5} style={{ marginTop: 16 }}>
                参数 schema
              </Title>
              <Form.Item
                name="schemaJson"
                tooltip="保存时会作为 params_schema 提交，回测页根据该 schema 动态渲染参数"
              >
                <TextArea rows={8} className="qp-mono" />
              </Form.Item>
              </Form>
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
