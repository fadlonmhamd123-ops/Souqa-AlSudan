"use client";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  buildMockUser,
  detectMockLogin,
  saveMockUser,
  DEMO_ADMIN_PHONE,
  DEMO_BUYER_EMAIL,
  DEMO_MERCHANT_EMAIL,
  roleLabelAr,
} from "@/lib/mock-auth";

/**
 * شريط الجلسة التجريبية — يظهر أعلى الموقع عند الدخول بـ Mock
 * للتمييز الواضح بين الأدوار والتبديل الفوري بينها.
 */
export default function MockSessionBar() {
  const { mockUser, logout } = useAuth();
  const [switching, setSwitching] = useState(false);

  if (!mockUser) return null;

  const switchTo = async (identifier: string) => {
    setSwitching(true);
    try {
      const detected = detectMockLogin(identifier);
      saveMockUser(buildMockUser(identifier, detected));
      try {
        await fetch("/api/auth/mock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, role: detected.role, name: detected.name }),
        });
      } catch {}
      window.location.href = detected.redirect;
    } finally {
      setSwitching(false);
    }
  };

  const color =
    mockUser.role === "super_admin"
      ? "from-amber-600 to-orange-600"
      : mockUser.role === "merchant"
        ? "from-blue-600 to-indigo-600"
        : "from-emerald-600 to-teal-600";

  return (
    <div className={`no-print bg-gradient-to-l ${color} px-4 py-2 text-white`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-xs font-bold">
        <span>
          🧪 جلسة تجريبية: {mockUser.name} • {roleLabelAr(mockUser.role)} •{" "}
          <span className="font-mono opacity-80" dir="ltr">{mockUser.identifier}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <span className="opacity-70">تبديل سريع:</span>
          <button
            disabled={switching}
            onClick={() => switchTo(DEMO_ADMIN_PHONE)}
            className="rounded-lg bg-white/20 px-2.5 py-1 transition hover:bg-white/30 disabled:opacity-50"
          >
            👑 أدمن
          </button>
          <button
            disabled={switching}
            onClick={() => switchTo(DEMO_MERCHANT_EMAIL)}
            className="rounded-lg bg-white/20 px-2.5 py-1 transition hover:bg-white/30 disabled:opacity-50"
          >
            🏪 تاجر
          </button>
          <button
            disabled={switching}
            onClick={() => switchTo(DEMO_BUYER_EMAIL)}
            className="rounded-lg bg-white/20 px-2.5 py-1 transition hover:bg-white/30 disabled:opacity-50"
          >
            🛒 زبون
          </button>
          <button
            onClick={logout}
            className="rounded-lg bg-black/25 px-2.5 py-1 transition hover:bg-black/40"
          >
            🚪 خروج
          </button>
        </div>
      </div>
    </div>
  );
}
