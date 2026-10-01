"use client";
import { useState } from "react";

/** Safe official-channel (WhatsApp/Messenger) reply drafter for merchant/admin */
export default function ChannelDraftPanel() {
  const [topic, setTopic] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [needsHuman, setNeedsHuman] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/channel-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), statusLine: statusLine.trim() || undefined, customerName: customerName.trim() || undefined, needsHuman }),
      });
      const d = await res.json();
      if (res.ok) setDraft(d.draft);
      else setDraft(d.error || "تعذّر إنشاء المسودة.");
    } catch {
      setDraft("تعذّر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="card-soft p-4">
      <h3 className="font-black">✍️ صياغة ردّ آمن للقنوات الرسمية</h3>
      <p className="mt-1 text-xs text-slate-500">
        يجهّز لك 🤖 المساعد رداً مهذباً وآمناً للواتساب/الماسنجر دون أي بياناتٍ حساسة — انسخه والصقه في المحادثة.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="الموضوع (مثال: تأخر شحن الطلب ORD-...)" className="input-field" maxLength={200} />
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم العميل (اختياري)" className="input-field" maxLength={60} />
      </div>
      <input value={statusLine} onChange={(e) => setStatusLine(e.target.value)} placeholder="سطر الحالة (مثال: تم شحن طلبك اليوم وسيصل خلال يومين)" className="input-field mt-2" maxLength={500} />
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
        <input type="checkbox" checked={needsHuman} onChange={(e) => setNeedsHuman(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
        سيتابع الأمر موظف بشري (يضيف سطر التحويل للدعم)
      </label>
      <button onClick={generate} disabled={busy || !topic.trim()} className="btn-primary mt-3 w-full disabled:opacity-50">
        {busy ? "⏳ جاري الصياغة..." : "✨ إنشاء المسودة الآمنة"}
      </button>
      {draft && (
        <div className="mt-3">
          <div className="whitespace-pre-wrap rounded-2xl bg-slate-900 p-3 text-sm leading-relaxed text-emerald-50" dir="rtl">
            {draft}
          </div>
          <button onClick={copy} className="btn-ghost mt-2 w-full text-sm">
            {copied ? "✅ تم النسخ" : "📋 نسخ الرد"}
          </button>
        </div>
      )}
    </div>
  );
}
