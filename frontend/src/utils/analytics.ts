import type { EquityPoint } from "../services/api";

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
