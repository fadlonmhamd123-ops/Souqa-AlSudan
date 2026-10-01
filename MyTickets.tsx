"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  severity: string;
  category: string;
  updatedAt: string;
}

const STATUS_AR: Record<string, string> = {
  open: "🟢 مفتوحة",
  in_progress: "🔵 قيد المعالجة",
  pending_user: "🟡 بانتظار ردّك",
  resolved: "✅ محلولة",
  closed: "⚫ مغلقة",
};

export default function MyTickets({ compact = false }: { compact?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gk = "";
    try {
      gk = localStorage.getItem("mtj_guest_key") || "";
    } catch {}
    fetch(`/api/assistant/tickets?guestKey=${gk}`)
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="card-soft animate-pulse p-6 text-center text-sm text-slate-400">جاري تحميل تذاكرك...</div>;
  }
  if (tickets.length === 0) {
    if (compact) return null;
    return (
      <div className="card-soft p-6 text-center">
        <div className="text-4xl">🎫</div>
        <p className="mt-2 text-sm font-bold">لا توجد تذاكر دعم بعد</p>
        <p className="text-xs text-slate-500">اسأل 🤖 المساعد، وسيُنشئ لك تذكرة عند الحاجة لتدخلٍ بشري.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tickets.map((t) => (
        <Link key={t.id} href={`/help/tickets/${t.id}`} className="card-soft block p-3 transition hover:shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-slate-400" dir="ltr">{t.ticketNumber}</p>
              <p className="truncate text-sm font-black">{t.subject}</p>
            </div>
            <span className="badge shrink-0 bg-slate-100 text-xs">{STATUS_AR[t.status] || t.status}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
