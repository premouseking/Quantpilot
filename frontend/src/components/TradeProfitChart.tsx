import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { RoundTripTrade } from "../utils/analytics";
import { QPColors, QPSeries } from "../theme";

interface Props {
  trades: RoundTripTrade[];
  height?: number;
}

export const TradeProfitChart: React.FC<Props> = ({ trades, height = 280 }) => {
  const option = useMemo(() => {
    if (trades.length === 0) return null;
    const data = trades.map((trade, index) => ({
      value: Number(trade.netPnl.toFixed(2)),
      itemStyle: {
        color: trade.netPnl >= 0 ? QPSeries.gain : QPSeries.loss,
        opacity: 0.82,
      },
      trade,
      label: `#${index + 1}`,
    }));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#fdf9ee",
        borderColor: QPColors.hairline,
        textStyle: { color: QPColors.ink, fontSize: 12 },
        formatter: (params: any) => {
          const trade = params.data.trade as RoundTripTrade;
          return [
            `${params.data.label} ${trade.symbol}`,
            `开仓：${trade.entryTime.slice(0, 10)} @ ${trade.entryPrice.toFixed(3)}`,
            `平仓：${trade.exitTime.slice(0, 10)} @ ${trade.exitPrice.toFixed(3)}`,
            `数量：${trade.quantity.toLocaleString()}`,
            `净收益：${trade.netPnl.toFixed(2)}`,
            `收益率：${(trade.returnPct * 100).toFixed(2)}%`,
          ].join("<br/>");
        },
      },
      grid: { left: 64, right: 16, top: 18, bottom: 36 },
      xAxis: {
        type: "category",
        data: trades.map((_, index) => `#${index + 1}`),
        axisLabel: { color: QPColors.inkMuted, fontSize: 11 },
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
          name: "单笔净收益",
          type: "bar",
          data,
          barMaxWidth: 22,
          markLine: {
            symbol: "none",
            lineStyle: { color: QPColors.hairlineStrong, type: "dashed" },
            data: [{ yAxis: 0 }],
            label: { show: false },
          },
        },
      ],
    };
  }, [trades]);

  if (!option) {
    return (
      <div className="qp-empty-stub">
        <span className="qp-muted">暂无已平仓交易，无法生成单笔收益图</span>
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
};
