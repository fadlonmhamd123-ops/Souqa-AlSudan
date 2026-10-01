"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface Gateway {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  color: string;
  accountLabel: string;
  instructionsAr: string[];
}

export function useGateways() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [mockMode, setMockMode] = useState(true);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/payments/providers")
      .then((r) => r.json())
      .then((d) => {
        setGateways(d.providers || []);
        setMockMode(d.mockMode !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { gateways, mockMode, loading };
}

export function GatewayPicker({
  gateways,
  selected,
  onSelect,
}: {
  gateways: Gateway[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (gateways.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {gateways.map((g) => {
        const active = selected === g.id;
        return (
          <button
            key={g.id}
            onClick={() => onSelect(g.id)}
            className={`rounded-2xl border-2 p-3 text-center transition active:scale-95 ${
              active ? "bg-slate-900 text-white shadow-lg" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            style={active ? { borderColor: g.color } : undefined}
          >
            <span className="block text-2xl">{g.icon}</span>
            <span className="mt-1 block text-sm font-black">{g.nameAr}</span>
            <span className="block text-[11px] opacity-70">{g.accountLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

interface IntentInfo {
  reference: string;
  provider: string;
  purpose: string;
  amount: string;
  currency: string;
  status: string;
  orderId: string | null;
  expiresAt: string;
}

function fmt(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0 ج.س";
  try {
    return `${n.toLocaleString("ar-SD")} ج.س`;
  } catch {
    return `${n.toLocaleString()} ج.س`;
  }
}

function statusBadge(status: string): { text: string; cls: string } {
  switch (status) {
    case "succeeded":
      return { text: "✅ تم الدفع", cls: "bg-emerald-100 text-emerald-700" };
    case "failed":
      return { text: "❌ فشل الدفع", cls: "bg-red-100 text-red-600" };
    case "expired":
      return { text: "⌛ انتهت الصلاحية", cls: "bg-slate-200 text-slate-600" };
    case "processing":
      return { text: "⏳ جاري التأكيد...", cls: "bg-blue-100 text-blue-700" };
    default:
      return { text: "⏳ بانتظار الدفع", cls: "bg-amber-100 text-amber-800" };
  }
}

function useCountdown(expiresAt: string | null): string {
  const [left, setLeft] = useState("");
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setLeft("انتهت المهلة");
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

/** Single payment intent card: instructions + reference + live polling + mock confirm. */
export function PaymentIntentCard({
  intent: initial,
  gateway,
  mockMode,
  onSettled,
}: {
  intent: IntentInfo;
  gateway: Gateway | undefined;
  mockMode: boolean;
  onSettled?: (status: string) => void;
}) {
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const done = status === "succeeded" || status === "failed" || status === "expired";
  const countdown = useCountdown(initial.expiresAt);
  const settledRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/status?reference=${encodeURIComponent(initial.reference)}`);
      const d = await res.json();
      if (res.ok && d.intent?.status) {
        setStatus(d.intent.status);
        if (["succeeded", "failed", "expired"].includes(d.intent.status) && !settledRef.current) {
          settledRef.current = true;
          onSettled?.(d.intent.status);
        }
      }
    } catch {}
  }, [initial.reference, onSettled]);

  useEffect(() => {
    if (done) return;
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [done, poll]);

  const confirmMock = async (fail = false) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/payments/mock-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: initial.reference, fail }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.error || "تعذر التأكيد");
        return;
      }
      setStatus(d.status);
      if (!settledRef.current) {
        settledRef.current = true;
        onSettled?.(d.status);
      }
    } catch {
      setMsg("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(initial.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const badge = statusBadge(status);

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{gateway?.icon || "💳"}</span>
          <div>
            <p className="text-sm font-black">الدفع عبر {gateway?.nameAr || initial.provider}</p>
            <p className="text-xs text-slate-400">{gateway?.accountLabel}</p>
          </div>
        </div>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-[11px] text-slate-400">رقم المرجع (انسخه في تطبيق البوابة)</p>
          <p className="font-mono text-lg font-black tracking-wide" dir="ltr">
            {initial.reference}
          </p>
        </div>
        <button onClick={copyRef} className="btn-ghost !px-3 !py-2 text-xs">
          {copied ? "✅ نُسخ" : "📋 نسخ"}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-bold text-slate-500">المبلغ المطلوب</span>
        <span className="text-xl font-black text-emerald-700">{fmt(initial.amount)}</span>
      </div>
      {!done && (
        <p className="mt-1 text-center text-xs font-bold text-slate-400">
          ⏱️ صالح لمدة: <span className="font-mono">{countdown}</span> • يتم التأكيد تلقائياً عبر Webhook
        </p>
      )}

      {gateway && gateway.instructionsAr.length > 0 && !done && (
        <ol className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          {gateway.instructionsAr.map((s, i) => (
            <li key={i}>
              <b>{i + 1}.</b> {s}
            </li>
          ))}
        </ol>
      )}

      {msg && <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-xs font-bold text-red-600">{msg}</p>}

      {!done && mockMode && (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-3">
          <p className="text-center text-xs font-black text-amber-800">
            🧪 وضع التجربة — حاكِ إشعار البوابة (Webhook) بضغطة واحدة
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => confirmMock(false)} disabled={busy} className="btn-primary !py-2.5 text-sm">
              {busy ? "⏳..." : "✅ لقد دفعت — تأكيد"}
            </button>
            <button
              onClick={() => confirmMock(true)}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-red-500 shadow-sm"
            >
              ❌ محاكاة فشل
            </button>
          </div>
          <p className="mt-1 text-center text-[11px] text-slate-400">
            في الإنتاج يصل التأكيد تلقائياً من البوابة دون أي زر
          </p>
        </div>
      )}

      {status === "succeeded" && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-black text-emerald-700">
          ✅ تم استلام الدفع وتحديث الرصيد تلقائياً (قيد مزدوج + سجل تدقيق)
        </div>
      )}
    </div>
  );
}

/** Full flow: pick gateway -> initiate -> pay. Used by wallet top-up. */
export function GatewayPaymentFlow({
  purpose,
  amount,
  onSuccess,
  onCancel,
}: {
  purpose: "wallet_topup" | "order_payment";
  amount: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { gateways, mockMode } = useGateways();
  const [selected, setSelected] = useState<string | null>(null);
  const [intent, setIntent] = useState<IntentInfo | null>(null);
  const [gatewayInfo, setGatewayInfo] = useState<Gateway | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const initiate = async () => {
    if (!selected) {
      setError("اختر بوابة الدفع أولاً");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected, purpose, amount }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "تعذر إنشاء عملية الدفع");
        return;
      }
      setIntent(d.intent);
      setGatewayInfo(d.gateway || gateways.find((g) => g.id === selected));
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  if (intent) {
    return (
      <div>
        <PaymentIntentCard
          intent={intent}
          gateway={gatewayInfo}
          mockMode={mockMode}
          onSettled={(st) => {
            if (st === "succeeded") onSuccess?.();
          }}
        />
        <button onClick={onCancel} className="mt-2 w-full text-center text-xs font-bold text-slate-400 underline">
          إلغاء والرجوع
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-black">💳 اختر بوابة الدفع الإلكتروني</p>
      <GatewayPicker gateways={gateways} selected={selected} onSelect={setSelected} />
      {error && <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-xs font-bold text-red-600">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onCancel} className="btn-ghost !py-2.5 text-sm">
          رجوع
        </button>
        <button onClick={initiate} disabled={busy || !selected} className="btn-primary !py-2.5 text-sm">
          {busy ? "⏳ جاري الإنشاء..." : `تأكيد ${fmt(amount)} ✅`}
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        🔒 آمن: التحقق من التوقيع والمبلغ في الخادم + قيد مزدوج + منع التكرار
      </p>
    </div>
  );
}
