import type { EquityPoint, FillRecord } from "../services/api";

export interface DrawdownPoint {
  timestamp: string;
  equity: number;
  drawdown: number;
}

export interface MonthlyReturn {
  ym: string;
  year: number;
  month: number;
  ret: number;
}

export const dailyReturns = (points: EquityPoint[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].total_value;
    const curr = points[i].total_value;
    if (prev > 0) out.push(curr / prev - 1);
  }
  return out;
};

export const drawdownSeries = (points: EquityPoint[]): DrawdownPoint[] => {
  if (points.length === 0) return [];
  let peak = -Infinity;
  return points.map((p) => {
    if (p.total_value > peak) peak = p.total_value;
    const dd = peak === 0 ? 0 : p.total_value / peak - 1;
    return { timestamp: p.timestamp, equity: p.total_value, drawdown: dd };
  });
};

export const monthlyReturns = (points: EquityPoint[]): MonthlyReturn[] => {
  if (points.length === 0) return [];
  const lastPerMonth = new Map<string, number>();
  for (const p of points) {
    const ym = p.timestamp.slice(0, 7);
    lastPerMonth.set(ym, p.total_value);
  }
  const months = Array.from(lastPerMonth.keys()).sort();
  const out: MonthlyReturn[] = [];
  let prev = points[0].total_value;
  for (const ym of months) {
    const curr = lastPerMonth.get(ym)!;
    const [yStr, mStr] = ym.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    out.push({ ym, year, month, ret: prev > 0 ? curr / prev - 1 : 0 });
    prev = curr;
  }
  return out;
};

export interface HistogramBin {
  start: number;
  end: number;
  center: number;
  count: number;
}

export const histogram = (values: number[], bins = 30): HistogramBin[] => {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ start: min, end: max, center: min, count: values.length }];
  }
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    counts[idx] += 1;
  }
  return counts.map((count, i) => {
    const start = min + i * width;
    const end = start + width;
    return { start, end, center: (start + end) / 2, count };
  });
};

export interface RoundTripTrade {
  id: string;
  symbol: string;
  entryTime: string;
  exitTime: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  fees: number;
  slippage: number;
  netPnl: number;
  returnPct: number;
  holdingDays: number;
}

interface OpenLot {
  timestamp: string;
  quantity: number;
  price: number;
  commission: number;
  stampTax: number;
  slippage: number;
}

const daysBetween = (startIso: string, endIso: string): number => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / 86_400_000);
};

const allocate = (value: number, matched: number, total: number): number =>
  total > 0 ? value * (matched / total) : 0;

export const buildRoundTripTrades = (fills: FillRecord[]): RoundTripTrade[] => {
  const openLots = new Map<string, OpenLot[]>();
  const trades: RoundTripTrade[] = [];

  const ordered = [...fills].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const fill of ordered) {
    const lots = openLots.get(fill.symbol) ?? [];
    openLots.set(fill.symbol, lots);

    if (fill.side === "buy") {
      lots.push({
        timestamp: fill.timestamp,
        quantity: fill.quantity,
        price: fill.price,
        commission: fill.commission,
        stampTax: fill.stamp_tax,
        slippage: fill.slippage,
      });
      continue;
    }

    let remaining = fill.quantity;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(lot.quantity, remaining);
      const buyFees = allocate(lot.commission + lot.stampTax, matched, lot.quantity);
      const sellFees = allocate(fill.commission + fill.stamp_tax, matched, fill.quantity);
      const buySlippage = allocate(lot.slippage, matched, lot.quantity);
      const sellSlippage = allocate(fill.slippage, matched, fill.quantity);
      const grossPnl = (fill.price - lot.price) * matched;
      const fees = buyFees + sellFees;
      const notional = lot.price * matched;

      trades.push({
        id: `${fill.order_id}-${trades.length + 1}`,
        symbol: fill.symbol,
        entryTime: lot.timestamp,
        exitTime: fill.timestamp,
        quantity: matched,
        entryPrice: lot.price,
        exitPrice: fill.price,
        grossPnl,
        fees,
        slippage: buySlippage + sellSlippage,
        netPnl: grossPnl - fees,
        returnPct: notional > 0 ? (grossPnl - fees) / notional : 0,
        holdingDays: daysBetween(lot.timestamp, fill.timestamp),
      });

      remaining -= matched;
      lot.quantity -= matched;
      if (lot.quantity <= 1e-9) {
        lots.shift();
      }
    }
  }

  return trades;
};

export interface TradeAnalysisSummary {
  count: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalNetPnl: number;
  avgNetPnl: number;
  bestNetPnl: number;
  worstNetPnl: number;
  avgHoldingDays: number;
  maxHoldingDays: number;
}

export const summarizeRoundTrips = (trades: RoundTripTrade[]): TradeAnalysisSummary => {
  if (trades.length === 0) {
    return {
      count: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      totalNetPnl: 0,
      avgNetPnl: 0,
      bestNetPnl: 0,
      worstNetPnl: 0,
      avgHoldingDays: 0,
      maxHoldingDays: 0,
    };
  }

  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const totalNetPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const totalHoldingDays = trades.reduce((sum, trade) => sum + trade.holdingDays, 0);

  return {
    count: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: wins.length / trades.length,
    totalNetPnl,
    avgNetPnl: totalNetPnl / trades.length,
    bestNetPnl: Math.max(...trades.map((trade) => trade.netPnl)),
    worstNetPnl: Math.min(...trades.map((trade) => trade.netPnl)),
    avgHoldingDays: totalHoldingDays / trades.length,
    maxHoldingDays: Math.max(...trades.map((trade) => trade.holdingDays)),
  };
};
