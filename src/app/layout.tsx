import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mid-year Workshop 2026 · 汇报管理平台",
  description: "PPT 评审、演讲录音转写与 AI 反馈",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
