export type Locale = "zh" | "ja";

export const DEFAULT_LOCALE: Locale = "zh";

export const SUPPORTED_LOCALES: Locale[] = ["zh", "ja"];

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: "中文",
  ja: "日本語",
};
