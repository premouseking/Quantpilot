import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EquityPoint } from "../services/api";
import { drawdownSeries } from "../utils/analytics";
import { QPColors, QPSeries } from "../theme";

interface Props {
  equityCurve: EquityPoint[];
  height?: number;
}

export const DrawdownChart: React.FC<Props> = ({ equityCurve, height = 240 }) => {
  const option = useMemo(() => {
    const dd = drawdownSeries(equityCurve);
    const xAxis = dd.map((p) => p.timestamp.slice(0, 10));
    const data = dd.map((p) => Number((p.drawdown * 100).toFixed(2)));

    return {
      backgroundColor: "transparent",
      textStyle: { color: QPColors.ink },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
        valueFormatter: (val: number) => `${val.toFixed(2)}%`,
      },
      grid: { left: 56, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: "category",
        data: xAxis,
        boundaryGap: false,
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisTick: { lineStyle: { color: QPColors.hairlineStrong } },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        max: 0,
        axisLine: { show: false },
        axisLabel: {
          color: QPColors.inkMuted,
          fontSize: 11,
          formatter: (val: number) => `${val.toFixed(0)}%`,
        },
        splitLine: { lineStyle: { color: QPSeries.grid, type: "dashed" } },
      },
      series: [
        {
          name: "回撤",
          type: "line",
          smooth: false,
          showSymbol: false,
          data,
          lineStyle: { width: 1.2, color: QPSeries.loss },
          itemStyle: { color: QPSeries.loss },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(189, 63, 41, 0.04)" },
                { offset: 1, color: "rgba(189, 63, 41, 0.32)" },
              ],
            },
          },
        },
      ],
    };
  }, [equityCurve]);

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
