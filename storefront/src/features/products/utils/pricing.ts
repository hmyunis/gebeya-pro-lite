import type { PriceRange } from "../types";

function resolveLocaleTag() {
  if (typeof document !== "undefined" && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  return "en-US";
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(resolveLocaleTag(), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPriceRangeLabel(range: PriceRange): string {
  if (range.label) return range.label;
  if (range.min === range.max) {
    return `${formatCompactNumber(range.min)}`;
  }
  return `${formatCompactNumber(range.min)} - ${formatCompactNumber(range.max)}`;
}

