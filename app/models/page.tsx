import type { Metadata } from "next";
import { getStaticHtmlPage } from "@/lib/html-page";
import { ModelsPageClient } from "./page-client";

const page = getStaticHtmlPage("models");

export const metadata: Metadata = {
  title: page.title.zh,
};

export default function ModelsPage() {
  return <ModelsPageClient style={page.style} html={page.body} title={page.title} />;
}
