import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dafian | Media Downloader",
  description:
    "Download video HD tanpa watermark, foto slide, audio MP3, dan salin komentar dari Instagram, TikTok, dan YouTube.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={plusJakarta.variable} suppressHydrationWarning>
      <body className="min-h-screen relative">
        <div className="dafian-ambient-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
