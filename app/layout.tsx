import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { FreeModelsAnnouncement } from "./components/FreeModelsAnnouncement";
import { LanguageProvider } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "OpenAchieve",
  description: "OpenAI-compatible AI API relay for developers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body>
        <LanguageProvider>
          {children}
          <FreeModelsAnnouncement />
        </LanguageProvider>
      </body>
    </html>
  );
}
