import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "食刻 · 让每一餐都新鲜安心",
  description: "冰箱食品保质期管理 · 智能扫描识别 · 家庭库存共享",
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
