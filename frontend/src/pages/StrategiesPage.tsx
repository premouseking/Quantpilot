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
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import type { SelectProps } from "antd";
import {
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  SaveOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import {
  api,
  MarketplaceStrategy,
  SaveUserStrategyRequest,
  StrategyExportPayload,
  StrategyTemplate,
  StrategyVersionSummary,
  VersionComparison,
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

const extractAssignedObject = (source: string, name: string) => {
  const match = new RegExp(`${name}\\s*=\\s*\\{`, "m").exec(source);
  if (!match) return null;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = match.index + match[0].lastIndexOf("{"); index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(match.index + match[0].lastIndexOf("{"), index + 1);
    }
  }
  return null;
};

const pythonLiteralToJson = (literal: string) => {
  return literal
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value: string) =>
      JSON.stringify(value.replace(/\\'/g, "'")),
    )
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/,\s*([}\]])/g, "$1");
};

const extractParamsSchema = (source: string): Record<string, unknown> | null => {
  const literal = extractAssignedObject(source, "PARAMS_SCHEMA");
  if (!literal) return null;
  try {
    return JSON.parse(pythonLiteralToJson(literal)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

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
              value={prop.default}
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
  const hydratedStrategyKeyRef = useRef<string | null>(null);
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
    const hydrationKey = [
      templateDetailQuery.data.id,
      templateDetailQuery.data.current_version ?? "",
      templateDetailQuery.data.updated_at ?? "",
      templateDetailQuery.data.code ?? "",
      JSON.stringify(templateDetailQuery.data.params_schema),
    ].join("|");
    if (hydratedStrategyKeyRef.current === hydrationKey) return;

    hydratedStrategyKeyRef.current = hydrationKey;
    setCode(templateDetailQuery.data.code ?? "");
    setEditingTags(templateDetailQuery.data.tags ?? (selected.tags ?? []));
    setEditingCategory(templateDetailQuery.data.category ?? (selected.category ?? "custom"));
    saveForm.setFieldsValue({
      id: selectedIsUserStrategy ? selected.id : `${selected.id}_custom`,
      title: selectedIsUserStrategy ? selected.title : `${selected.title} 副本`,
      description: selected.description,
      schemaJson: JSON.stringify(templateDetailQuery.data.params_schema, null, 2),
      versionNote: "",
    });
  }, [saveForm, selected, selectedIsUserStrategy, templateDetailQuery.data]);

  const watchedSchemaJson = Form.useWatch("schemaJson", saveForm) ?? "{}";
  const codeParamsSchema = useMemo(() => extractParamsSchema(code), [code]);
  useEffect(() => {
    if (!codeParamsSchema) return;
    const nextSchemaJson = JSON.stringify(codeParamsSchema, null, 2);
    if (watchedSchemaJson !== nextSchemaJson) {
      saveForm.setFieldValue("schemaJson", nextSchemaJson);
    }
  }, [codeParamsSchema, saveForm, watchedSchemaJson]);
  const schemaPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(watchedSchemaJson) as Record<string, unknown>;
      return {
        parsed,
        effective: parsed,
        error: null,
      };
    } catch {
      return {
        parsed: null,
        effective: null,
        error: "当前参数 schema 不是合法 JSON，保存前请先修正。",
      };
    }
  }, [watchedSchemaJson]);

  const selectStrategy = (strategyId: string) => {
    hydratedStrategyKeyRef.current = null;
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
      hydratedStrategyKeyRef.current = null;
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
      hydratedStrategyKeyRef.current = null;
      setPreviewVersionId(null);
      setSelectedId(null);
    },
    onError: (error: unknown) => {
      message.error(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ strategyId, versionId }: { strategyId: string; versionId: string }) =>
      api.restoreStrategyVersion(strategyId, versionId),
    onSuccess: async (saved) => {
      message.success(`已用历史版本覆盖当前策略：${saved.current_version}`);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["strategy-template", saved.id] });
      await queryClient.invalidateQueries({ queryKey: ["strategy-versions", saved.id] });
      hydratedStrategyKeyRef.current = null;
      setPreviewVersionId(null);
      setSelectedId(saved.id);
    },
    onError: (error: unknown) => {
      message.error(`恢复失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  // ── 导入导出 ──
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importFileContent, setImportFileContent] = useState<StrategyExportPayload | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!selectedId || !selectedIsUserStrategy) return;
    setExporting(true);
    try {
      const payload = await api.exportStrategy(selectedId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selectedId}.quantpilot.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success(`策略 ${selectedId} 已导出`);
    } catch (error: unknown) {
      message.error(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string) as StrategyExportPayload;
        if (!content.format_version || !content.strategy) {
          message.error("无效的策略导出文件：缺少 format_version 或 strategy 字段");
          return;
        }
        setImportFileContent(content);
        setImportOverwrite(false);
        setImportModalOpen(true);
      } catch {
        message.error("无法解析 JSON 文件，请检查文件格式");
      }
    };
    reader.readAsText(file);
    return false;
  };

  const importMutation = useMutation({
    mutationFn: (params: { payload: StrategyExportPayload; overwrite: boolean }) =>
      api.importStrategy(params.payload, params.overwrite),
    onSuccess: async (saved) => {
      message.success(`策略已导入：${saved.id}`);
      setImportModalOpen(false);
      setImportFileContent(null);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSelectedId(saved.id);
    },
    onError: (error: unknown) => {
      message.error(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  // ── 可见性管理 ──
  const visibilityMutation = useMutation({
    mutationFn: ({ strategyId, visibility }: { strategyId: string; visibility: string }) =>
      api.setVisibility(strategyId, visibility),
    onSuccess: async () => {
      message.success("可见性已更新");
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["strategy-template", selectedId as string] });
    },
    onError: (error: unknown) => {
      message.error(`可见性更新失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  // ── 版本对比 ──
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const compareQuery = useQuery({
    queryKey: ["strategy-compare", selectedId],
    queryFn: () => api.compareStrategyVersions(selectedId as string),
    enabled: false,
    retry: false,
  });

  // ── 快速验证 ──
  const validateMutation = useMutation({
    mutationFn: () => api.validateCode(code),
    onSuccess: (result) => {
      if (result.valid) {
        const stats = result.stats;
        const msg = stats
          ? `验证通过：处理 ${stats.bars_processed} 根 Bar，生成 ${stats.orders_generated} 个订单，${stats.trades} 笔成交`
          : "验证通过";
        message.success(msg);
        if (result.warnings.length > 0) {
          result.warnings.forEach((w) => message.warning(w.message));
        }
      } else {
        result.errors.forEach((e) => message.error(`[${e.type}] ${e.message}`));
      }
    },
    onError: (error: unknown) => {
      message.error(`验证失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  // ── 标签与分类 ──
  const allTagsQuery = useQuery({ queryKey: ["all-tags"], queryFn: api.listAllTags });
  const allTags = allTagsQuery.data?.tags ?? [];
  const tagOptions: SelectProps["options"] = useMemo(
    () => allTags.map((t) => ({ value: t, label: t })),
    [allTags],
  );
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const categoryOptions = categoriesQuery.data?.categories ?? [];
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [editingCategory, setEditingCategory] = useState("custom");

  const tagsMutation = useMutation({
    mutationFn: (params: { strategyId: string; tags: string[]; category: string }) =>
      api.updateStrategyTags(params.strategyId, params.tags, params.category),
    onSuccess: async () => {
      message.success("标签和分类已更新");
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["all-tags"] });
    },
    onError: (error: unknown) => {
      message.error(`更新失败：${error instanceof Error ? error.message : String(error)}`);
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
      params_schema: codeParamsSchema ?? paramsSchema,
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
            extra={
              <Space size={8}>
                <Upload
                  accept=".json"
                  showUploadList={false}
                  beforeUpload={handleImportFile}
                >
                  <Button size="small" icon={<UploadOutlined />}>
                    导入
                  </Button>
                </Upload>
                <Tag bordered={false}>{templates.length} 个</Tag>
              </Space>
            }
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
                    <>
                      <Button
                        icon={<DownloadOutlined />}
                        loading={exporting}
                        onClick={handleExport}
                      >
                        导出
                      </Button>
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
                    </>
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
                    onClick={() => {
                      const params = new URLSearchParams({ template: selected.id });
                      if (selected.current_version) {
                        params.set("version", selected.current_version);
                      }
                      navigate(`/backtest?${params.toString()}`);
                    }}
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
                                key: "visibility",
                                label: "可见性",
                                children: selectedIsUserStrategy ? (
                                  <Switch
                                    checked={selected.visibility === "public"}
                                    checkedChildren="公开"
                                    unCheckedChildren="私有"
                                    loading={visibilityMutation.isPending}
                                    onChange={(checked) =>
                                      visibilityMutation.mutate({
                                        strategyId: selected.id,
                                        visibility: checked ? "public" : "private",
                                      })
                                    }
                                  />
                                ) : (
                                  "内置模板（公开）"
                                ),
                              },
                              {
                                key: "updated",
                                label: "最后更新",
                                children: formatTimestamp(selected.updated_at),
                              },
                            ]}
                          />
                          {selectedIsUserStrategy && (
                            <Card
                              size="small"
                              title="标签与分类"
                              style={{ marginTop: 16 }}
                              extra={
                                <Button
                                  size="small"
                                  type="primary"
                                  loading={tagsMutation.isPending}
                                  onClick={() =>
                                    tagsMutation.mutate({
                                      strategyId: selected.id,
                                      tags: editingTags,
                                      category: editingCategory,
                                    })
                                  }
                                >
                                  保存
                                </Button>
                              }
                            >
                              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    分类
                                  </Text>
                                  <Select
                                    value={editingCategory}
                                    onChange={(v) => setEditingCategory(v)}
                                    options={categoryOptions}
                                    style={{ width: "100%" }}
                                    size="small"
                                  />
                                </div>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    标签（最多 10 个）
                                  </Text>
                                  <Select
                                    mode="tags"
                                    value={editingTags}
                                    onChange={(v) => setEditingTags(v.slice(0, 10))}
                                    options={tagOptions}
                                    style={{ width: "100%" }}
                                    size="small"
                                    placeholder="输入标签后回车添加"
                                    maxCount={10}
                                  />
                                </div>
                              </Space>
                            </Card>
                          )}
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
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                            <Title level={5} style={{ marginBottom: 0 }}>
                              <CodeOutlined style={{ marginRight: 6 }} />
                              Python 策略代码
                            </Title>
                            <Space size={4} wrap>
                              <Button
                                size="small"
                                type="link"
                                icon={<ExperimentOutlined />}
                                loading={validateMutation.isPending}
                                onClick={() => validateMutation.mutate()}
                              >
                                快速验证
                              </Button>
                              <Text type="secondary" style={{ fontSize: 11 }}>片段:</Text>
                              {EDITOR_SNIPPETS.map((s) => (
                                <Tooltip key={s.label} title={s.description}>
                                  <Button
                                    size="small"
                                    type="dashed"
                                    onClick={() => {
                                      const insertText = typeof s.code === "function" ? s.code(code) : s.code;
                                      setCode(insertText);
                                    }}
                                  >
                                    {s.label}
                                  </Button>
                                </Tooltip>
                              ))}
                            </Space>
                          </div>
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
                            tooltip="从 Python 代码里的 PARAMS_SCHEMA 自动同步；请在代码中修改 PARAMS_SCHEMA。"
                          >
                            <TextArea rows={10} className="qp-mono" readOnly />
                          </Form.Item>
                          {schemaPreview.error ? (
                            <Alert type="warning" showIcon message={schemaPreview.error} />
                          ) : (
                            <>
                              {codeParamsSchema ? (
                                <Alert
                                  type="info"
                                  showIcon
                                  message="参数定义已从当前 Python 代码的 PARAMS_SCHEMA 同步。"
                                  style={{ marginBottom: 12 }}
                                />
                              ) : (
                                <Alert
                                  type="warning"
                                  showIcon
                                  message="当前代码未声明可解析的 PARAMS_SCHEMA，参数定义会显示为空。"
                                  style={{ marginBottom: 12 }}
                                />
                              )}
                              <Text type="secondary">表单预览</Text>
                              <div style={{ marginTop: 12 }}>
                                {renderSchemaForm(schemaPreview.effective) ?? (
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
                          <>
                            <div style={{ marginBottom: 12 }}>
                              <Button
                                icon={<SwapOutlined />}
                                onClick={() => {
                                  compareQuery.refetch();
                                  setCompareModalOpen(true);
                                }}
                              >
                                版本回测对比
                              </Button>
                            </div>
                            <VersionHistoryPanel
                              versions={versions}
                              currentVersion={selected.current_version}
                              loading={versionsQuery.isLoading}
                              onPreview={(versionId) => setPreviewVersionId(versionId)}
                              onRestore={(versionId) =>
                                restoreMutation.mutate({
                                  strategyId: selected.id,
                                  versionId,
                                })
                              }
                              restoring={restoreMutation.isPending}
                            />
                          </>
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
            <Popconfirm
              title="用该历史版本覆盖当前策略？"
              description="当前策略代码和参数定义会被替换，并自动生成一个新的当前版本。"
              okText="覆盖"
              cancelText="取消"
              onConfirm={() => {
                if (!selectedId || !versionDetailQuery.data) return;
                restoreMutation.mutate({
                  strategyId: selectedId,
                  versionId: versionDetailQuery.data.version_id,
                });
              }}
            >
              <Button
                type="primary"
                danger
                loading={restoreMutation.isPending}
                disabled={versionDetailQuery.data.version_id === selected?.current_version}
              >
                用此版本覆盖当前策略
              </Button>
            </Popconfirm>
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

      {/* 导入策略 */}
      <Modal
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportFileContent(null);
        }}
        title="导入策略"
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setImportModalOpen(false);
              setImportFileContent(null);
            }}
          >
            取消
          </Button>,
          <Button
            key="import"
            type="primary"
            loading={importMutation.isPending}
            onClick={() => {
              if (importFileContent) {
                importMutation.mutate({
                  payload: importFileContent,
                  overwrite: importOverwrite,
                });
              }
            }}
          >
            导入
          </Button>,
        ]}
        width={600}
      >
        {importFileContent ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Descriptions
              size="small"
              bordered
              column={1}
              items={[
                { key: "id", label: "策略 ID", children: importFileContent.strategy.id },
                { key: "title", label: "名称", children: importFileContent.strategy.title },
                {
                  key: "description",
                  label: "描述",
                  children: importFileContent.strategy.description || "无描述",
                },
                {
                  key: "versions",
                  label: "包含版本",
                  children: `${importFileContent.strategy.versions?.length ?? 0} 个版本`,
                },
                {
                  key: "exported",
                  label: "导出时间",
                  children: formatTimestamp(importFileContent.exported_at),
                },
              ]}
            />
            <div>
              <Space>
                <Switch
                  checked={importOverwrite}
                  onChange={setImportOverwrite}
                />
                <span>覆盖同名策略（若已存在）</span>
              </Space>
            </div>
            <Alert
              type="warning"
              showIcon
              message="导入策略代码将在本地执行。仅导入来自可信来源的策略文件。"
            />
          </Space>
        ) : (
          <Empty description="请选择策略导出文件" />
        )}
      </Modal>

      {/* 版本回测对比 */}
      <Modal
        open={compareModalOpen}
        onCancel={() => setCompareModalOpen(false)}
        footer={null}
        width={900}
        title={`版本回测对比 — ${selected?.title ?? selectedId}`}
      >
        {compareQuery.isLoading ? (
          <Empty description="正在加载对比数据" />
        ) : compareQuery.data?.comparisons?.length ? (
          <Table<VersionComparison["comparisons"][number]>
            dataSource={compareQuery.data.comparisons}
            rowKey="version_id"
            pagination={false}
            size="small"
            columns={[
              {
                title: "版本",
                dataIndex: "version_id",
                key: "version_id",
                render: (value: string) => (
                  <Space>
                    <Tag color="volcano">{value}</Tag>
                    {value === selected?.current_version && (
                      <Tag bordered={false}>当前</Tag>
                    )}
                  </Space>
                ),
              },
              {
                title: "回测次数",
                dataIndex: "run_count",
                key: "run_count",
                align: "right",
              },
              {
                title: "累计收益",
                dataIndex: "cumulative_return",
                key: "cumulative_return",
                align: "right",
                render: (value: number | null) =>
                  value != null ? (
                    <span style={{ color: value >= 0 ? "#3f6b48" : "#bd3f29" }}>
                      {(value * 100).toFixed(2)}%
                    </span>
                  ) : (
                    "-"
                  ),
                sorter: (a, b) => (a.cumulative_return ?? -999) - (b.cumulative_return ?? -999),
                defaultSortOrder: "descend",
              },
              {
                title: "年化收益",
                dataIndex: "annualized_return",
                key: "annualized_return",
                align: "right",
                render: (value: number | null) =>
                  value != null ? `${(value * 100).toFixed(2)}%` : "-",
              },
              {
                title: "夏普比率",
                dataIndex: "sharpe_ratio",
                key: "sharpe_ratio",
                align: "right",
                render: (value: number | null) =>
                  value != null ? value.toFixed(2) : "-",
              },
              {
                title: "最大回撤",
                dataIndex: "max_drawdown",
                key: "max_drawdown",
                align: "right",
                render: (value: number | null) =>
                  value != null ? `${(value * 100).toFixed(2)}%` : "-",
              },
              {
                title: "胜率",
                dataIndex: "win_rate",
                key: "win_rate",
                align: "right",
                render: (value: number | null) =>
                  value != null ? `${(value * 100).toFixed(1)}%` : "-",
              },
            ]}
          />
        ) : (
          <Empty
            description={
              compareQuery.data?.message ||
              "尚未找到该策略的回测记录。请先用各版本执行回测后再对比。"
            }
          />
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
  onRestore: (versionId: string) => void;
  restoring: boolean;
}> = ({ versions, currentVersion, loading, onPreview, onRestore, restoring }) => (
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
          <Popconfirm
            key="restore"
            title="用该历史版本覆盖当前策略？"
            description="会替换当前代码和参数定义，并生成一个新的当前版本。"
            okText="覆盖"
            cancelText="取消"
            onConfirm={() => onRestore(item.version_id)}
          >
            <Button
              type="link"
              danger
              loading={restoring}
              disabled={item.version_id === currentVersion}
            >
              覆盖当前
            </Button>
          </Popconfirm>,
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
    signature: "sma(close, window)",
  },
  {
    name: "EMA",
    kind: "趋势",
    description: "指数加权移动平均，最近价格权重更高",
    signature: "ema(close, window)",
  },
  {
    name: "RSI",
    kind: "动量",
    description: "相对强弱指标，识别超买超卖",
    signature: "rsi(close, period=14)",
  },
  {
    name: "MACD",
    kind: "动量",
    description: "MACD 线 / 信号线 / 柱状差",
    signature: "macd(close, fast=12, slow=26, signal=9)",
  },
  {
    name: "Bollinger",
    kind: "波动",
    description: "布林带：上轨/中轨/下轨，识别超买超卖和波动收缩",
    signature: "bollinger_bands(close, window=20, num_std=2.0)",
  },
  {
    name: "ATR",
    kind: "波动",
    description: "平均真实波幅，衡量市场波动程度",
    signature: "atr(high, low, close, window=14)",
  },
  {
    name: "KDJ",
    kind: "动量",
    description: "随机指标 K/D/J 线，判断超买超卖和拐点",
    signature: "kdj(high, low, close, n=9, k_window=3, d_window=3)",
  },
  {
    name: "OBV",
    kind: "量价",
    description: "能量潮，用成交量验证价格趋势",
    signature: "obv(close, volume)",
  },
  {
    name: "Williams %R",
    kind: "动量",
    description: "威廉指标，-80 以下超卖，-20 以上超买",
    signature: "williams_r(high, low, close, window=14)",
  },
];

const EDITOR_SNIPPETS: Array<{
  label: string;
  description: string;
  code: string | ((current: string) => string);
}> = [
  {
    label: "新策略",
    description: "Strategy 子类模板，包含 initialize / on_bar / finalize",
    code: `from app.strategy.base import Strategy, StrategyContext

class MyStrategy(Strategy):
    def initialize(self, params):
        pass

    def on_bar(self, ctx: StrategyContext):
        # 在此编写策略逻辑
        # ctx.order_target_percent(0.95)  # 调仓至目标仓位
        # ctx.submit_order("buy", 100)     # 按数量下单
        pass

    def finalize(self):
        pass
`,
  },
  {
    label: "SMA 交叉",
    description: "双均线交叉清仓/建仓模式",
    code: `from app.strategy.base import Strategy, StrategyContext
from app.strategy.indicators import sma

class MySmaStrategy(Strategy):
    def initialize(self, params):
        self.short = int(params.get("short_window", 5))
        self.long = int(params.get("long_window", 20))
        self.target = float(params.get("target_percent", 0.95))

    def on_bar(self, ctx: StrategyContext):
        if len(ctx.history) < self.long:
            return
        import pandas as pd
        closes = pd.Series([b.close for b in ctx.history])
        short_ma = sma(closes, self.short)
        long_ma = sma(closes, self.long)
        if short_ma.iloc[-2] <= long_ma.iloc[-2] and short_ma.iloc[-1] > long_ma.iloc[-1]:
            ctx.order_target_percent(self.target)
        elif short_ma.iloc[-2] >= long_ma.iloc[-2] and short_ma.iloc[-1] < long_ma.iloc[-1]:
            ctx.order_target_percent(0.0)
`,
  },
  {
    label: "RSI 反转",
    description: "RSI 超买/超卖反转逻辑",
    code: `from app.strategy.base import Strategy, StrategyContext
from app.strategy.indicators import rsi

class MyRsiStrategy(Strategy):
    def initialize(self, params):
        self.window = int(params.get("window", 14))
        self.oversold = float(params.get("oversold", 30))
        self.overbought = float(params.get("overbought", 70))
        self.target = float(params.get("target_percent", 0.95))
        self.invested = False

    def on_bar(self, ctx: StrategyContext):
        if len(ctx.history) < self.window:
            return
        import pandas as pd
        closes = pd.Series([b.close for b in ctx.history])
        rsi_value = rsi(closes, self.window).iloc[-1]
        if not self.invested and rsi_value <= self.oversold:
            ctx.order_target_percent(self.target)
            self.invested = True
        elif self.invested and rsi_value >= self.overbought:
            ctx.order_target_percent(0.0)
            self.invested = False
`,
  },
  {
    label: "PARAMS_SCHEMA",
    description: "插入参数定义模板",
    code: `
PARAMS_SCHEMA = {
    "type": "object",
    "title": "策略参数",
    "properties": {
        "target_percent": {
            "type": "number",
            "title": "目标仓位",
            "minimum": 0.01,
            "maximum": 1.0,
            "default": 0.95,
        },
    },
    "required": ["target_percent"],
}
`,
  },
];

export default StrategiesPage;
