import React, { useMemo } from "react";
import { Layout, Menu, Tag } from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  AppstoreOutlined,
  SettingOutlined,
  GithubOutlined,
} from "@ant-design/icons";
import { runtimeConfig } from "../runtimeConfig";

const { Sider, Content, Header } = Layout;

const NAV_ITEMS = [
  { key: "/", icon: <DashboardOutlined />, label: "概览" },
  { key: "/data", icon: <DatabaseOutlined />, label: "数据接入" },
  { key: "/strategies", icon: <ExperimentOutlined />, label: "策略" },
  { key: "/backtest", icon: <ThunderboltOutlined />, label: "回测" },
  { key: "/runs", icon: <HistoryOutlined />, label: "回测记录" },
  { key: "/optimization", icon: <AppstoreOutlined />, label: "参数优化" },
  { key: "/settings", icon: <SettingOutlined />, label: "设置" },
];

const LABEL_BY_PATH: Record<string, string> = NAV_ITEMS.reduce(
  (acc, item) => {
    acc[item.key] = item.label;
    return acc;
  },
  {} as Record<string, string>,
);

export const AppLayout: React.FC = () => {
  const location = useLocation();

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith("/runs")) return "/runs";
    if (location.pathname.startsWith("/backtest")) return "/backtest";
    if (location.pathname.startsWith("/strategies")) return "/strategies";
    if (location.pathname.startsWith("/data")) return "/data";
    if (location.pathname.startsWith("/optimization")) return "/optimization";
    if (location.pathname.startsWith("/settings")) return "/settings";
    return "/";
  }, [location.pathname]);

  const crumb = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return LABEL_BY_PATH["/"];
    const baseLabel = LABEL_BY_PATH["/" + parts[0]] ?? parts[0];
    if (parts.length === 1) return baseLabel;
    return `${baseLabel} / ${parts.slice(1).join(" / ")}`;
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Sider width={220} theme="dark" className="qp-sider">
        <div className="qp-sider-brand">
          <span className="qp-sider-brand__dot" />
          Quantpilot
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: <Link to={item.key}>{item.label}</Link>,
          }))}
          style={{ borderRight: 0, paddingTop: 12 }}
        />
        <div className="qp-sider-footer">
          <span>v0.1.0</span>
          <span>
            <GithubOutlined style={{ marginRight: 4 }} />
            local
          </span>
        </div>
      </Sider>
      <Layout style={{ background: "transparent" }}>
        <Header className="qp-topbar">
          <div className="qp-topbar__crumbs">
            <span style={{ color: "#bd3f29", marginRight: 8, letterSpacing: 1 }}>
              ─
            </span>
            {crumb}
          </div>
          <div className="qp-topbar__right">
            <Tag bordered={false} color={runtimeConfig.profile === "prod" ? "red" : "default"}>
              {runtimeConfig.profile}
            </Tag>
            <span className="qp-mono" style={{ fontSize: 12 }}>
              {runtimeConfig.apiBaseUrl || "/api proxy"}
            </span>
          </div>
        </Header>
        <Content className="qp-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
