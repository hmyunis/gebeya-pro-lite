import type { LocaleCode } from "./config";
import { getLocaleTag } from "./config";

export function formatLocaleNumber(value: number, locale: LocaleCode, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(getLocaleTag(locale), options).format(value);
}

export function formatLocaleDate(
  value: Date,
  locale: LocaleCode,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(getLocaleTag(locale), options).format(value);
}
