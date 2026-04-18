import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "رؤى للتداول — Roua Trading | ببصيرة نحو الأسواق",
  description:
    "طبقة ذكاء مالي تربط المتداول بجميع أسواق العالم عبر واجهة واحدة آمنة. مدعومة بسيمفونية من 6 نماذج ذكاء اصطناعي.",
  keywords: [
    "Roua Trading",
    "رؤى للتداول",
    "تحليل مالي",
    "ذكاء اصطناعي",
    "تداول",
    "فوركس",
    "عملات رقمية",
  ],
  authors: [{ name: "Roua Trading" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
