"use client";
import { useEffect, useState } from "react";
import MtjAssistantPanel from "./MtjAssistantPanel";

/** Global floating MTJ AI Assistant (right side; help widget is on the left) */
export default function MtjAssistantWidget() {
  const [open, setOpen] = useState(false);
  // نبدأ بـ true (بدون فقاعة ترحيب) لتفادي وميض SSR، ثم نقرأ التخزين بعد التركيب
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setSeen(localStorage.getItem("mtj_assistant_seen") === "1");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !seen) {
      setSeen(true);
      try {
        localStorage.setItem("mtj_assistant_seen", "1");
      } catch {}
    }
  };

  return (
    <div className="no-print fixed bottom-20 right-4 z-40 md:bottom-6">
      {open && (
        <div className="mb-3 w-[calc(100vw-2rem)] max-w-sm">
          <MtjAssistantPanel compact />
        </div>
      )}
      <div className="flex flex-col items-end gap-2">
        {!open && !seen && (
          <button
            onClick={toggle}
            className="max-w-[220px] animate-bounce rounded-2xl rounded-br-md bg-slate-900 p-2.5 text-right text-xs font-bold text-white shadow-xl"
          >
            👋 جرّب {`🤖 المساعد`} الجديد! اسأل عن طلبك أو رصيدك
          </button>
        )}
        <button
          onClick={toggle}
          aria-label="المساعد الذكي"
          className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-slate-900 via-emerald-900 to-emerald-600 text-2xl text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:scale-105 active:scale-95"
        >
          {open ? "✕" : "🤖"}
          {!open && (
            <span className="absolute -left-1 -top-1 h-4 w-4 animate-pulse rounded-full bg-emerald-400 ring-2 ring-white" />
          )}
        </button>
      </div>
    </div>
  );
}
