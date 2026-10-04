import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Aviator AI Lab", template: "%s · Aviator AI Lab" },
  description:
    "An experimental statistics and machine-learning lab that tests — honestly — whether historical crash-game multipliers carry any predictive signal.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#06070a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <div className="app-backdrop" aria-hidden />
        {children}
      </body>
    </html>
  );
}
