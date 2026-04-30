import type { Metadata } from "next";
import { Noto_Naskh_Arabic, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-naskh",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-ibm-plex",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "رؤى — منصة التداول الذكية | ROUA Trading Platform",
  description: "منصة التداول المدعومة بالذكاء الاصطناعي الأكثر تقدماً في المنطقة. حيث تلتقي شبكة الكون المالي بعقل آلة يتنبأ قبل أن يحدث.",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${notoNaskhArabic.variable} ${ibmPlexSansArabic.variable} antialiased`}
        style={{ background: "#000000", color: "#f0f9ff", fontFamily: "var(--font-ibm-plex), 'IBM Plex Sans Arabic', sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
