import React from "react";
import { Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { BacktestMetrics } from "../services/api";
import { fmtNumber, fmtPercent, tone } from "../utils/format";

interface Props {
  metrics: BacktestMetrics;
}

interface Item {
  key: keyof BacktestMetrics | string;
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  hint?: string;
}

type ItemCellProps = Omit<Item, "key">;

const ItemCell: React.FC<ItemCellProps> = ({ label, value, tone, hint }) => {
  const accentBorder =
    tone === "positive"
      ? "#3f6b48"
      : tone === "negative"
        ? "#bd3f29"
        : "#c4b48f";
  const valueColor =
    tone === "positive"
      ? "#3f6b48"
      : tone === "negative"
        ? "#bd3f29"
        : "#1a1612";
  return (
    <div
      style={{
        background: "#fdf9ee",
        border: "1px solid #dccfb2",
        borderLeft: `2px solid ${accentBorder}`,
        borderRadius: 2,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#8a7f6f",
          letterSpacing: "1px",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {label}
        {hint && (
          <Tooltip title={hint}>
            <InfoCircleOutlined style={{ color: "#8a7f6f" }} />
          </Tooltip>
        )}
      </div>
      <div
        className="qp-serif"
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.3px",
          color: valueColor,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
};

export const MetricsPanel: React.FC<Props> = ({ metrics }) => {
  const items: Item[] = [
    {
      key: "cumulative_return",
      label: "累计收益",
      value: fmtPercent(metrics.cumulative_return),
      tone: tone(metrics.cumulative_return),
      hint: "回测期内策略净值的总变化率",
    },
    {
      key: "annualized_return",
      label: "年化收益",
      value: fmtPercent(metrics.annualized_return),
      tone: tone(metrics.annualized_return),
    },
    {
      key: "annualized_volatility",
      label: "年化波动",
      value: fmtPercent(metrics.annualized_volatility),
      hint: "日收益标准差按年化处理",
    },
    {
      key: "sharpe_ratio",
      label: "夏普比率",
      value: fmtNumber(metrics.sharpe_ratio),
      tone: tone(metrics.sharpe_ratio),
    },
    {
      key: "sortino_ratio",
      label: "索提诺比率",
      value: fmtNumber(metrics.sortino_ratio),
      hint: "只用下行波动作为风险衡量",
    },
    {
      key: "calmar_ratio",
      label: "卡尔玛比率",
      value: fmtNumber(metrics.calmar_ratio),
      hint: "年化收益 / 最大回撤",
    },
    {
      key: "max_drawdown",
      label: "最大回撤",
      value: fmtPercent(metrics.max_drawdown),
      tone: "negative",
    },
    {
      key: "trade_count",
      label: "交易次数",
      value: String(metrics.trade_count),
    },
    {
      key: "win_rate",
      label: "胜率",
      value: fmtPercent(metrics.win_rate),
    },
    {
      key: "profit_loss_ratio",
      label: "盈亏比",
      value: fmtNumber(metrics.profit_loss_ratio),
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12,
      }}
    >
      {items.map(({ key, ...rest }) => (
        <ItemCell key={String(key)} {...rest} />
      ))}
    </div>
  );
};
