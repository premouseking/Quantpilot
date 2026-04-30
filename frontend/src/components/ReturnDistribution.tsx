import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EquityPoint } from "../services/api";
import { dailyReturns, histogram } from "../utils/analytics";
import { QPColors, QPSeries } from "../theme";

interface Props {
  equityCurve: EquityPoint[];
  height?: number;
}

export const ReturnDistribution: React.FC<Props> = ({ equityCurve, height = 240 }) => {
  const option = useMemo(() => {
    const returns = dailyReturns(equityCurve);
    if (returns.length === 0) return null;
    const bins = histogram(returns, 28);
    const xAxis = bins.map((b) => `${(b.center * 100).toFixed(2)}%`);
    const data = bins.map((b) => ({
      value: b.count,
      itemStyle: {
        color: b.center >= 0 ? QPSeries.gain : QPSeries.loss,
        opacity: 0.7,
      },
    }));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0];
          const bin = bins[p.dataIndex];
          return `${(bin.start * 100).toFixed(2)}% → ${(bin.end * 100).toFixed(2)}%<br/>样本：${p.value}`;
        },
      },
      grid: { left: 40, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: "category",
        data: xAxis,
        axisLabel: {
          color: QPColors.inkMuted,
          fontSize: 10,
          interval: Math.floor(bins.length / 6),
        },
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisTick: { lineStyle: { color: QPColors.hairlineStrong } },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: QPSeries.grid, type: "dashed" } },
      },
      series: [
        {
          type: "bar",
          data,
          barCategoryGap: "8%",
        },
      ],
    };
  }, [equityCurve]);

  if (!option) {
    return (
      <div className="qp-empty-stub">
        <span className="qp-muted">数据不足，无法生成收益分布</span>
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
