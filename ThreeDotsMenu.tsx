"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";

interface Props {
  role?: string | null;
  userName?: string | null;
}

export default function ThreeDotsMenu({ role, userName }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    if (open) {
      document.addEventListener("click", close);
      return () => document.removeEventListener("click", close);
    }
  }, [open ]);

  const items: Array<{ href: string; icon: string; label: string; desc?: string }> = [
    { href: "/account", icon: "👤", label: "الحساب", desc: "الملف الشخصي والتحقق" },
    { href: "/account?tab=settings", icon: "⚙️", label: "الإعدادات" },
    { href: "/account?tab=security", icon: "🔒", label: "الأمان والخصوصية", desc: "الجلسات والأجهزة" },
    { href: "/account?tab=language", icon: "🌍", label: "اللغة", desc: "العربية / English" },
    { href: "/account?tab=notifications", icon: "🔔", label: "الإشعارات" },
    { href: "/help", icon: "💬", label: "التواصل والمساعدة" },
    { href: "/terms", icon: "📜", label: "الشروط والسياسات" },
  ];

  const merchantItems: Array<{ href: string; icon: string; label: string; desc?: string }> =
    role === "merchant" || role === "admin" || role === "super_admin"
      ? [
          { href: "/merchant?tab=store", icon: "🏪", label: "إعدادات المتجر" },
          { href: "/merchant?tab=contact", icon: "📞", label: "طرق التواصل" },
          { href: "/merchant?tab=payments", icon: "💳", label: "إعدادات الدفع" },
          { href: "/merchant?tab=location", icon: "📍", label: "إعدادات الموقع" },
        ]
      : [];

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="القائمة"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl font-black transition hover:bg-slate-200 active:scale-95"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute left-0 top-13 z-50 w-72 overflow-hidden rounded-2xl border bg-white shadow-2xl" style={{ top: "3.25rem" }}>
          <div className="flex items-center gap-3 border-b bg-white p-4">
            <BrandLogo variant="icon" size={44} href={null} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">مرحباً 👋</p>
              <p className="truncate font-black text-[#1F3F8F]">{userName || "زائر متجرك"}</p>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {[...items, ...merchantItems].map((it) => (
              <Link
                key={it.href + it.label}
                href={it.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
              >
                <span className="text-xl">{it.icon}</span>
                <span>
                  <span className="block text-sm font-bold text-slate-800">{it.label}</span>
                  {it.desc && <span className="block text-xs text-slate-400">{it.desc}</span>}
                </span>
              </Link>
            ))}
            <div className="my-2 border-t" />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                // مسح Mock من LocalStorage + جلسة الخادم
                try {
                  const { clearMockUser } = await import("@/lib/mock-auth");
                  clearMockUser();
                } catch {}
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/";
              }}
            >
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition hover:bg-red-50">
                <span className="text-xl">🚪</span>
                <span className="text-sm font-bold text-red-600">تسجيل الخروج</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
