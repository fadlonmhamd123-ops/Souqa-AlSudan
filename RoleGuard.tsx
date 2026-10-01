"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

interface Props {
  children: ReactNode;
  allow: Array<"buyer" | "merchant" | "admin" | "super_admin">;
  /** إذا كان الدور merchant يُسمح له تلقائياً بدخول صفحات buyer وهكذا */
  fallback?: string;
  pageName?: string;
}

/**
 * حارس الصلاحيات — يقرأ الدور من Mock (LocalStorage) أولاً ثم الخادم.
 * - super_admin يدخل كل شيء
 * - admin يدخل admin + merchant + buyer
 * - merchant يدخل merchant + buyer
 * - buyer يدخل buyer فقط
 */
export default function RoleGuard({ children, allow, fallback, pageName }: Props) {
  const { role, loading, isLoggedIn } = useAuth();
  const router = useRouter();

  const expanded = (r: string | null): string[] => {
    if (r === "super_admin") return ["buyer", "merchant", "admin", "super_admin"];
    if (r === "admin") return ["buyer", "merchant", "admin"];
    if (r === "merchant") return ["buyer", "merchant"];
    if (r === "buyer") return ["buyer"];
    return [];
  };

  const allowed = role ? expanded(role).some((r) => (allow as string[]).includes(r)) : false;

  useEffect(() => {
    if (!loading && !isLoggedIn && fallback) {
      router.push(fallback);
    }
  }, [loading, isLoggedIn, fallback, router]);

  if (loading) {
    return <div className="card-soft p-10 text-center">🔐 جاري التحقق من الصلاحيات...</div>;
  }

  if (!isLoggedIn) {
    return (
      <div className="card-soft mx-auto max-w-md p-10 text-center">
        <div className="text-6xl">🔐</div>
        <p className="mt-3 font-black">سجل الدخول أولاً</p>
        <p className="text-sm text-slate-500">هذه الصفحة {pageName ? `(${pageName})` : ""} تتطلب تسجيل الدخول</p>
        <Link href="/auth/login" className="btn-primary mt-4">تسجيل الدخول 🚀</Link>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="card-soft mx-auto max-w-md p-10 text-center">
        <div className="text-6xl">⛔</div>
        <p className="mt-3 font-black">صلاحية غير كافية</p>
        <p className="text-sm text-slate-500">
          دورك الحالي: <b>{role}</b> — هذه الصفحة {pageName ? `(${pageName})` : ""} تتطلب: <b>{allow.join(" / ")}</b>
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/" className="btn-ghost text-sm">الرئيسية 🏠</Link>
          <Link href="/auth/login" className="btn-primary text-sm">تبديل الحساب 🔄</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
