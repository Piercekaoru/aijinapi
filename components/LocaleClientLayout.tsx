"use client";

import { LocaleProvider } from "@/lib/i18n/context";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/types";
import type { ReactNode } from "react";

export function LocaleClientLayout({
  locale,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleProvider locale={locale ?? DEFAULT_LOCALE}>
      {children}
    </LocaleProvider>
  );
}
