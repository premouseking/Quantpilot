import React from "react";
import { Card, Descriptions, Tag, Alert, Skeleton, Result, Button, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { runtimeConfig } from "../runtimeConfig";
import { PageHeader } from "../components/PageHeader";

const SettingsPage: React.FC = () => {
  const runtimeQuery = useQuery({ queryKey: ["runtime"], queryFn: api.runtime, retry: 0 });
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 0 });

  return (
    <div className="qp-page">
      <PageHeader
        title="设置"
        subtitle="查看 Quantpilot 当前运行环境与连接信息；用户、权限、密钥等管理面板将在后续阶段补齐。"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              runtimeQuery.refetch();
              healthQuery.refetch();
            }}
          >
            刷新
          </Button>
        }
      />

      <Card title="前端 Profile">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Profile">
            <Tag bordered={false} color={runtimeConfig.profile === "prod" ? "red" : "default"}>
              {runtimeConfig.profile}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="API Base URL">
            <span className="qp-mono">{runtimeConfig.apiBaseUrl || "(vite proxy /api)"}</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={
          <Space>
            <span>后端运行信息</span>
            {healthQuery.isSuccess && <Tag color="success">在线</Tag>}
            {healthQuery.isError && <Tag color="error">不可达</Tag>}
          </Space>
        }
      >
        {runtimeQuery.isLoading ? (
          <Skeleton active />
        ) : runtimeQuery.isError ? (
          <Result
            status="warning"
            title="后端不可达"
            subTitle="请确认 uvicorn 已启动，或检查 VITE_API_BASE_URL 配置。"
          />
        ) : (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Profile">
              {runtimeQuery.data?.profile}
            </Descriptions.Item>
            <Descriptions.Item label="Host">
              <span className="qp-mono">
                {runtimeQuery.data?.api_host}:{runtimeQuery.data?.api_port}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="数据目录">
              <span className="qp-mono">{runtimeQuery.data?.data_dir}</span>
            </Descriptions.Item>
            <Descriptions.Item label="行情目录">
              <span className="qp-mono">{runtimeQuery.data?.market_dir}</span>
            </Descriptions.Item>
            <Descriptions.Item label="回测结果目录" span={2}>
              <span className="qp-mono">{runtimeQuery.data?.runs_dir}</span>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="账户与权限（占位）">
        <Alert
          type="info"
          showIcon
          message="多用户登录、权限分级、策略分享、评论与策略市场将在 Phase 6 实施。MVP 阶段默认本地单用户研究模式。"
        />
      </Card>

      <Card title="密钥与数据源凭证（占位）">
        <Alert
          type="warning"
          showIcon
          message="券商接口、Wind/Tushare 等数据源凭证管理需要单独的安全设计；当前请通过环境变量与本地 CSV 工作。"
        />
      </Card>
    </div>
  );
};

export default SettingsPage;
