import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "./pwa";
export const metadata: Metadata = {
  title: "CoStep",
  description:
    "学習時間の記録、投稿、ユーザー検索、メッセージを利用できるSNS。",
  applicationName: "CoStep",
  other: { "apple-mobile-web-app-capable": "yes" },
  appleWebApp: { capable: true, title: "CoStep", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: "#f5f7fb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
