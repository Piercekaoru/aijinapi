import type { Metadata } from "next";
import "../globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { LocaleClientLayout } from "@/components/LocaleClientLayout";
import type { Locale } from "@/lib/i18n/types";
import { SUPPORTED_LOCALES } from "@/lib/i18n/types";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "OpenAchieve",
    description:
      locale === "ja"
        ? "中国開発者向け AI API 中継サービス"
        : "面向国内开发者的 AI API 中转服务",
  };
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    return <>{children}</>;
  }

  return (
    <html
      lang={locale === "ja" ? "ja" : "zh-CN"}
      className={cn("font-sans", geist.variable)}
    >
      <body>
        <LocaleClientLayout locale={locale as Locale}>
          {children}
        </LocaleClientLayout>
      </body>
    </html>
  );
}
