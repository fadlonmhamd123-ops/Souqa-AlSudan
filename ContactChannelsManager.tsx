"use client";
import { useCallback, useEffect, useState } from "react";
import { ChannelIcon } from "./ContactIcons";

type Scope = "platform" | "store" | "user";

interface Row {
  id: string;
  ownerType: string;
  ownerId: string;
  storeName?: string | null;
  channel: string;
  label: string | null;
  value: string;
  displayMasked: string | null;
  isActive: boolean;
  isPrimary: boolean;
  visibility: string;
  goUrl?: string;
  createdAt: string;
}

const VISIBILITY_AR: Record<string, string> = {
  public: "🌍 عام — يظهر للجميع",
  order_only: "📦 أطراف الطلب فقط",
  private: "🔒 خاص — مخفي",
};

export default function ContactChannelsManager({
  scope,
  storeId,
  stores,
  title,
  hint,
}: {
  scope: Scope;
  storeId?: string;
  stores?: Array<{ id: string; nameAr: string }>;
  title: string;
  hint?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [isPrimary, setIsPrimary] = useState(true);
  const [selStore, setSelStore] = useState(storeId || "");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (scope === "platform") {
        const r = await fetch("/api/contact-channels?scope=platform-manage");
        const d = await r.json();
        setRows(d.channels || []);
      } else if (scope === "user") {
        const r = await fetch("/api/contact-channels?mine=1");
        const d = await r.json();
        setRows(d.userChannels || []);
      } else {
        const r = await fetch("/api/contact-channels?mine=1");
        const d = await r.json();
        const all: Row[] = d.storeChannels || [];
        const target = storeId || selStore;
        setRows(target ? all.filter((x) => x.ownerId === target) : all);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [scope, storeId, selStore]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (storeId) setSelStore(storeId);
  }, [storeId]);

  const show = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 4000);
  };

  const submit = async () => {
    if (!value.trim()) {
      show("أدخل رقم الواتساب أو رابط الماسنجر أولاً");
      return;
    }
    if (scope === "store" && !(storeId || selStore)) {
      show("اختر المتجر أولاً");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/contact-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerType: scope,
          storeId: scope === "store" ? storeId || selStore : undefined,
          channel,
          value: value.trim(),
          label: label.trim() || undefined,
          isPrimary,
          visibility: scope === "platform" ? "public" : visibility,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        show(d.error || "تعذر الحفظ");
        return;
      }
      setValue("");
      setLabel("");
      show("✅ تم ربط القناة بنجاح");
      load();
    } catch {
      show("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/contact-channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const d = await res.json();
    show(d.error || "✅ تم التحديث");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذه القناة؟")) return;
    const res = await fetch(`/api/contact-channels?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    show(d.error || "✅ تم الحذف");
    load();
  };

  return (
    <div className="card-soft p-5">
      <h3 className="font-black">{title}</h3>
      {hint && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>}
      {msg && <div className="mt-2 rounded-xl bg-slate-100 p-2.5 text-center text-sm font-bold">{msg}</div>}

      {scope === "store" && stores && stores.length > 1 && !storeId && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-bold text-slate-500">المتجر</label>
          <select value={selStore} onChange={(e) => setSelStore(e.target.value)} className="input-field">
            <option value="">— اختر المتجر —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 rounded-2xl border-2 border-dashed border-slate-200 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setChannel("whatsapp")}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${
              channel === "whatsapp" ? "bg-[#25D366] text-white shadow" : "bg-slate-100 text-slate-600"
            }`}
          >
            <ChannelIcon channel="whatsapp" size={20} /> واتساب
          </button>
          <button
            onClick={() => setChannel("messenger")}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${
              channel === "messenger"
                ? "bg-gradient-to-l from-[#006AFF] to-[#A855F7] text-white shadow"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <ChannelIcon channel="messenger" size={20} /> ماسنجر
          </button>
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={channel === "whatsapp" ? "0912345678 أو 249912345678" : "اسم المستخدم أو رابط m.me/username"}
          className="input-field mt-2 text-left"
          dir="ltr"
          style={{ textAlign: "right" }}
        />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="اسم مميز (مثال: واتساب المبيعات)"
            className="input-field"
          />
          {scope !== "platform" ? (
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="input-field">
              <option value="public">{VISIBILITY_AR.public}</option>
              <option value="order_only">{VISIBILITY_AR.order_only}</option>
              <option value="private">{VISIBILITY_AR.private}</option>
            </select>
          ) : (
            <div className="grid place-items-center rounded-xl bg-slate-50 text-xs font-bold text-slate-500">
              🌍 قنوات المنصة عامة دائماً
            </div>
          )}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          ⭐ تعيين كقناة رئيسية (تظهر أولاً)
        </label>
        <button onClick={submit} disabled={saving} className="btn-primary mt-3 w-full">
          {saving ? "⏳ جاري الربط..." : "🔗 ربط القناة"}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {loading && <p className="py-4 text-center text-sm text-slate-400">جاري التحميل...</p>}
        {!loading && rows.length === 0 && (
          <p className="rounded-xl bg-slate-50 py-4 text-center text-sm text-slate-400">
            لا توجد قنوات مربوطة بعد — أضف قناتك الأولى بالأعلى 👆
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 p-3 ${
              r.isActive ? "border-slate-100 bg-white" : "border-slate-200 bg-slate-50 opacity-70"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`grid h-11 w-11 place-items-center rounded-xl text-white ${
                  r.channel === "whatsapp" ? "bg-[#25D366]" : "bg-gradient-to-br from-[#006AFF] to-[#A855F7]"
                }`}
              >
                <ChannelIcon channel={r.channel} size={22} />
              </span>
              <div>
                <p className="text-sm font-black">
                  {r.label || (r.channel === "whatsapp" ? "واتساب" : "ماسنجر")}
                  {r.isPrimary && <span className="mr-1 text-xs">⭐</span>}
                  {!r.isActive && <span className="badge mr-1 bg-slate-200 text-slate-600">موقوفة</span>}
                </p>
                <p className="font-mono text-xs text-slate-500" dir="ltr">
                  {r.displayMasked}
                </p>
                <p className="text-[11px] text-slate-400">
                  {r.storeName ? `🏪 ${r.storeName} • ` : ""}
                  {VISIBILITY_AR[r.visibility] || r.visibility}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.goUrl && (
                <a
                  href={r.goUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700"
                >
                  تجربة 💬
                </a>
              )}
              <button
                onClick={() => patch(r.id, { isActive: !r.isActive })}
                className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-black text-slate-600"
              >
                {r.isActive ? "إيقاف" : "تفعيل"}
              </button>
              {!r.isPrimary && (
                <button
                  onClick={() => patch(r.id, { isPrimary: true })}
                  className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-700"
                >
                  ⭐ رئيسية
                </button>
              )}
              <button
                onClick={() => remove(r.id)}
                className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-600"
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-slate-50 p-2 text-center text-[11px] leading-relaxed text-slate-400">
        🔒 خصوصيتك محمية: يظهر رقمك مقنّعاً (***091) في الواجهات، ولا يُكشف الرقم الكامل إلا داخل محادثة
        الواتساب/الماسنجر نفسها بعد ضغط زر المحادثة.
      </p>
    </div>
  );
}
