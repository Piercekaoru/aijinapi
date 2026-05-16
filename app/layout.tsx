import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { FreeModelsAnnouncement } from "./components/FreeModelsAnnouncement";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "OpenAchieve",
  description: "面向国内开发者的 AI API 中转服务",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body>
        {children}
        <FreeModelsAnnouncement />
      </body>
    </html>
  );
}
