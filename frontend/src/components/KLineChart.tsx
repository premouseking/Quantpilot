import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { Bar } from "../services/api";
import { QPColors, QPSeries } from "../theme";

interface Props {
  bars: Bar[];
  height?: number;
}

export const KLineChart: React.FC<Props> = ({ bars, height = 360 }) => {
  const option = useMemo(() => {
    const xAxis = bars.map((b) => b.timestamp.slice(0, 10));
    const candles = bars.map((b) => [b.open, b.close, b.low, b.high]);
    const volumes = bars.map((b, i) => ({
      value: b.volume,
      itemStyle: {
        color:
          i > 0 && b.close >= bars[i - 1].close
            ? QPSeries.candleUp
            : QPSeries.candleDown,
        opacity: 0.55,
      },
    }));

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
      grid: [
        { left: 56, right: 16, top: 24, height: "62%" },
        { left: 56, right: 16, top: "76%", height: "18%" },
      ],
      xAxis: [
        {
          type: "category",
          data: xAxis,
          boundaryGap: true,
          axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
          axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
          axisTick: { lineStyle: { color: QPColors.hairlineStrong } },
        },
        {
          type: "category",
          gridIndex: 1,
          data: xAxis,
          axisLabel: { show: false },
          axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
          axisTick: { show: false },
        },
      ],
      yAxis: [
        {
          type: "value",
          scale: true,
          axisLine: { show: false },
          axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
          splitLine: { lineStyle: { color: QPSeries.grid, type: "dashed" } },
        },
        {
          type: "value",
          gridIndex: 1,
          axisLabel: { show: false },
          splitLine: { show: false },
          axisLine: { show: false },
        },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], start: 70, end: 100 },
        {
          type: "slider",
          xAxisIndex: [0, 1],
          height: 18,
          bottom: 0,
          backgroundColor: "rgba(220, 207, 178, 0.3)",
          borderColor: QPColors.hairline,
          fillerColor: "rgba(189, 63, 41, 0.18)",
          handleStyle: { color: QPColors.vermilion, borderColor: QPColors.vermilionInk },
          textStyle: { color: QPColors.inkMuted },
        },
      ],
      series: [
        {
          type: "candlestick",
          data: candles,
          itemStyle: {
            color: QPSeries.candleUp,
            color0: QPSeries.candleDown,
            borderColor: QPSeries.candleUpBorder,
            borderColor0: QPSeries.candleDownBorder,
          },
        },
        {
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
        },
      ],
    };
  }, [bars]);

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
