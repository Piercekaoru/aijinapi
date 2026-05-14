import { getStaticHtmlPage } from "@/lib/html-page";
import { HomePageClient } from "../page-client";

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const page = getStaticHtmlPage("landing", locale as "zh" | "ja");
  return <HomePageClient style={page.style} html={page.body} />;
}
