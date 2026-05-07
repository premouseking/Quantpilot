import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Row,
  Space,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  CodeOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import {
  api,
  SaveUserStrategyRequest,
  StrategyTemplate,
  StrategyVersionSummary,
} from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { QPColors } from "../theme";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

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
  versionNote: string;
}

const renderSchemaForm = (schema: unknown) => {
  const properties = ((schema as { properties?: Record<string, SchemaProperty> } | undefined)
    ?.properties ?? {}) as Record<string, SchemaProperty>;
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;
  return (
    <Form layout="vertical">
      <div className="qp-form-grid">
        {entries.map(([key, prop]) => (
          <Form.Item
            key={key}
            label={prop.title ?? key}
            tooltip={`${prop.type}${prop.minimum !== undefined ? `, ≥ ${prop.minimum}` : ""}${
              prop.maximum !== undefined ? `, ≤ ${prop.maximum}` : ""
            }`}
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

const formatTimestamp = (value?: string | null) => {
  if (!value) return "内置模板";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
};

const sourceLabel = (source: StrategyTemplate["source"]) =>
  source === "builtin" ? "内置模板" : "我的策略";

const StrategiesPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saveForm] = Form.useForm<SaveFormValues>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const hydratedStrategyIdRef = useRef<string | null>(null);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

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

  const templates = templatesQuery.data?.templates ?? [];
  const selected = templates.find((item) => item.id === selectedId);
  const selectedIsUserStrategy = selected?.source === "user";
  const versionsQuery = useQuery({
    queryKey: ["strategy-versions", selectedId],
    queryFn: () => api.listStrategyVersions(selectedId as string),
    enabled: Boolean(selectedId && selected?.source === "user"),
    retry: false,
  });
  const versionDetailQuery = useQuery({
    queryKey: ["strategy-version", selectedId, previewVersionId],
    queryFn: () => api.getStrategyVersion(selectedId as string, previewVersionId as string),
    enabled: Boolean(selectedId && previewVersionId),
    retry: false,
  });
  const builtins = useMemo(
    () => templates.filter((item) => item.source === "builtin"),
    [templates],
  );
  const userStrategies = useMemo(
    () => templates.filter((item) => item.source === "user"),
    [templates],
  );

  useEffect(() => {
    if (!selectedId && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
  }, [templates, selectedId]);

  useEffect(() => {
    if (selectedId && !templates.some((item) => item.id === selectedId)) {
      setSelectedId(templates[0]?.id ?? null);
    }
  }, [templates, selectedId]);

  useEffect(() => {
    if (!selected || !templateDetailQuery.data) return;
    if (hydratedStrategyIdRef.current === templateDetailQuery.data.id) return;

    hydratedStrategyIdRef.current = templateDetailQuery.data.id;
    setCode(templateDetailQuery.data.code ?? "");
    saveForm.setFieldsValue({
      id: selectedIsUserStrategy ? selected.id : `${selected.id}_custom`,
      title: selectedIsUserStrategy ? selected.title : `${selected.title} 副本`,
      description: selected.description,
      schemaJson: JSON.stringify(templateDetailQuery.data.params_schema, null, 2),
      versionNote: "",
    });
  }, [saveForm, selected, selectedIsUserStrategy, templateDetailQuery.data]);

  const watchedSchemaJson = Form.useWatch("schemaJson", saveForm) ?? "{}";
  const schemaPreview = useMemo(() => {
    try {
      return {
        parsed: JSON.parse(watchedSchemaJson) as Record<string, unknown>,
        error: null,
      };
    } catch {
      return {
        parsed: null,
        error: "当前参数 schema 不是合法 JSON，保存前请先修正。",
      };
    }
  }, [watchedSchemaJson]);

  const selectStrategy = (strategyId: string) => {
    hydratedStrategyIdRef.current = null;
    setPreviewVersionId(null);
    setSelectedId(strategyId);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: SaveUserStrategyRequest) => api.saveUserStrategy(payload),
    onSuccess: async (saved) => {
      message.success(`策略已保存：${saved.id}`);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["strategy-template", saved.id] });
      await queryClient.invalidateQueries({ queryKey: ["strategy-versions", saved.id] });
      hydratedStrategyIdRef.current = null;
      setSelectedId(saved.id);
      saveForm.setFieldValue("versionNote", "");
    },
    onError: (error: unknown) => {
      message.error(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (strategyId: string) => api.deleteUserStrategy(strategyId),
    onSuccess: async () => {
      message.success("策略已删除");
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      hydratedStrategyIdRef.current = null;
      setPreviewVersionId(null);
      setSelectedId(null);
    },
    onError: (error: unknown) => {
      message.error(`删除失败：${error instanceof Error ? error.message : String(error)}`);
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
      version_note: values.versionNote?.trim() || undefined,
    });
  };

  const versions = versionsQuery.data?.versions ?? [];

  return (
    <div className="qp-page">
      <PageHeader
        title="策略工作台"
        subtitle="统一管理内置模板与我的策略，在同一工作台中完成预览、编辑、保存与回测。"
        badge={<span className="qp-pill qp-pill--mock">本地可信执行</span>}
      />

      <Alert
        type="info"
        showIcon
        message="当前用户策略仍是本地单用户研究形态：可编辑、保存、删除并直接进入回测；在进入多用户或共享环境前，必须先补齐沙箱、资源限制和依赖白名单。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8} xl={7}>
          <Card
            title="策略资产"
            extra={<Tag bordered={false}>{templates.length} 个</Tag>}
            loading={templatesQuery.isLoading}
            style={{ height: "100%" }}
          >
            <AssetSection
              title="内置模板"
              items={builtins}
              selectedId={selectedId}
              emptyText="暂无内置模板"
              onSelect={selectStrategy}
            />
            <Divider style={{ margin: "16px 0" }} />
            <AssetSection
              title="我的策略"
              items={userStrategies}
              selectedId={selectedId}
              emptyText="还没有保存的用户策略"
              onSelect={selectStrategy}
            />
          </Card>
        </Col>
        <Col xs={24} lg={16} xl={17}>
          <Card
            title={
              selected ? (
                <Space wrap>
                  <span>{selected.title}</span>
                  <Tag>{selected.id}</Tag>
                  <Tag color={selected.source === "builtin" ? "gold" : "volcano"}>
                    {sourceLabel(selected.source)}
                  </Tag>
                  {selected.readonly && <Tag bordered={false}>只读源码</Tag>}
                </Space>
              ) : (
                "选择一个策略"
              )
            }
            extra={
              selected && (
                <Space wrap>
                  {selectedIsUserStrategy && (
                    <Popconfirm
                      title="删除这个用户策略？"
                      description="会同时删除本地保存的代码和元数据。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => deleteMutation.mutate(selected.id)}
                    >
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        loading={deleteMutation.isPending}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  )}
                  <Button
                    icon={<SaveOutlined />}
                    loading={saveMutation.isPending}
                    onClick={() => saveForm.submit()}
                  >
                    {selectedIsUserStrategy ? "另存版本" : "保存为我的策略"}
                  </Button>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={() => navigate(`/backtest?template=${selected.id}`)}
                  >
                    用此策略回测
                  </Button>
                </Space>
              )
            }
          >
            {!selected ? (
              <Empty description="请选择左侧策略资产" />
            ) : (
              <Form<SaveFormValues>
                form={saveForm}
                layout="vertical"
                onFinish={handleSave}
                style={{ marginTop: 4 }}
              >
                <Tabs
                  items={[
                    {
                      key: "overview",
                      label: "概览",
                      children: (
                        <>
                          <Paragraph type="secondary" style={{ marginTop: 0 }}>
                            {selected.description || "暂无描述，可在代码页中补充。"}
                          </Paragraph>
                          <Descriptions
                            size="small"
                            bordered
                            column={{ xs: 1, sm: 2 }}
                            items={[
                              { key: "id", label: "策略 ID", children: selected.id },
                              {
                                key: "source",
                                label: "来源",
                                children: sourceLabel(selected.source),
                              },
                              {
                                key: "mode",
                                label: "编辑模式",
                                children: selected.readonly ? "模板只读，可另存为副本" : "可编辑",
                              },
                              {
                                key: "currentVersion",
                                label: "当前版本",
                                children: selected.current_version ?? "内置模板",
                              },
                              {
                                key: "versionCount",
                                label: "版本数",
                                children:
                                  selected.source === "user"
                                    ? `${selected.version_count ?? 0} 个版本`
                                    : "不适用",
                              },
                              {
                                key: "updated",
                                label: "最后更新",
                                children: formatTimestamp(selected.updated_at),
                              },
                            ]}
                          />
                          <Alert
                            style={{ marginTop: 16 }}
                            type="info"
                            showIcon
                            message="推荐流程：先在“代码”页修改策略，再在“参数定义”页维护 schema，最后直接跳转到回测页验证表现。"
                          />
                        </>
                      ),
                    },
                    {
                      key: "code",
                      label: "代码",
                      children: (
                        <>
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
                          <Form.Item
                            label="版本备注"
                            name="versionNote"
                            tooltip="保存用户策略时会生成新的版本快照，版本备注会展示在历史列表中。"
                          >
                            <Input
                              maxLength={200}
                              placeholder={
                                selectedIsUserStrategy
                                  ? "例如：调整止盈逻辑 / 新增过滤条件"
                                  : "例如：从模板创建第一版"
                              }
                            />
                          </Form.Item>
                          <Title level={5} style={{ marginTop: 16 }}>
                            <CodeOutlined style={{ marginRight: 6 }} />
                            Python 策略代码
                          </Title>
                          <div className="qp-monaco">
                            <Editor
                              height="360px"
                              defaultLanguage="python"
                              value={code}
                              onChange={(value) => setCode(value ?? "")}
                              options={{
                                minimap: { enabled: false },
                                fontSize: 12.5,
                                scrollBeyondLastLine: false,
                                readOnly: saveMutation.isPending || deleteMutation.isPending,
                                smoothScrolling: true,
                                renderLineHighlight: "gutter",
                              }}
                            />
                          </div>
                        </>
                      ),
                    },
                    {
                      key: "schema",
                      label: "参数定义",
                      children: (
                        <>
                          <Form.Item
                            name="schemaJson"
                            tooltip="保存时会作为 params_schema 提交，回测页会根据该 schema 动态渲染参数表单。"
                          >
                            <TextArea rows={10} className="qp-mono" />
                          </Form.Item>
                          {schemaPreview.error ? (
                            <Alert type="warning" showIcon message={schemaPreview.error} />
                          ) : (
                            <>
                              <Text type="secondary">表单预览</Text>
                              <div style={{ marginTop: 12 }}>
                                {renderSchemaForm(schemaPreview.parsed) ?? (
                                  <span className="qp-muted">该策略未声明参数</span>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      ),
                    },
                    {
                      key: "versions",
                      label: "版本历史",
                      children:
                        selected.source === "builtin" ? (
                          <Alert
                            type="info"
                            showIcon
                            message="内置模板不记录用户版本历史。若要进入版本管理，请先保存为我的策略。"
                          />
                        ) : (
                          <VersionHistoryPanel
                            versions={versions}
                            currentVersion={selected.current_version}
                            loading={versionsQuery.isLoading}
                            onPreview={(versionId) => setPreviewVersionId(versionId)}
                          />
                        ),
                    },
                  ]}
                />
              </Form>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="内置指标库">
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          后端 <span className="qp-mono">app/strategy/indicators.py</span> 中已实现的指标，
          策略代码中可直接调用：
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
                <div style={{ fontSize: 13, color: QPColors.textPrimary }}>{ind.description}</div>
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

      <Modal
        open={Boolean(previewVersionId)}
        onCancel={() => setPreviewVersionId(null)}
        footer={null}
        width={920}
        title={
          versionDetailQuery.data ? (
            <Space wrap>
              <span>版本 {versionDetailQuery.data.version_id}</span>
              <Tag bordered={false}>{formatTimestamp(versionDetailQuery.data.created_at)}</Tag>
            </Space>
          ) : (
            "查看版本"
          )
        }
      >
        {versionDetailQuery.data ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Descriptions
              size="small"
              bordered
              column={1}
              items={[
                {
                  key: "note",
                  label: "版本备注",
                  children: versionDetailQuery.data.note || "无备注",
                },
                {
                  key: "description",
                  label: "策略描述",
                  children: versionDetailQuery.data.description || "无描述",
                },
              ]}
            />
            <Editor
              height="420px"
              defaultLanguage="python"
              value={versionDetailQuery.data.code}
              options={{
                minimap: { enabled: false },
                readOnly: true,
                scrollBeyondLastLine: false,
                fontSize: 12.5,
              }}
            />
          </Space>
        ) : (
          <Empty description={versionDetailQuery.isLoading ? "正在加载版本详情" : "暂无版本详情"} />
        )}
      </Modal>
    </div>
  );
};

const VersionHistoryPanel: React.FC<{
  versions: StrategyVersionSummary[];
  currentVersion?: string | null;
  loading: boolean;
  onPreview: (versionId: string) => void;
}> = ({ versions, currentVersion, loading, onPreview }) => (
  <List
    loading={loading}
    dataSource={versions}
    locale={{ emptyText: <Empty description="还没有历史版本" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
    renderItem={(item) => (
      <List.Item
        actions={[
          <Button key="preview" type="link" onClick={() => onPreview(item.version_id)}>
            查看版本
          </Button>,
        ]}
      >
        <List.Item.Meta
          title={
            <Space wrap>
              <span>{item.version_id}</span>
              {item.version_id === currentVersion && <Tag color="volcano">当前版本</Tag>}
              <Tag bordered={false}>{formatTimestamp(item.created_at)}</Tag>
            </Space>
          }
          description={
            <Space direction="vertical" size={4}>
              <span>{item.note || "无版本备注"}</span>
              <span style={{ color: QPColors.textMuted }}>{item.description || "无描述"}</span>
            </Space>
          }
        />
      </List.Item>
    )}
  />
);

const AssetSection: React.FC<{
  title: string;
  items: StrategyTemplate[];
  selectedId: string | null;
  emptyText: string;
  onSelect: (strategyId: string) => void;
}> = ({ title, items, selectedId, emptyText, onSelect }) => (
  <>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <Text strong>{title}</Text>
      <Tag bordered={false}>{items.length}</Tag>
    </div>
    <List
      itemLayout="horizontal"
      dataSource={items}
      locale={{ emptyText: <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      renderItem={(item) => (
        <List.Item
          onClick={() => onSelect(item.id)}
          style={{
            cursor: "pointer",
            background: selectedId === item.id ? "rgba(189, 63, 41, 0.06)" : undefined,
            borderLeft:
              selectedId === item.id ? "2px solid #bd3f29" : "2px solid transparent",
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
                  background:
                    item.source === "builtin" ? "rgba(196, 148, 47, 0.12)" : "rgba(189, 63, 41, 0.08)",
                  color: item.source === "builtin" ? "#9c6f19" : QPColors.vermilion,
                  border:
                    item.source === "builtin"
                      ? "1px solid rgba(196, 148, 47, 0.25)"
                      : "1px solid rgba(189, 63, 41, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ExperimentOutlined />
              </div>
            }
            title={
              <Space wrap size={[6, 6]}>
                <span>{item.title}</span>
                <Tag bordered={false}>{item.id}</Tag>
              </Space>
            }
            description={
              <div>
                <div style={{ color: QPColors.textMuted, fontSize: 12 }}>{item.description}</div>
                <div style={{ marginTop: 6 }}>
                  <Tag bordered={false}>{sourceLabel(item.source)}</Tag>
                  <Tag bordered={false}>更新于 {formatTimestamp(item.updated_at)}</Tag>
                </div>
              </div>
            }
          />
        </List.Item>
      )}
    />
  </>
);

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
