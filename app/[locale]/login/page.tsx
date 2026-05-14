import { getStaticHtmlPage } from "@/lib/html-page";
import { LoginPageClient } from "../../login/page-client";

export default async function LocaleLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const page = getStaticHtmlPage("login", locale as "zh" | "ja");
  return <LoginPageClient style={page.style} html={page.body} />;
}
