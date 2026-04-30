/**
 * 新建回测页
 *
 * 职责：采集策略模板、数据源、标的、时间区间与交易成本，组装 {@link BacktestRunRequest} 调用后端；
 * 成功后跳转至单次运行报告页。
 */
import React, { useEffect, useMemo } from "react";
import {
  Card,
  Form,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Space,
  Alert,
  App as AntdApp,
  Spin,
  Divider,
  Typography,
  Steps,
  Row,
  Col,
  Tag,
  Tooltip,
} from "antd";
import {
  RocketOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, BacktestRunRequest } from "../services/api";
import { ApiError } from "../services/apiClient";
import { PageHeader } from "../components/PageHeader";
import { QPColors } from "../theme";
import { fmtMoney, fmtPercent } from "../utils/format";

const { RangePicker } = DatePicker;
const { Text } = Typography;

/** 表单状态：字段命名采用 camelCase，提交时映射为 API 的 snake_case */
interface FormValues {
  templateId: string;
  provider: string;
  symbol: string;
  range: [Dayjs, Dayjs];
  initialCash: number;
  shortWindow: number;
  longWindow: number;
  targetPercent: number;
  commissionRate: number;
  stampTaxRate: number;
  slippageBps: number;
}

/** 初始表单值与演示口径；调整时请与后端示例/文档保持一致 */
const DEFAULTS: FormValues = {
  templateId: "dual_ma",
  provider: "mock",
  symbol: "MOCK001",
  range: [dayjs("2023-01-01"), dayjs("2024-12-31")],
  initialCash: 1_000_000,
  shortWindow: 5,
  longWindow: 20,
  targetPercent: 0.95,
  commissionRate: 0.0003,
  stampTaxRate: 0.001,
  slippageBps: 5,
};

/** 时间区间快捷填充配置（仅更新表单，不发请求） */
const RANGE_PRESETS: Array<{ label: string; build: () => [Dayjs, Dayjs] }> = [
  { label: "近 6 个月", build: () => [dayjs().subtract(6, "month"), dayjs()] },
  { label: "近 1 年", build: () => [dayjs().subtract(1, "year"), dayjs()] },
  { label: "近 3 年", build: () => [dayjs().subtract(3, "year"), dayjs()] },
  { label: "2023 全年", build: () => [dayjs("2023-01-01"), dayjs("2023-12-31")] },
  { label: "2024 全年", build: () => [dayjs("2024-01-01"), dayjs("2024-12-31")] },
];

const BacktestPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // --- 服务端枚举：数据源、策略模板 ---
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: api.listProviders });
  const templatesQuery = useQuery({ queryKey: ["templates"], queryFn: api.listStrategyTemplates });

  // --- 标的列表：随所选数据源联动 ---
  const provider = Form.useWatch("provider", form) ?? DEFAULTS.provider;
  const symbolsQuery = useQuery({
    queryKey: ["symbols", provider],
    queryFn: () => api.listSymbols(provider),
    enabled: Boolean(provider),
  });

  // --- 侧栏预览：监听相关字段，随表单变更即时刷新 ---
  const watchedSymbol = Form.useWatch("symbol", form) ?? DEFAULTS.symbol;
  const watchedTemplate = Form.useWatch("templateId", form) ?? DEFAULTS.templateId;
  const watchedRange = Form.useWatch("range", form) ?? DEFAULTS.range;
  const watchedCash = Form.useWatch("initialCash", form) ?? DEFAULTS.initialCash;
  const watchedShort = Form.useWatch("shortWindow", form) ?? DEFAULTS.shortWindow;
  const watchedLong = Form.useWatch("longWindow", form) ?? DEFAULTS.longWindow;
  const watchedTarget = Form.useWatch("targetPercent", form) ?? DEFAULTS.targetPercent;
  const watchedCommission = Form.useWatch("commissionRate", form) ?? DEFAULTS.commissionRate;
  const watchedStamp = Form.useWatch("stampTaxRate", form) ?? DEFAULTS.stampTaxRate;
  const watchedSlippage = Form.useWatch("slippageBps", form) ?? DEFAULTS.slippageBps;

  // --- 深链：URL ?template= 预填策略模板 ---
  useEffect(() => {
    const tplId = searchParams.get("template");
    if (tplId) {
      form.setFieldsValue({ templateId: tplId });
    }
  }, [searchParams, form]);

  // --- 回测提交：成功跳转报告；失败时全局提示（message）与页面 Alert ---
  const runMutation = useMutation({
    mutationFn: (payload: BacktestRunRequest) => api.runBacktest(payload),
    onSuccess: (envelope) => {
      message.success(`回测完成 · ${envelope.run_id}`);
      navigate(`/runs/${envelope.run_id}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof ApiError ? error.envelope.message : String(error);
      message.error(`回测失败：${msg}`);
    },
  });

  /** 将表单值转换为 API 载荷（日期归一到日起止 ISO，成本模型固定最小佣金与后端约定一致） */
  const handleSubmit = (values: FormValues) => {
    if (values.shortWindow >= values.longWindow) {
      message.warning("短均线窗口必须小于长均线窗口");
      return;
    }
    const [start, end] = values.range;
    const payload: BacktestRunRequest = {
      template_id: values.templateId,
      symbol: values.symbol,
      start: start.startOf("day").toISOString(),
      end: end.endOf("day").toISOString(),
      frequency: "daily",
      initial_cash: values.initialCash,
      data_provider: values.provider,
      strategy_params: {
        short_window: values.shortWindow,
        long_window: values.longWindow,
        target_percent: values.targetPercent,
      },
      cost_model: {
        commission_rate: values.commissionRate,
        min_commission: 5,
        stamp_tax_rate: values.stampTaxRate,
        slippage_bps: values.slippageBps,
      },
    };
    runMutation.mutate(payload);
  };

  const isLoading = runMutation.isPending;

  /**
   * Steps.current：与 Ant Design Steps 索引对齐。
   * 0 配置 / 出错复位；1 执行中；3 成功（指向「查看报告」）
   */
  const stepStatus = useMemo(() => {
    if (runMutation.isPending) return 1;
    if (runMutation.isError) return 0;
    if (runMutation.isSuccess) return 3;
    return 0;
  }, [runMutation.isPending, runMutation.isError, runMutation.isSuccess]);

  /**
   * 侧栏静态估算：自然日、近似交易日（按 252/365）、目标名义资金与往返费率。
   * 仅为辅助展示，不等价于回测真实成交与成本。
   */
  const preview = useMemo(() => {
    const [s, e] =
      Array.isArray(watchedRange) && watchedRange[0] && watchedRange[1]
        ? watchedRange
        : DEFAULTS.range;
    const days = Math.max(1, e.diff(s, "day"));
    const tradingDays = Math.round(days * (252 / 365));
    const targetNotional = watchedCash * watchedTarget;
    const oneTripCost = watchedCommission + watchedSlippage / 10000;
    const roundTripCost = oneTripCost * 2 + watchedStamp;
    return {
      days,
      tradingDays,
      targetNotional,
      roundTripCostPct: roundTripCost,
    };
  }, [watchedRange, watchedCash, watchedTarget, watchedCommission, watchedSlippage, watchedStamp]);

  /** 应用快捷时间区间到表单 */
  const applyPreset = (build: () => [Dayjs, Dayjs]) => {
    form.setFieldsValue({ range: build() });
  };

  return (
    <div className="qp-page">
      {/* 页头 */}
      <PageHeader
        title="新建回测"
        subtitle="配置策略、数据源、时间区间和成本模型，运行后将跳转到报告页查看资金曲线和指标。"
      />

      {/* 流程步骤指示（与 mutation 状态弱绑定，仅作进度感知） */}
      <Card>
        <Steps
          current={stepStatus}
          size="small"
          items={[
            { title: "配置参数", icon: <ThunderboltOutlined /> },
            { title: "执行回测", icon: <RocketOutlined /> },
            { title: "采集指标", icon: <ThunderboltOutlined /> },
            { title: "查看报告", icon: <CheckCircleOutlined /> },
          ]}
        />
      </Card>

      {/* 主布局：左侧表单 + 右侧粘性预览 */}
      <Row gutter={[16, 16]}>
        {/* 参数表单 */}
        <Col xs={24} lg={16}>
          <Card>
            <Form<FormValues>
              form={form}
              layout="vertical"
              initialValues={DEFAULTS}
              onFinish={handleSubmit}
            >
              <div className="qp-section-title">策略与标的</div>
              <div className="qp-form-grid">
                <Form.Item label="策略模板" name="templateId" required>
                  <Select
                    loading={templatesQuery.isLoading}
                    options={(templatesQuery.data?.templates ?? []).map((t) => ({
                      value: t.id,
                      label: t.title,
                    }))}
                  />
                </Form.Item>
                <Form.Item label="数据源" name="provider" required>
                  <Select
                    loading={providersQuery.isLoading}
                    options={(providersQuery.data?.providers ?? []).map((p) => ({
                      value: p,
                      label: p,
                    }))}
                  />
                </Form.Item>
                <Form.Item label="标的" name="symbol" required>
                  <Select
                    showSearch
                    loading={symbolsQuery.isLoading}
                    options={(symbolsQuery.data?.symbols ?? []).map((s) => ({
                      value: s,
                      label: s,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  label={
                    <Space size={6}>
                      <span>时间区间</span>
                      <Tooltip title="点击下方快捷区间快速填充">
                        <InfoCircleOutlined style={{ color: QPColors.textMuted }} />
                      </Tooltip>
                    </Space>
                  }
                  name="range"
                  required
                >
                  <RangePicker style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="初始资金 (CNY)" name="initialCash" required>
                  <InputNumber min={10_000} step={10_000} style={{ width: "100%" }} />
                </Form.Item>
              </div>

              <Space size={6} wrap style={{ marginTop: -8, marginBottom: 8 }}>
                <Tag
                  icon={<CalendarOutlined />}
                  color="default"
                  style={{ background: "transparent" }}
                >
                  快捷区间
                </Tag>
                {RANGE_PRESETS.map((p) => (
                  <Tag.CheckableTag
                    key={p.label}
                    checked={false}
                    onChange={() => applyPreset(p.build)}
                    style={{
                      cursor: "pointer",
                      border: "1px solid #c4b48f",
                      borderRadius: 2,
                      padding: "2px 10px",
                      letterSpacing: 0.4,
                    }}
                  >
                    {p.label}
                  </Tag.CheckableTag>
                ))}
              </Space>

              <Divider />
              <div className="qp-section-title">策略参数（双均线）</div>
              <div className="qp-form-grid">
                <Form.Item label="短均线窗口" name="shortWindow">
                  <InputNumber min={1} max={500} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="长均线窗口" name="longWindow">
                  <InputNumber min={2} max={1000} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="目标仓位比例" name="targetPercent">
                  <InputNumber min={0.01} max={1} step={0.05} style={{ width: "100%" }} />
                </Form.Item>
              </div>

              <Divider />
              <div className="qp-section-title">交易成本</div>
              <div className="qp-form-grid">
                <Form.Item label="佣金率" name="commissionRate">
                  <InputNumber min={0} step={0.0001} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="印花税率（卖出）" name="stampTaxRate">
                  <InputNumber min={0} step={0.0001} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="滑点 (bps)" name="slippageBps">
                  <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
                </Form.Item>
              </div>

              <Divider />
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<RocketOutlined />}
                  loading={isLoading}
                  size="large"
                >
                  运行回测
                </Button>
                <Button
                  size="large"
                  onClick={() => form.resetFields()}
                  disabled={isLoading}
                >
                  重置
                </Button>
                <Text type="secondary">
                  实时进度将通过 WebSocket 推送；计划于 Phase 3.5 接入。
                </Text>
              </Space>
            </Form>
          </Card>
        </Col>

        {/* 配置预览与成本估算侧栏 */}
        <Col xs={24} lg={8}>
          <div style={{ position: "sticky", top: 76, display: "flex", flexDirection: "column", gap: 12 }}>
            <Card title="本次回测预览" size="small">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                <PreviewRow
                  label="策略"
                  value={<Tag bordered={false}>{watchedTemplate}</Tag>}
                />
                <PreviewRow
                  label="标的 / 数据源"
                  value={
                    <Space size={4}>
                      <Tag bordered={false}>{watchedSymbol}</Tag>
                      <Tag bordered={false}>{provider}</Tag>
                    </Space>
                  }
                />
                <PreviewRow
                  label="区间"
                  value={
                    <span className="qp-mono" style={{ fontSize: 12 }}>
                      {Array.isArray(watchedRange) && watchedRange[0]
                        ? `${watchedRange[0].format("YYYY-MM-DD")} → ${watchedRange[1].format("YYYY-MM-DD")}`
                        : "—"}
                    </span>
                  }
                />
                <PreviewRow
                  label="自然日 / 估算交易日"
                  value={`${preview.days} / ~${preview.tradingDays}`}
                />
                <PreviewRow
                  label="初始资金"
                  value={<strong>{fmtMoney(watchedCash)}</strong>}
                />
                <PreviewRow
                  label="目标持仓金额"
                  value={
                    <span style={{ color: QPColors.brandPrimary, fontWeight: 600 }}>
                      {fmtMoney(preview.targetNotional)}
                      <span className="qp-muted" style={{ marginLeft: 4, fontSize: 11 }}>
                        ({fmtPercent(watchedTarget, 0)})
                      </span>
                    </span>
                  }
                />
              </Space>
            </Card>

            <Card title="成本估算" size="small">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                <PreviewRow label="均线窗口" value={`${watchedShort} / ${watchedLong}`} />
                <PreviewRow
                  label="单边费率"
                  value={fmtPercent(watchedCommission + watchedSlippage / 10000, 3)}
                />
                <PreviewRow
                  label="单笔往返费用"
                  value={
                    <span style={{ color: QPColors.danger }}>
                      {fmtPercent(preview.roundTripCostPct, 3)}
                    </span>
                  }
                />
                <PreviewRow
                  label="目标仓位往返成本"
                  value={
                    <span style={{ color: QPColors.danger }}>
                      {fmtMoney(preview.targetNotional * preview.roundTripCostPct)}
                    </span>
                  }
                />
                <Alert
                  type="info"
                  showIcon
                  banner
                  message="估算仅按当前参数静态推导，实际成本取决于成交频率与价格滑点。"
                  style={{ fontSize: 12 }}
                />
              </Space>
            </Card>
          </div>
        </Col>
      </Row>

      {/* 失败状态：与 message.error 并存，便于页面内留存查看 */}
      {runMutation.isError && !runMutation.isPending && (
        <Alert
          type="error"
          showIcon
          message="回测失败"
          description={
            runMutation.error instanceof ApiError
              ? `${runMutation.error.envelope.code}: ${runMutation.error.envelope.message}`
              : String(runMutation.error)
          }
        />
      )}

      {/* 提交后的加载占位 */}
      {isLoading && (
        <Card>
          <Space style={{ width: "100%", justifyContent: "center", padding: 32 }}>
            <Spin />
            <span style={{ color: QPColors.textSecondary }}>
              回测执行中，可能需要数秒。
            </span>
          </Space>
        </Card>
      )}
    </div>
  );
};

/** 预览卡片中的键值行：左标签、右对齐内容 */
const PreviewRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      fontSize: 13,
    }}
  >
    <span style={{ color: QPColors.textSecondary }}>{label}</span>
    <span style={{ textAlign: "right" }}>{value}</span>
  </div>
);

export default BacktestPage;
