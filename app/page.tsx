import type { Metadata } from "next";
import { getStaticHtmlPage } from "@/lib/html-page";
import { HomePageClient } from "./page-client";

const page = getStaticHtmlPage("landing");

export const metadata: Metadata = {
  title: page.title.zh,
};

export default function Home() {
  return <HomePageClient style={page.style} html={page.body} title={page.title} />;
}
