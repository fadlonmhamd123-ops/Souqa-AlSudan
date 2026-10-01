"use client";
import Link from "next/link";
import ThreeDotsMenu from "./ThreeDotsMenu";
import HomeHeaderMenu from "./HomeHeaderMenu";
import { useAuth } from "./AuthProvider";
import { roleLabelAr } from "@/lib/mock-auth";

interface Props {
  serverName?: string | null;
  serverRole?: string | null;
}

/** قسم المصادقة في الهيدر — Mock (LocalStorage) له الأولوية، ثم جلسة الخادم */
export default function HeaderAuth({ serverName, serverRole }: Props) {
  const { user, isMock, loading } = useAuth();

  const name = user?.name || serverName || null;
  const role = user?.role || serverRole || null;

  if (loading && !name) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-10 w-20 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!name) {
    return (
      <div className="flex items-center gap-2">
        <HomeHeaderMenu />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* شارة الدور */}
      <span
        className={`badge hidden sm:inline-flex ${
          role === "super_admin"
            ? "bg-amber-100 text-amber-900"
            : role === "merchant"
              ? "bg-blue-100 text-blue-800"
              : "bg-emerald-100 text-emerald-800"
        }`}
      >
        {roleLabelAr(role)}
        {isMock && <span className="text-[10px] opacity-70"> 🧪</span>}
      </span>
      {/* روابط سريعة حسب الدور */}
      {(role === "super_admin" || role === "admin") && (
        <Link href="/admin" className="hidden rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 md:block">
          🎛️ الإدارة
        </Link>
      )}
      {role === "merchant" && (
        <Link href="/merchant" className="hidden rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 md:block">
          🏪 متجري
        </Link>
      )}
      <ThreeDotsMenu role={role} userName={name} />
    </div>
  );
}
