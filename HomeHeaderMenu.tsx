"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** زر "لدي حساب بالفعل" — يفتح (دخول كزبون / دخول تاجر) */
export default function HomeHeaderMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open ]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-primary !py-2.5 text-sm whitespace-nowrap"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        لدي حساب بالفعل
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-50 w-56 overflow-hidden rounded-2xl border bg-white shadow-2xl"
          style={{ top: "3rem" }}
        >
          <div className="p-2">
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-xl">🛒</span>
              <span>
                <span className="block text-sm font-black text-slate-800">دخول كزبون</span>
                <span className="block text-xs text-slate-400">تسوق وتابع طلباتك</span>
              </span>
            </Link>
            <Link
              href="/merchant"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-xl">🏪</span>
              <span>
                <span className="block text-sm font-black text-slate-800">دخول تاجر</span>
                <span className="block text-xs text-slate-400">لوحة المتجر والمبيعات</span>
              </span>
            </Link>
            <div className="my-2 border-t" />
            <Link
              href="/auth/signup"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="block rounded-xl px-3 py-2 text-center text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700"
            >
              ليس لديك حساب؟ سجّل مجاناً ✨
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
