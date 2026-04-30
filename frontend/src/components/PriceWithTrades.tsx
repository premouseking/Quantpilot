import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { Bar, FillRecord } from "../services/api";
import { QPColors, QPSeries } from "../theme";

interface Props {
  bars: Bar[];
  fills: FillRecord[];
  height?: number;
}

export const PriceWithTrades: React.FC<Props> = ({ bars, fills, height = 360 }) => {
  const option = useMemo(() => {
    const xAxis = bars.map((b) => b.timestamp.slice(0, 10));
    const closes = bars.map((b) => Number(b.close.toFixed(3)));

    const buyMarkers = fills
      .filter((f) => f.side === "buy")
      .map((f) => ({
        coord: [f.timestamp.slice(0, 10), Number(f.price.toFixed(3))],
        value: "B",
        symbol: "triangle",
        symbolSize: 11,
        itemStyle: {
          color: QPSeries.gain,
          borderColor: "#2f5236",
          borderWidth: 1,
        },
      }));

    const sellMarkers = fills
      .filter((f) => f.side === "sell")
      .map((f) => ({
        coord: [f.timestamp.slice(0, 10), Number(f.price.toFixed(3))],
        value: "S",
        symbol: "triangle",
        symbolRotate: 180,
        symbolSize: 11,
        itemStyle: {
          color: QPSeries.loss,
          borderColor: "#8c2c1c",
          borderWidth: 1,
        },
      }));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", lineStyle: { color: QPColors.inkMuted } },
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
      },
      grid: { left: 56, right: 16, top: 16, bottom: 28 },
      legend: { right: 0, top: 0, textStyle: { color: QPColors.inkSoft } },
      xAxis: {
        type: "category",
        data: xAxis,
        boundaryGap: false,
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: QPColors.hairlineStrong } },
        axisTick: { lineStyle: { color: QPColors.hairlineStrong } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLine: { show: false },
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: QPSeries.grid, type: "dashed" } },
      },
      series: [
        {
          name: "收盘价",
          type: "line",
          smooth: false,
          showSymbol: false,
          data: closes,
          lineStyle: { color: QPSeries.equity, width: 1.2 },
          itemStyle: { color: QPSeries.equity },
        },
        {
          name: "买入",
          type: "scatter",
          markPoint: {
            symbolSize: 11,
            data: buyMarkers,
            label: { show: false },
          },
        },
        {
          name: "卖出",
          type: "scatter",
          markPoint: {
            symbolSize: 11,
            data: sellMarkers,
            label: { show: false },
          },
        },
      ],
    };
  }, [bars, fills]);

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
