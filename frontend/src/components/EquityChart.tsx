import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EquityPoint } from "../services/api";
import { QPColors, QPSeries } from "../theme";

interface Props {
  equityCurve: EquityPoint[];
  benchmarkCurve?: EquityPoint[];
  height?: number;
}

export const EquityChart: React.FC<Props> = ({
  equityCurve,
  benchmarkCurve,
  height = 360,
}) => {
  const option = useMemo(() => {
    const xAxis = equityCurve.map((p) => p.timestamp.slice(0, 10));
    const startValue = equityCurve[0]?.total_value ?? 1;
    const lastValue = equityCurve[equityCurve.length - 1]?.total_value ?? 1;
    const isUp = lastValue >= startValue;
    const lineColor = isUp ? QPSeries.gain : QPSeries.loss;

    const series: any[] = [
      {
        name: "策略净值",
        type: "line",
        smooth: false,
        showSymbol: false,
        data: equityCurve.map((p) => Number(p.total_value.toFixed(2))),
        lineStyle: { width: 1.5, color: lineColor },
        itemStyle: { color: lineColor },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: isUp
                  ? "rgba(63, 107, 72, 0.18)"
                  : "rgba(189, 63, 41, 0.18)",
              },
              {
                offset: 1,
                color: isUp
                  ? "rgba(63, 107, 72, 0)"
                  : "rgba(189, 63, 41, 0)",
              },
            ],
          },
        },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: QPColors.hairlineStrong, type: "dotted" },
          label: { show: false },
          data: [{ yAxis: startValue }],
        },
      },
    ];

    if (benchmarkCurve && benchmarkCurve.length > 0) {
      series.push({
        name: "基准",
        type: "line",
        smooth: false,
        showSymbol: false,
        data: benchmarkCurve.map((p) => Number(p.total_value.toFixed(2))),
        lineStyle: { width: 1, color: QPSeries.benchmark, type: "dashed" },
        itemStyle: { color: QPSeries.benchmark },
      });
    }

    return {
      backgroundColor: "transparent",
      textStyle: { color: QPColors.ink },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", lineStyle: { color: QPColors.inkMuted } },
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
      },
      legend: {
        right: 0,
        top: 0,
        icon: "roundRect",
        textStyle: { color: QPColors.inkSoft },
      },
      grid: { left: 56, right: 16, top: 32, bottom: 28 },
      xAxis: {
        type: "category",
        data: xAxis,
        boundaryGap: false,
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
        axisTick: { lineStyle: { color: QPColors.hairlineStrong } },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: QPSeries.grid, type: "dashed" } },
        axisLine: { show: false },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
      },
      series,
    };
  }, [equityCurve, benchmarkCurve]);

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
