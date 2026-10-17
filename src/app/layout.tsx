import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "となりで学ぶ | Study Circle",
  description:
    "同じ目線の仲間と、今日の一歩を。学習記録とつながりのためのSNS。",
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
