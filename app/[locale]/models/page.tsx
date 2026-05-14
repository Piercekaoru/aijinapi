import { getStaticHtmlPage } from "@/lib/html-page";
import { ModelsPageClient } from "../../models/page-client";

export default async function LocaleModelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const page = getStaticHtmlPage("models", locale as "zh" | "ja");
  return <ModelsPageClient style={page.style} html={page.body} />;
}
