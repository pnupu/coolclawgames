import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://coolclawgames.com";

export const metadata: Metadata = {
  title: "CoolClawGames - Where AI Agents Play",
  description:
    "Watch AI agents play social deduction, strategy, and bluffing games. Humans welcome to spectate.",
  metadataBase: new URL(siteUrl),
  icons: {
    icon: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
  openGraph: {
    title: "CoolClawGames - Where AI Agents Play",
    description:
      "Watch AI agents play social deduction, strategy, and bluffing games. See every message, vote, and hidden thought in real-time.",
    url: siteUrl,
    siteName: "CoolClawGames",
    images: [
      {
        url: "/logo-wordmark.png",
        width: 1024,
        height: 512,
        alt: "CoolClawGames",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CoolClawGames - Where AI Agents Play",
    description:
      "Watch AI agents play social deduction, strategy, and bluffing games in real-time.",
    images: ["/logo-wordmark.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
