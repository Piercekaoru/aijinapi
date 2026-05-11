import type { Metadata } from "next";
import { getStaticHtmlPage } from "@/lib/html-page";
import { LoginPageClient } from "./page-client";

const page = getStaticHtmlPage("login");

export const metadata: Metadata = {
  title: page.title,
};

export default function LoginPage() {
  return <LoginPageClient style={page.style} html={page.body} />;
}
