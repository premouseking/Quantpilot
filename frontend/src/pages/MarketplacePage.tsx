/**
 * 策略市场页
 *
 * 展示所有公开策略，支持浏览、Fork、评论、复制为我的策略、直接回测。
 */
import React, { useState } from "react";
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
  List,
  Modal,
  Popconfirm,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  BranchesOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  ExperimentOutlined,
  GlobalOutlined,
  MessageOutlined,
  SendOutlined,
  TagOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MarketplaceStrategy, StrategyComment } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { QPColors } from "../theme";
import Editor from "@monaco-editor/react";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
};

const CATEGORY_LABELS: Record<string, string> = {
  trend: "趋势跟踪",
  reversal: "反转策略",
  momentum: "动量策略",
  mean_reversion: "均值回归",
  arbitrage: "套利策略",
  ml: "机器学习",
  custom: "自定义",
};

const MarketplacePage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [previewStrategy, setPreviewStrategy] = useState<MarketplaceStrategy | null>(null);
  const [forkModalOpen, setForkModalOpen] = useState(false);
  const [forkTarget, setForkTarget] = useState<MarketplaceStrategy | null>(null);
  const [forkForm] = Form.useForm();
  const [commentContent, setCommentContent] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");

  const marketplaceQuery = useQuery({
    queryKey: ["marketplace"],
    queryFn: api.listMarketplaceStrategies,
  });

  const strategies = marketplaceQuery.data?.strategies ?? [];

  const commentsQuery = useQuery({
    queryKey: ["comments", previewStrategy?.id],
    queryFn: () => api.listComments(previewStrategy?.id as string),
    enabled: Boolean(previewStrategy),
  });

  const copyMutation = useMutation({
    mutationFn: (source: MarketplaceStrategy) =>
      api.saveUserStrategy({
        id: `${source.id}_public`,
        title: `${source.title}（来自市场）`,
        description: `从策略市场复制的公开策略。`,
        code: source.code,
        params_schema: source.params_schema,
        overwrite: false,
        version_note: "从策略市场导入",
        visibility: "private",
        tags: source.tags,
        category: source.category,
        forked_from: source.id,
      }),
    onSuccess: async (saved) => {
      message.success(`策略已复制为我的策略：${saved.id}`);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      navigate(`/strategies`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("already exists")) {
        message.warning("该策略已存在于我的策略中，请先删除或重命名本地副本");
      } else {
        message.error(`复制失败：${msg}`);
      }
    },
  });

  const forkMutation = useMutation({
    mutationFn: (params: { sourceId: string; newId: string; newTitle: string }) =>
      api.forkStrategy(params.sourceId, params.newId, params.newTitle),
    onSuccess: async (saved) => {
      message.success(`已 Fork 为我的策略：${saved.id}`);
      setForkModalOpen(false);
      setForkTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      navigate(`/strategies`);
    },
    onError: (error: unknown) => {
      message.error(`Fork 失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: () =>
      api.addComment(previewStrategy?.id as string, commentAuthor || "匿名", commentContent),
    onSuccess: async () => {
      message.success("评论已发表");
      setCommentContent("");
      await queryClient.invalidateQueries({
        queryKey: ["comments", previewStrategy?.id],
      });
    },
    onError: (error: unknown) => {
      message.error(`评论失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      api.deleteComment(previewStrategy?.id as string, commentId),
    onSuccess: async () => {
      message.success("评论已删除");
      await queryClient.invalidateQueries({
        queryKey: ["comments", previewStrategy?.id],
      });
    },
    onError: (error: unknown) => {
      message.error(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    },
  });

  const comments = commentsQuery.data?.comments ?? [];

  return (
    <div className="qp-page">
      <PageHeader
        title="策略市场"
        subtitle="浏览公开分享的策略，Fork 到我的策略、参与讨论或直接回测验证。"
        badge={
          <Tag icon={<GlobalOutlined />} color="volcano" bordered={false}>
            公开策略
          </Tag>
        }
      />

      <Alert
        type="info"
        showIcon
        message="策略市场展示所有标记为公开的用户策略。Fork 和复制策略代码将在本地可信环境中执行，请自行评估策略逻辑与风险。"
        style={{ marginBottom: 16 }}
      />

      {marketplaceQuery.isLoading ? (
        <Card loading />
      ) : strategies.length === 0 ? (
        <Card>
          <Empty
            description={
              <Space direction="vertical" size={4}>
                <span>暂无公开策略</span>
                <Text type="secondary">
                  前往"策略工作台"将我的策略设为公开后即可在此展示
                </Text>
              </Space>
            }
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {strategies.map((strategy) => (
            <Col xs={24} md={12} xl={8} key={strategy.id}>
              <Card
                hoverable
                title={
                  <Space wrap size={[4, 4]}>
                    <ExperimentOutlined style={{ color: QPColors.vermilion }} />
                    <span>{strategy.title}</span>
                  </Space>
                }
                extra={
                  <Tag bordered={false} color="volcano">
                    {strategy.id}
                  </Tag>
                }
                actions={[
                  <Tooltip title="查看详情与评论" key="view">
                    <Button
                      type="link"
                      icon={<EyeOutlined />}
                      onClick={() => setPreviewStrategy(strategy)}
                    >
                      查看
                    </Button>
                  </Tooltip>,
                  <Tooltip title="Fork 到我的策略" key="fork">
                    <Button
                      type="link"
                      icon={<BranchesOutlined />}
                      onClick={() => {
                        setForkTarget(strategy);
                        forkForm.setFieldsValue({
                          newId: `${strategy.id}_fork`,
                          newTitle: `${strategy.title} (Fork)`,
                        });
                        setForkModalOpen(true);
                      }}
                    >
                      Fork
                    </Button>
                  </Tooltip>,
                  <Tooltip title="用此策略直接回测" key="backtest">
                    <Button
                      type="link"
                      icon={<ThunderboltOutlined />}
                      onClick={() => navigate(`/backtest?template=${strategy.id}`)}
                    >
                      回测
                    </Button>
                  </Tooltip>,
                ]}
              >
                <Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  style={{ marginBottom: 8, minHeight: 42 }}
                >
                  {strategy.description || "无描述"}
                </Paragraph>
                <div style={{ marginBottom: 8 }}>
                  {strategy.category && strategy.category !== "custom" && (
                    <Tag color="blue" bordered={false}>
                      {CATEGORY_LABELS[strategy.category] || strategy.category}
                    </Tag>
                  )}
                  {strategy.tags?.slice(0, 3).map((tag) => (
                    <Tag key={tag} bordered={false} icon={<TagOutlined />}>
                      {tag}
                    </Tag>
                  ))}
                  {(strategy.tags?.length ?? 0) > 3 && (
                    <Tag bordered={false}>+{strategy.tags!.length - 3}</Tag>
                  )}
                  {strategy.forked_from && (
                    <Tag color="purple" bordered={false}>
                      Fork
                    </Tag>
                  )}
                </div>
                <Descriptions size="small" column={2} colon={false}>
                  <Descriptions.Item label="版本">
                    {strategy.current_version ?? "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="更新于">
                    {formatTimestamp(strategy.updated_at)}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 策略预览弹窗（含评论） */}
      <Modal
        open={Boolean(previewStrategy)}
        onCancel={() => setPreviewStrategy(null)}
        footer={[
          <Button
            key="fork"
            icon={<BranchesOutlined />}
            onClick={() => {
              if (previewStrategy) {
                setForkTarget(previewStrategy);
                forkForm.setFieldsValue({
                  newId: `${previewStrategy.id}_fork`,
                  newTitle: `${previewStrategy.title} (Fork)`,
                });
                setForkModalOpen(true);
              }
            }}
          >
            Fork 此策略
          </Button>,
          <Button
            key="backtest"
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => {
              if (previewStrategy) {
                navigate(`/backtest?template=${previewStrategy.id}`);
              }
            }}
          >
            用此策略回测
          </Button>,
        ]}
        width={920}
        title={
          previewStrategy ? (
            <Space wrap>
              <span>{previewStrategy.title}</span>
              <Tag color="volcano">{previewStrategy.id}</Tag>
            </Space>
          ) : (
            "策略预览"
          )
        }
      >
        {previewStrategy ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: "id", label: "策略 ID", children: previewStrategy.id },
                { key: "title", label: "名称", children: previewStrategy.title },
                { key: "description", label: "描述", children: previewStrategy.description || "无描述" },
                { key: "visibility", label: "可见性", children: <Tag color="volcano">公开</Tag> },
                {
                  key: "category",
                  label: "分类",
                  children: CATEGORY_LABELS[previewStrategy.category ?? ""] ?? previewStrategy.category ?? "自定义",
                },
                {
                  key: "tags",
                  label: "标签",
                  children:
                    previewStrategy.tags?.length ? (
                      <Space wrap size={[4, 4]}>
                        {previewStrategy.tags.map((t) => (
                          <Tag key={t} bordered={false}>
                            {t}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      "无"
                    ),
                },
                {
                  key: "forked",
                  label: "来源",
                  children: previewStrategy.forked_from ? (
                    <Space size={4}>
                      <BranchesOutlined />
                      <span>Fork 自 {previewStrategy.forked_from}</span>
                      {previewStrategy.forked_at && (
                        <span style={{ color: QPColors.textMuted, fontSize: 12 }}>
                          ({formatTimestamp(previewStrategy.forked_at)})
                        </span>
                      )}
                    </Space>
                  ) : (
                    "原创策略"
                  ),
                },
                { key: "current_version", label: "当前版本", children: previewStrategy.current_version ?? "—" },
                { key: "version_count", label: "版本数", children: `${previewStrategy.version_count ?? 0} 个版本` },
                { key: "updated", label: "最后更新", children: formatTimestamp(previewStrategy.updated_at) },
              ]}
            />
            <Divider style={{ margin: "4px 0" }} />
            <Title level={5}>策略代码</Title>
            <Editor
              height="280px"
              defaultLanguage="python"
              value={previewStrategy.code}
              options={{
                minimap: { enabled: false },
                readOnly: true,
                scrollBeyondLastLine: false,
                fontSize: 12.5,
              }}
            />

            {/* 评论区域 */}
            <Divider style={{ margin: "4px 0" }} />
            <Title level={5}>
              <MessageOutlined style={{ marginRight: 6 }} />
              评论 ({comments.length})
            </Title>

            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Input
                placeholder="昵称（可选）"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                maxLength={60}
                size="small"
                style={{ width: 200 }}
              />
              <TextArea
                rows={2}
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="写下你的评论..."
                maxLength={500}
              />
              <Button
                icon={<SendOutlined />}
                type="primary"
                loading={addCommentMutation.isPending}
                disabled={!commentContent.trim()}
                onClick={() => addCommentMutation.mutate()}
              >
                发表评论
              </Button>
            </Space>

            {commentsQuery.isLoading ? (
              <Text type="secondary">加载评论中...</Text>
            ) : comments.length === 0 ? (
              <Text type="secondary">暂无评论，来发表第一条吧</Text>
            ) : (
              <List
                dataSource={comments}
                renderItem={(item: StrategyComment) => (
                  <div
                    style={{
                      padding: "12px 0",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 500, fontSize: 13 }}>
                        {item.author}
                      </span>
                      <Space size={8}>
                        <span style={{ fontSize: 11, color: QPColors.textMuted }}>
                          {formatTimestamp(item.created_at)}
                        </span>
                        <Popconfirm
                          title="删除这条评论？"
                          onConfirm={() => deleteCommentMutation.mutate(item.id)}
                        >
                          <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>
                      </Space>
                    </div>
                    <Paragraph
                      style={{ marginBottom: 0, fontSize: 13, color: QPColors.textPrimary }}
                    >
                      {item.content}
                    </Paragraph>
                  </div>
                )}
              />
            )}
          </Space>
        ) : (
          <Empty description="请选择策略" />
        )}
      </Modal>

      {/* Fork 弹窗 */}
      <Modal
        open={forkModalOpen}
        onCancel={() => {
          setForkModalOpen(false);
          setForkTarget(null);
        }}
        title="Fork 策略到我的策略"
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setForkModalOpen(false);
              setForkTarget(null);
            }}
          >
            取消
          </Button>,
          <Button
            key="fork"
            type="primary"
            icon={<BranchesOutlined />}
            loading={forkMutation.isPending}
            onClick={() => {
              forkForm.validateFields().then((values) => {
                forkMutation.mutate({
                  sourceId: forkTarget?.id as string,
                  newId: values.newId,
                  newTitle: values.newTitle,
                });
              });
            }}
          >
            确认 Fork
          </Button>,
        ]}
        width={500}
      >
        {forkTarget && (
          <Form form={forkForm} layout="vertical">
            <Alert
              type="info"
              showIcon
              message={`将从「${forkTarget.title}」Fork 一份副本到我的策略，保留原始标签与分类。`}
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              label="新策略 ID"
              name="newId"
              rules={[
                { required: true, message: "请输入新策略 ID" },
                {
                  pattern: /^[a-z][a-z0-9_]{2,63}$/,
                  message: "仅支持小写字母、数字、下划线，且以字母开头",
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="策略名称"
              name="newTitle"
              rules={[{ required: true, message: "请输入策略名称" }]}
            >
              <Input />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default MarketplacePage;
