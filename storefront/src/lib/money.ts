function resolveLocaleTag() {
  if (typeof document !== "undefined" && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  return "en-US";
}

function createBirrFormatter() {
  return new Intl.NumberFormat(resolveLocaleTag(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBirrAmount(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return createBirrFormatter().format(0);
  }
  return createBirrFormatter().format(numeric);
}

export function formatBirrLabel(value: number | string): string {
  return `${formatBirrAmount(value)} Birr`;
}
