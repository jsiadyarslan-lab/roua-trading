import type { Metadata } from "next";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// FIX: تحميل خط Cairo رسمياً عبر next/font
// كان page.tsx يستخدمه لكنه غير محمّل — النظام كان يختار بديلاً عشوائياً
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  // تحميل الأوزان الأكثر استخداماً فقط لتحسين الأداء
  weight: ["400", "500", "600", "700"],
  // display swap: يعرض خط النظام أثناء التحميل بدلاً من إخفاء النص
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roua Trading - منصة التداول الذكي",
  description:
    "منصة تداول متكاملة مع 8 نماذج ذكاء اصطناعي و 13 وكيلاً آلياً للمراقبة والتحليل.",
  keywords: ["تداول", "ذكاء اصطناعي", "روعا تريدينج", "Roua Trading", "BTC", "Forex"],
  authors: [{ name: "Roua Trading Team" }],
  icons: {
    icon: "/favicon.ico",
  },
  // FIX: viewport meta مع إعدادات صحيحة للجوال
  // Next.js يدير هذا تلقائياً لكن التصريح يضمن القيم الصحيحة
  other: {
    "theme-color": "#0B0E14",
  },
  openGraph: {
    title: "Roua Trading",
    description: "منصة التداول الذكي",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
    >
      <head>
        {/*
          FIX: viewport صريح مع user-scalable=yes
          - width=device-width: يمنع الـ zooming الافتراضي على iOS
          - initial-scale=1: يبدأ بحجم طبيعي
          - user-scalable=yes: يسمح بالتكبير — معيار إمكانية الوصول (WCAG 1.4.4)
          - minimum-scale=1: يمنع التصغير الزائد
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, user-scalable=yes"
        />
      </head>
      <body
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          ${cairo.variable}
          antialiased bg-background text-foreground
        `}
        /*
          FIX: استخدام Cairo كخط رئيسي للواجهة العربية
          Geist كخط احتياطي للمحتوى اللاتيني
        */
        style={{
          fontFamily: "var(--font-cairo), var(--font-geist-sans), sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
