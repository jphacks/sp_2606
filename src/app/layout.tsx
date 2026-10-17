import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CoStep",
  description:
    "学習時間の記録、投稿、ユーザー検索、メッセージを利用できるSNS。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
