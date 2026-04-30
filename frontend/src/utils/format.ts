export const fmtPercent = (value: number | null | undefined, digits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
};

export const fmtNumber = (
  value: number | null | undefined,
  digits = 2,
  fallback = "—",
): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return value.toFixed(digits);
};

export const fmtMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19);
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return iso.slice(0, 10);
};

export const tone = (value: number | null | undefined): "positive" | "negative" | "neutral" => {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
};
