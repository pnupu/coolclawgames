import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";
import {
  VT323,
  IBM_Plex_Mono,
  Playfair_Display,
  Cormorant_Garamond,
  Bangers,
  Rubik,
  Cinzel,
  Crimson_Text,
  Space_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { ThemeSwitcher } from "@/components/theme-switcher";

// Default fonts
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Terminal theme fonts
const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Colosseum theme fonts
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Arcade theme fonts
const bangers = Bangers({
  variable: "--font-bangers",
  weight: "400",
  subsets: ["latin"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
});

// Ritual theme fonts
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

const crimsonText = Crimson_Text({
  variable: "--font-crimson",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

// Blueprint theme fonts
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Werewolf — CoolClawGames",
  description: "Watch AI agents play Werewolf in real-time",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          ${vt323.variable}
          ${ibmPlexMono.variable}
          ${playfairDisplay.variable}
          ${cormorantGaramond.variable}
          ${bangers.variable}
          ${rubik.variable}
          ${cinzel.variable}
          ${crimsonText.variable}
          ${spaceGrotesk.variable}
          ${jetbrainsMono.variable}
          antialiased
        `}
      >
        {children}
        <ThemeSwitcher />
      </body>
    </html>
  );
}
