import React, { useMemo, useState } from "react";
import {
  Card,
  Form,
  InputNumber,
  Button,
  Alert,
  Tag,
  Space,
  Table,
  Row,
  Col,
  Statistic,
} from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { PageHeader } from "../components/PageHeader";
import { fmtNumber, fmtPercent } from "../utils/format";
import { QPColors } from "../theme";

interface GridResult {
  shortWindow: number;
  longWindow: number;
  cumulative: number;
  sharpe: number;
  maxDrawdown: number;
}

const generateMockGrid = (
  shortStart: number,
  shortEnd: number,
  shortStep: number,
  longStart: number,
  longEnd: number,
  longStep: number,
  seed: number,
): GridResult[] => {
  const out: GridResult[] = [];
  const rand = (i: number, j: number) => {
    const x = Math.sin(seed * 9301 + i * 137 + j * 311) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let s = shortStart; s <= shortEnd; s += shortStep) {
    for (let l = longStart; l <= longEnd; l += longStep) {
      if (s >= l) continue;
      const noise = rand(s, l);
      const sweet = Math.exp(-Math.pow(s / l - 0.25, 2) * 12);
      const cumulative = (sweet * 0.5 + (noise - 0.5) * 0.25) * 0.9;
      const sharpe = sweet * 2.4 + (noise - 0.5) * 0.4;
      const mdd = -(0.05 + (1 - sweet) * 0.25 + noise * 0.05);
      out.push({
        shortWindow: s,
        longWindow: l,
        cumulative,
        sharpe,
        maxDrawdown: mdd,
      });
    }
  }
  return out;
};

const OptimizationPage: React.FC = () => {
  const [form] = Form.useForm();
  const [results, setResults] = useState<GridResult[]>([]);
  const [running, setRunning] = useState(false);

  const handleRun = (values: any) => {
    setRunning(true);
    setTimeout(() => {
      const grid = generateMockGrid(
        values.shortStart,
        values.shortEnd,
        values.shortStep,
        values.longStart,
        values.longEnd,
        values.longStep,
        values.seed ?? 1,
      );
      setResults(grid);
      setRunning(false);
    }, 600);
  };

  const heatmapOption = useMemo(() => {
    if (results.length === 0) return null;
    const shorts = Array.from(new Set(results.map((r) => r.shortWindow))).sort((a, b) => a - b);
    const longs = Array.from(new Set(results.map((r) => r.longWindow))).sort((a, b) => a - b);
    const data = results.map((r) => [
      shorts.indexOf(r.shortWindow),
      longs.indexOf(r.longWindow),
      Number((r.sharpe).toFixed(2)),
    ]);
    const sharps = results.map((r) => r.sharpe);
    const min = Math.min(...sharps);
    const max = Math.max(...sharps);
    return {
      tooltip: {
        position: "top",
        formatter: (params: any) =>
          `短=${shorts[params.data[0]]}<br/>长=${longs[params.data[1]]}<br/>Sharpe=${params.data[2]}`,
      },
      grid: { left: 50, right: 28, top: 12, bottom: 60 },
      xAxis: {
        type: "category",
        data: shorts.map(String),
        name: "短均线窗口",
        nameLocation: "middle",
        nameGap: 28,
        axisLabel: { color: QPColors.textMuted },
      },
      yAxis: {
        type: "category",
        data: longs.map(String),
        name: "长均线窗口",
        nameLocation: "middle",
        nameGap: 32,
        axisLabel: { color: QPColors.textMuted },
      },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: { color: ["#dc2626", "#fef2f2", "#ecfdf5", "#059669"] },
        textStyle: { color: QPColors.textMuted, fontSize: 11 },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: false },
          itemStyle: { borderColor: "#fff", borderWidth: 1 },
        },
      ],
    };
  }, [results]);

  const ranked = useMemo(
    () => [...results].sort((a, b) => b.sharpe - a.sharpe).slice(0, 10),
    [results],
  );

  return (
    <div className="qp-page">
      <PageHeader
        title="参数优化"
        subtitle="对策略参数做网格搜索，按夏普或累计收益排序最优组合。"
        badge={<span className="qp-pill qp-pill--mock">演示数据</span>}
      />

      <Alert
        type="info"
        showIcon
        message="参数优化执行端尚未与后端任务队列接入。当前演示页面用前端生成的合成结果，等 Phase 5 落地 JobRegistry + 网格搜索后会替换为真实任务结果。"
      />

      <Card title="网格定义">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            shortStart: 3,
            shortEnd: 15,
            shortStep: 1,
            longStart: 20,
            longEnd: 60,
            longStep: 5,
            seed: 1,
          }}
          onFinish={handleRun}
        >
          <div className="qp-form-grid">
            <Form.Item label="短均线起始" name="shortStart">
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="短均线结束" name="shortEnd">
              <InputNumber min={2} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="短均线步长" name="shortStep">
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="长均线起始" name="longStart">
              <InputNumber min={2} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="长均线结束" name="longEnd">
              <InputNumber min={3} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="长均线步长" name="longStep">
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="随机种子" name="seed">
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlayCircleOutlined />}
              loading={running}
            >
              生成网格结果
            </Button>
            {results.length > 0 && (
              <Tag bordered={false}>{results.length} 个组合</Tag>
            )}
          </Space>
        </Form>
      </Card>

      {results.length > 0 && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="夏普热力图">
                <ReactECharts option={heatmapOption ?? {}} style={{ height: 380 }} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="最佳组合 Top 10">
                <Table
                  size="small"
                  rowKey={(r) => `${r.shortWindow}-${r.longWindow}`}
                  dataSource={ranked}
                  pagination={false}
                  columns={[
                    { title: "短均线", dataIndex: "shortWindow" },
                    { title: "长均线", dataIndex: "longWindow" },
                    {
                      title: "夏普",
                      dataIndex: "sharpe",
                      render: (v: number) => fmtNumber(v),
                    },
                    {
                      title: "累计收益",
                      dataIndex: "cumulative",
                      render: (v: number) => (
                        <span style={{ color: v >= 0 ? QPColors.success : QPColors.danger }}>
                          {fmtPercent(v)}
                        </span>
                      ),
                    },
                    {
                      title: "最大回撤",
                      dataIndex: "maxDrawdown",
                      render: (v: number) => (
                        <span style={{ color: QPColors.danger }}>{fmtPercent(v)}</span>
                      ),
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          <Card title="敏感性指标（演示）">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={6}>
                <Statistic
                  title="最佳夏普"
                  value={ranked[0]?.sharpe ?? 0}
                  precision={2}
                />
              </Col>
              <Col xs={24} sm={6}>
                <Statistic
                  title="平均夏普"
                  value={
                    results.length > 0
                      ? results.reduce((s, r) => s + r.sharpe, 0) / results.length
                      : 0
                  }
                  precision={2}
                />
              </Col>
              <Col xs={24} sm={6}>
                <Statistic
                  title="最佳累计收益"
                  value={(Math.max(...results.map((r) => r.cumulative))) * 100}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: QPColors.success }}
                />
              </Col>
              <Col xs={24} sm={6}>
                <Statistic
                  title="最优参数"
                  value={`${ranked[0]?.shortWindow}/${ranked[0]?.longWindow}`}
                />
              </Col>
            </Row>
          </Card>
        </>
      )}
    </div>
  );
};

export default OptimizationPage;
