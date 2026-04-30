import React from "react";
import { Table, Tag } from "antd";
import type { FillRecord } from "../services/api";
import { fmtDateTime, fmtNumber } from "../utils/format";

interface Props {
  fills: FillRecord[];
}

export const TradesTable: React.FC<Props> = ({ fills }) => {
  const columns = [
    {
      title: "时间",
      dataIndex: "timestamp",
      key: "timestamp",
      width: 170,
      render: (value: string) => <span className="qp-mono">{fmtDateTime(value)}</span>,
    },
    {
      title: "标的",
      dataIndex: "symbol",
      key: "symbol",
      render: (v: string) => <span className="qp-mono">{v}</span>,
    },
    {
      title: "方向",
      dataIndex: "side",
      key: "side",
      width: 80,
      render: (value: "buy" | "sell") =>
        value === "buy" ? <Tag color="success">买入</Tag> : <Tag color="error">卖出</Tag>,
    },
    {
      title: "数量",
      dataIndex: "quantity",
      key: "quantity",
      align: "right" as const,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "成交价",
      dataIndex: "price",
      key: "price",
      align: "right" as const,
      render: (v: number) => fmtNumber(v, 3),
    },
    {
      title: "佣金",
      dataIndex: "commission",
      key: "commission",
      align: "right" as const,
      render: (v: number) => fmtNumber(v, 2),
    },
    {
      title: "印花税",
      dataIndex: "stamp_tax",
      key: "stamp_tax",
      align: "right" as const,
      render: (v: number) => fmtNumber(v, 2),
    },
    {
      title: "滑点成本",
      dataIndex: "slippage",
      key: "slippage",
      align: "right" as const,
      render: (v: number) => fmtNumber(v, 2),
    },
  ];

  return (
    <Table
      size="middle"
      rowKey="order_id"
      dataSource={fills}
      columns={columns}
      pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
    />
  );
};
