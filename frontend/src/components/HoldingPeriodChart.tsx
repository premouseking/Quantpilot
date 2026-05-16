import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { histogram, type RoundTripTrade } from "../utils/analytics";
import { QPColors, QPSeries } from "../theme";

interface Props {
  trades: RoundTripTrade[];
  height?: number;
}

export const HoldingPeriodChart: React.FC<Props> = ({ trades, height = 280 }) => {
  const option = useMemo(() => {
    const durations = trades.map((trade) => trade.holdingDays);
    if (durations.length === 0) return null;

    const bins = histogram(durations, Math.min(12, Math.max(4, durations.length)));
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
        formatter: (params: any) => {
          const bin = bins[params[0].dataIndex];
          return `${bin.start.toFixed(1)} 天 → ${bin.end.toFixed(1)} 天<br/>交易数：${params[0].value}`;
        },
      },
      grid: { left: 48, right: 16, top: 18, bottom: 36 },
      xAxis: {
        type: "category",
        data: bins.map((bin) => `${bin.center.toFixed(1)}天`),
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisTick: { lineStyle: { color: QPColors.hairlineStrong } },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: QPSeries.grid, type: "dashed" } },
      },
      series: [
        {
          name: "持仓时间",
          type: "bar",
          data: bins.map((bin) => bin.count),
          barMaxWidth: 28,
          itemStyle: { color: QPColors.indigo, opacity: 0.78 },
        },
      ],
    };
  }, [trades]);

  if (!option) {
    return (
      <div className="qp-empty-stub">
        <span className="qp-muted">暂无已平仓交易，无法生成持仓时间分布</span>
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
