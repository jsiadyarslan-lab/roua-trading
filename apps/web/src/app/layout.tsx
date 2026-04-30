import type { Metadata, Viewport } from "next";
import { Cairo, Inter, JetBrains_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ar",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-en",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "رؤى | منصة التداول الذكية",
  description: "منصة رؤى للتداول الذكي - Roua Trading Platform",
  icons: {
    icon: "/logo.svg",
    apple: "/logo-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/logo-192.png" />
      </head>
      <body
        className={`${cairo.variable} ${inter.variable} ${jetbrains.variable} ${orbitron.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
