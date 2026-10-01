"use client";
import { useCallback, useEffect, useState } from "react";

interface Ticket {
  id: string;
  ticketNumber: string;
  userId: string | null;
  guestKey: string | null;
  orderId: string | null;
  category: string;
  severity: string;
  status: string;
  subject: string;
  smartSummary: string | null;
  assignedTo: string | null;
  userName?: string;
  userRole?: string;
  userPhoneMasked?: string | null;
  messagesCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface TicketMsg {
  id: string;
  senderId: string | null;
  senderRole: string;
  body: string;
  createdAt: string;
}

const STATUS_AR: Record<string, string> = {
  open: "🟢 مفتوحة",
  in_progress: "🔵 قيد المعالجة",
  pending_user: "🟡 بانتظار المستخدم",
  resolved: "✅ محلولة",
  closed: "⚫ مغلقة",
};

const SEV_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-slate-100 text-slate-600",
};

const CAT_AR: Record<string, string> = {
  order: "طلب 📦",
  payment: "دفع 💳",
  wallet: "محفظة 💰",
  negotiation: "تفاوض 🤝",
  shipping: "شحن 🚚",
  fraud: "احتيال 🚨",
  dispute: "نزاع ⚖️",
  product: "منتج 🏷️",
  account: "حساب 👤",
  general: "عام 💬",
};

export default function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({ open: 0, critical: 0, conversations: 0, escalated: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMsg[]>([]);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?section=support");
      const d = await res.json();
      setTickets(d.tickets || []);
      setStats(d.stats || { open: 0, critical: 0, conversations: 0, escalated: 0 });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = async (t: Ticket) => {
    setSelected(t);
    setMessages([]);
    setConversation([]);
    try {
      const res = await fetch(`/api/assistant/tickets/${t.id}`);
      const d = await res.json();
      setMessages(d.messages || []);
      setConversation(d.conversation || []);
    } catch {}
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/assistant/tickets/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.error || "تعذّر الإرسال");
      } else {
        setReply("");
        setMsg("✅ تم إرسال الرد");
        openTicket(selected);
        load();
      }
    } catch {
      setMsg("تعذّر الاتصال");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const manage = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    const res = await fetch(`/api/assistant/tickets/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setMsg(d.error || "✅ تم التحديث");
    if (res.ok) {
      openTicket({ ...selected, ...(payload as Partial<Ticket>) });
      load();
    }
    setTimeout(() => setMsg(""), 3000);
  };

  const filtered = tickets.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return ["open", "in_progress"].includes(t.status);
    if (filter === "critical") return t.severity === "critical";
    if (filter === "fraud") return t.category === "fraud";
    return true;
  });

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card-soft p-4"><p className="text-2xl">🎫</p><p className="mt-1 font-black">{stats.open}</p><p className="text-xs text-slate-500">تذاكر مفتوحة</p></div>
        <div className="card-soft p-4"><p className="text-2xl">🚨</p><p className="mt-1 font-black text-red-600">{stats.critical}</p><p className="text-xs text-slate-500">حرجة غير محلولة</p></div>
        <div className="card-soft p-4"><p className="text-2xl">🤖</p><p className="mt-1 font-black">{stats.conversations}</p><p className="text-xs text-slate-500">محادثات المساعد</p></div>
        <div className="card-soft p-4"><p className="text-2xl">📩</p><p className="mt-1 font-black">{stats.escalated}</p><p className="text-xs text-slate-500">تصعيدات بشرية</p></div>
      </div>

      {msg && <div className="card-soft mt-3 p-3 text-center text-sm font-bold">{msg}</div>}

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {[["all", "الكل"], ["open", "المفتوحة"], ["critical", "🚨 الحرجة"], ["fraud", "🛡️ الاحتيال"]].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-black ${filter === v ? "bg-slate-900 text-white" : "bg-white shadow"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card-soft mt-4 p-10 text-center">جاري التحميل...</div>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {filtered.length === 0 && <div className="card-soft p-8 text-center text-slate-400">لا توجد تذاكر 🎉</div>}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => openTicket(t)}
                className={`card-soft w-full p-3 text-right transition hover:shadow-lg ${selected?.id === t.id ? "ring-2 ring-emerald-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-400" dir="ltr">{t.ticketNumber}</p>
                    <p className="truncate text-sm font-black">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.userName} ({t.userRole}) {t.userPhoneMasked ? `• ${t.userPhoneMasked}` : ""} • 💬 {t.messagesCount ?? 0}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`badge ${SEV_STYLE[t.severity] || "bg-slate-100"}`}>{t.severity}</span>
                    <span className="badge bg-slate-100 text-xs">{STATUS_AR[t.status] || t.status}</span>
                    <span className="badge bg-emerald-50 text-[11px] text-emerald-700">{CAT_AR[t.category] || t.category}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div>
            {!selected ? (
              <div className="card-soft grid min-h-[300px] place-items-center p-10 text-center text-slate-400">
                اختر تذكرة لعرض الملخص الذكي والمحادثة 👈
              </div>
            ) : (
              <div className="card-soft p-4">
                <p className="font-mono text-xs text-slate-400" dir="ltr">{selected.ticketNumber}</p>
                <h3 className="font-black">{selected.subject}</h3>
                {selected.smartSummary && (
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-900 p-3 text-xs leading-relaxed text-emerald-100" dir="rtl">
                    {selected.smartSummary}
                  </div>
                )}
                {conversation.length > 0 && (
                  <details className="mt-2 rounded-2xl bg-slate-50 p-3">
                    <summary className="cursor-pointer text-xs font-black text-slate-600">
                      🤖 سجل محادثة المساعد ({conversation.length})
                    </summary>
                    <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                      {conversation.map((m, i) => (
                        <p key={i} className={`text-xs leading-relaxed ${m.role === "user" ? "text-slate-800" : "text-emerald-800"}`}>
                          <b>{m.role === "user" ? "👤 المستخدم:" : "🤖 المساعد:"}</b> {m.content.slice(0, 400)}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-2xl p-2.5 text-sm ${
                        m.senderRole === "admin" || m.senderRole === "super_admin"
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100"
                      }`}
                    >
                      <p className="text-[11px] opacity-70">
                        {m.senderRole === "admin" || m.senderRole === "super_admin" ? "🛡️ الإدارة" : `👤 ${m.senderRole}`} •{" "}
                        {new Date(m.createdAt).toLocaleString("ar-SD")}
                      </p>
                      <p className="mt-0.5 leading-relaxed">{m.body}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendReply()}
                    placeholder="اكتب رد الإدارة..."
                    className="input-field flex-1"
                    maxLength={2000}
                  />
                  <button onClick={sendReply} disabled={busy || !reply.trim()} className="btn-primary !px-4 disabled:opacity-50">
                    إرسال
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button onClick={() => manage({ assignToMe: true })} className="btn-ghost !py-1.5 text-xs">🙋 استلام التذكرة</button>
                  <button onClick={() => manage({ status: "in_progress" })} className="btn-ghost !py-1.5 text-xs">🔵 قيد المعالجة</button>
                  <button onClick={() => manage({ status: "resolved" })} className="btn-ghost !py-1.5 text-xs">✅ حلّها</button>
                  <button onClick={() => manage({ status: "closed" })} className="btn-ghost !py-1.5 text-xs">⚫ إغلاق</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
