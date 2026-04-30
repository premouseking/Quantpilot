import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EquityPoint } from "../services/api";
import { monthlyReturns } from "../utils/analytics";
import { QPColors } from "../theme";

interface Props {
  equityCurve: EquityPoint[];
  height?: number;
}

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export const MonthlyHeatmap: React.FC<Props> = ({ equityCurve, height = 240 }) => {
  const option = useMemo(() => {
    const months = monthlyReturns(equityCurve);
    if (months.length === 0) return null;

    const years = Array.from(new Set(months.map((m) => m.year))).sort();
    const data: [number, number, number][] = months.map((m) => [
      m.month - 1,
      years.indexOf(m.year),
      Number((m.ret * 100).toFixed(2)),
    ]);
    const flat = data.map((d) => d[2]);
    const absMax = Math.max(0.5, ...flat.map(Math.abs));

    return {
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
        formatter: (params: any) =>
          `${years[params.data[1]]}-${String(params.data[0] + 1).padStart(2, "0")}<br/>${params.data[2].toFixed(2)}%`,
      },
      grid: { left: 60, right: 28, top: 12, bottom: 36 },
      xAxis: {
        type: "category",
        data: MONTH_LABELS,
        splitArea: { show: false },
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: years.map(String),
        splitArea: { show: false },
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
      },
      visualMap: {
        min: -absMax,
        max: absMax,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        // Vermilion → paper → moss green: feels like an aged research report.
        inRange: {
          color: ["#bd3f29", "#e8c8b8", "#fbf6e6", "#bcd0bc", "#3f6b48"],
        },
        textStyle: { color: QPColors.inkMuted, fontSize: 11 },
      },
      series: [
        {
          name: "月度收益",
          type: "heatmap",
          data,
          label: {
            show: true,
            color: QPColors.ink,
            fontSize: 11,
            fontFamily:
              '"Songti SC", "Source Han Serif SC", Georgia, serif',
            formatter: (params: any) => `${params.data[2].toFixed(1)}%`,
          },
          itemStyle: {
            borderColor: "#fdf9ee",
            borderWidth: 1.5,
          },
        },
      ],
    };
  }, [equityCurve]);

  if (!option) {
    return (
      <div className="qp-empty-stub">
        <span className="qp-muted">暂无月度收益数据</span>
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
