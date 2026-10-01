import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import FridayMode from "@/components/FridayMode";
import AuthProvider from "@/components/AuthProvider";
import MockSessionBar from "@/components/MockSessionBar";
import FloatingHelpWidget from "@/components/FloatingHelpWidget";
import MtjAssistantWidget from "@/components/MtjAssistantWidget";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: "متجرك | سهولة التسوق في تطبيقك",
  description: "متجرك — منصة التجارة الإلكترونية السودانية: تسوق، تفاوض، بيع بأمان مع محفظة ومخالصة عادلة",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.png"],
  },
  openGraph: {
    title: "متجرك | سهولة التسوق في تطبيقك",
    description: "منصة سودانية تجمع التجار والمتسوقين — محفظة، عمولة 5%، وأمان كامل",
    images: [{ url: "/brand/matjarak-logo-full.png", width: 1024, height: 1024, alt: "متجرك" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#008751",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <AuthProvider>
          <FridayMode />
          <MockSessionBar />
          <Header />
          <main className="mx-auto min-h-[80vh] max-w-6xl px-4 pb-24 pt-5 md:pb-10">{children}</main>
          <footer className="no-print border-t bg-white py-8 text-center text-sm text-slate-500">
            <div className="mx-auto mb-3 flex justify-center">
              <BrandLogo variant="horizontal" size={40} />
            </div>
            <p className="font-black text-slate-700">متجرك 🇸🇩 — صُنع بحب في السودان</p>
            <p className="mt-1">عمولة عادلة 5% • دفع آمن • إيصالات موثقة • وضع الجمعة التلقائي 🕌</p>
            <div className="mt-3 flex items-center justify-center gap-4 text-xs font-bold">
              <Link href="/terms" className="hover:text-emerald-700">الشروط والسياسات</Link>
              <Link href="/help" className="hover:text-emerald-700">المساعدة</Link>
              <Link href="/verify" className="hover:text-emerald-700">التحقق من إيصال</Link>
              <Link href="/download" className="hover:text-emerald-700">📱 تطبيق Android</Link>
            </div>
          </footer>
          <BottomNav />
          <FloatingHelpWidget />
          <MtjAssistantWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
