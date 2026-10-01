"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function BottomNav() {
  const path = usePathname();
  const { role } = useAuth();

  // عناصر التنقل حسب الدور (Mock أولاً)
  const items =
    role === "super_admin" || role === "admin"
      ? [
          { href: "/", icon: "🏠", label: "الرئيسية" },
          { href: "/admin", icon: "🎛️", label: "الإدارة" },
          { href: "/merchant", icon: "🏪", label: "التاجر" },
          { href: "/orders", icon: "📦", label: "الطلبات" },
          { href: "/account", icon: "👤", label: "حسابي" },
        ]
      : role === "merchant"
        ? [
            { href: "/market", icon: "🏠", label: "السوق" },
            { href: "/merchant", icon: "🏪", label: "متجري" },
            { href: "/merchant/products/new", icon: "➕", label: "أضف" },
            { href: "/orders", icon: "📦", label: "الطلبات" },
            { href: "/account", icon: "👤", label: "حسابي" },
          ]
        : [
            { href: "/", icon: "🏠", label: "الرئيسية" },
            { href: "/market", icon: "🛍️", label: "السوق" },
            { href: "/cart", icon: "🛒", label: "السلة" },
            { href: "/orders", icon: "📦", label: "طلباتي" },
            { href: "/account", icon: "👤", label: "حسابي" },
          ];

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-40 border-t bg-white/97 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = path === it.href || (it.href !== "/" && path.startsWith(it.href));
          return (
            <Link
              key={it.href + it.label}
              href={it.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition ${
                active ? "text-emerald-700" : "text-slate-400"
              }`}
            >
              <span className="text-xl">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
