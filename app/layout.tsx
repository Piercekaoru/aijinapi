import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { LocaleClientLayout } from "@/components/LocaleClientLayout";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "AIJinAPI",
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
        <LocaleClientLayout>{children}</LocaleClientLayout>
      </body>
    </html>
  );
}
