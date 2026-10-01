"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadMockPlatformFinance,
  saveWithdrawalDecision,
  type MockPlatformFinance,
  type MockWithdrawal,
} from "@/lib/mock-platform-finance";

function fmt(v: string | number | unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0 ج.س";
  try {
    return `${n.toLocaleString("ar-SD")} ج.س`;
  } catch {
    return `${n.toLocaleString()} ج.س`;
  }
}

function entryTypeAr(t: string): string {
  const map: Record<string, string> = {
    commission: "عمولة منصة 5%",
    commission_cash: "عمولة (نقدي)",
    commission_due_settlement: "تسوية مستحقات",
    sale_settlement: "تسوية بيع",
    delay_penalty: "غرامة تأخير 5%",
    refund: "استرداد",
    withdrawal_payout: "صرف سحب",
    deposit: "إيداع",
    gateway_deposit: "شحن عبر بوابة 💳",
    gateway_order_payment: "دفع طلب عبر بوابة 💳",
    wallet_order_payment: "دفع من المحفظة 💰",
    platform_withdraw: "سحب أرباح المنصة 🏧",
  };
  return map[t] || t;
}

function methodAr(m: string): string {
  if (m === "bankak") return "بنكك 📱";
  if (m === "ocash") return "أو-كاش 💳";
  if (m === "fawry") return "فوري 🏦";
  if (m === "ebs") return "EBS 🌐";
  if (m === "wallet") return "محفظة 💰";
  return m;
}

interface LiveWithdrawal {
  id: string;
  merchant_name: string | null;
  merchant_phone: string | null;
  store_name: string | null;
  amount: string;
  method: string;
  account_details: string | null;
  status: string;
  admin_note: string | null;
  decided_at: string | null;
  created_at: string;
}

export default function AdminFinance() {
  // ⚡ عرض فوري من البيانات المحلية — لا تعليق ولا فراغ أبداً
  const [mock, setMock] = useState<MockPlatformFinance | null>(null);
  const [live, setLive] = useState<{
    platformWallet: { availableBalance: string; pendingBalance: string; lockedBalance: string };
    earnings: { totalCommissions: string; settledCommissions: string; dueCommissions: string; penalties: string; thisMonth: string; ordersSettled: number };
    escrow: { balance: string; ordersCount: number };
    ledger: Array<{ id: string; entry_type: string; amount: string; description: string; created_at: string; debit_name: string; credit_name: string }>;
    withdrawals: LiveWithdrawal[];
    gateways?: {
      intents: Array<{ reference: string; provider: string; purpose: string; amount: string; status: string; created_at: string; user_name: string | null }>;
      events: Array<{ provider: string; event_id: string; intent_reference: string | null; signature_valid: boolean; status: string; created_at: string }>;
      totals: Array<{ provider: string; c: number; s: string }>;
    };
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdBank, setWdBank] = useState("");
  const [wdBusy, setWdBusy] = useState(false);
  const didSync = useRef(false);

  useEffect(() => {
    setMock(loadMockPlatformFinance());
  }, []);

  const syncLive = useCallback(async () => {
    if (didSync.current) return;
    didSync.current = true;
    setSyncing(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch("/api/admin?section=finance", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("live failed");
      const d = await res.json();
      if (!d?.platformWallet) throw new Error("bad shape");
      setLive(d);
    } catch {
      // يبقى على البيانات التجريبية
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    syncLive();
  }, [syncLive]);

  const showMsg = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 4000);
  };

  const decideLive = async (id: string, approve: boolean) => {
    const note = approve
      ? prompt("ملاحظة الصرف (اختياري):", "تم الصرف ✅") || "تم الصرف ✅"
      : prompt("سبب الرفض (مطلوب):", "") || "";
    if (!approve && !note.trim()) {
      showMsg("يجب كتابة سبب الرفض");
      return;
    }
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: approve ? "approve_withdrawal" : "reject_withdrawal",
          withdrawalId: id,
          adminNote: note,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        showMsg(d.error || "تعذر تنفيذ القرار");
        return;
      }
      showMsg(approve ? "✅ تم اعتماد وصرف السحب" : "تم رفض الطلب");
      didSync.current = false;
      await syncLive();
    } catch {
      showMsg("تعذر الاتصال بالخادم");
    }
  };

  const decideMock = (w: MockWithdrawal, approve: boolean) => {
    const note = approve
      ? prompt("ملاحظة الصرف (اختياري):", "تم التحويل بنجاح ✅") || "تم التحويل بنجاح ✅"
      : prompt("سبب الرفض:", "") || "";
    if (!approve && !note.trim()) {
      showMsg("يجب كتابة سبب الرفض");
      return;
    }
    const status = approve ? "paid" : "rejected";
    saveWithdrawalDecision(w.id, status, note);
    setMock(loadMockPlatformFinance());
    showMsg(approve ? "✅ تم اعتماد السحب (تجريبي)" : "تم رفض الطلب (تجريبي)");
  };

  const platformWithdraw = async () => {
    const n = Number(wdAmount);
    if (!Number.isFinite(n) || n <= 0) {
      showMsg("أدخل مبلغ سحب صالحاً");
      return;
    }
    if (!hasLive) {
      showMsg("🧪 الوضع التجريبي: سحب المنصة متاح في الوضع الحي فقط");
      return;
    }
    setWdBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "platform_withdraw", amount: n.toFixed(2), bankRef: wdBank || "Admin Bank Account" }),
      });
      const d = await res.json();
      if (!res.ok) {
        showMsg(d.error || "تعذر السحب");
        return;
      }
      showMsg(`✅ تم سحب أرباح المنصة ${fmt(n)} — الرصيد بعد: ${fmt(d.balanceAfter)}`);
      setWdAmount("");
      setWdBank("");
      didSync.current = false;
      await syncLive();
    } catch {
      showMsg("تعذر الاتصال بالخادم");
    } finally {
      setWdBusy(false);
    }
  };

  if (!mock) {
    return <div className="card-soft mt-4 animate-pulse p-10 text-center">جاري تجهيز اللوحة المالية...</div>;
  }

  const hasLive = !!live;
  const wallet = live?.platformWallet || mock.platformWallet;
  const earnings = live?.earnings || mock.earnings;
  const escrow = live?.escrow || mock.escrow;
  const useLiveWithdrawals = hasLive && (live?.withdrawals?.length || 0) > 0;
  const pendingLive = (live?.withdrawals || []).filter((w) => w.status === "pending").length;
  const pendingMock = mock.withdrawals.filter((w) => w.status === "pending").length;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black">💳 المالية والمحفظة — منصة متجرك</h2>
        <button
          onClick={() => {
            didSync.current = false;
            syncLive();
          }}
          className="btn-ghost !py-2 text-xs"
        >
          {syncing ? "⏳ جاري المزامنة..." : "🔄 تحديث"}
        </button>
      </div>

      {hasLive ? (
        <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
          🟢 متصل بالخادم — أرقام حية من قاعدة البيانات
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 text-center text-sm font-bold text-amber-800">
          🧪 عرض تجريبي — بيانات محلية للمعاينة الفورية
          <span className="mt-0.5 block text-xs font-normal text-amber-600">
            تُستبدل تلقائياً بالبيانات الحية عند توفر الاتصال
          </span>
        </div>
      )}
      {msg && <div className="card-soft mt-2 p-3 text-center text-sm font-bold">{msg}</div>}

      {/* محفظة المنصة */}
      <div className="card-soft mt-3 overflow-hidden">
        <div className="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-900 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">🏦 محفظة المنصة — الرصيد المتاح (SDG)</p>
              <p className="mt-1 text-4xl font-black">{fmt(wallet.availableBalance)}</p>
              <p className="mt-1 font-mono text-[11px] opacity-70" dir="ltr">PLATFORM / SYSTEM_ADMIN_WALLET / SDG / ACTIVE</p>
            </div>
            <span className="text-5xl">🏦</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <p className="text-xs opacity-80">⏳ معلق (قيد التسوية)</p>
              <p className="mt-0.5 text-lg font-black">{fmt(wallet.pendingBalance)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <p className="text-xs opacity-80">🔒 محجوز (ضمان/نزاعات)</p>
              <p className="mt-0.5 text-lg font-black">{fmt(wallet.lockedBalance)}</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
            <p className="text-xs font-black opacity-90">🏧 سحب أرباح المنصة إلى الحساب البنكي (قيد مزدوج + تدقيق)</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <input
                type="number" min="1" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)}
                placeholder="المبلغ (ج.س)"
                className="w-full rounded-xl border-0 px-3 py-2 text-sm text-slate-900 outline-none"
              />
              <input
                value={wdBank} onChange={(e) => setWdBank(e.target.value)}
                placeholder="مرجع البنك (اختياري)"
                className="w-full rounded-xl border-0 px-3 py-2 text-sm text-slate-900 outline-none"
              />
              <button
                onClick={platformWithdraw} disabled={wdBusy || !hasLive}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {wdBusy ? "⏳ جاري السحب..." : "تأكيد سحب المنصة ✅"}
              </button>
            </div>
            {!hasLive && <p className="mt-1 text-[11px] opacity-70">🧪 متاح في الوضع الحي فقط</p>}
          </div>
        </div>
      </div>

      {/* بطاقات الإيرادات */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card-soft border-t-4 border-emerald-500 p-4">
          <p className="text-2xl">💰</p>
          <p className="mt-1 font-black text-emerald-700">{fmt(earnings.settledCommissions)}</p>
          <p className="text-xs text-slate-500">إيرادات العمولات المحصلة (5%)</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{earnings.ordersSettled} طلب مُسوّى</p>
        </div>
        <div className="card-soft border-t-4 border-blue-500 p-4">
          <p className="text-2xl">🛡️</p>
          <p className="mt-1 font-black text-blue-700">{fmt(escrow.balance)}</p>
          <p className="text-xs text-slate-500">الرصيد المعلق للطلبات (ضمان)</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{escrow.ordersCount} طلب نشط</p>
        </div>
        <div className="card-soft border-t-4 border-amber-500 p-4">
          <p className="text-2xl">📅</p>
          <p className="mt-1 font-black text-amber-700">{fmt(earnings.thisMonth)}</p>
          <p className="text-xs text-slate-500">إيراد هذا الشهر</p>
        </div>
        <div className="card-soft border-t-4 border-red-500 p-4">
          <p className="text-2xl">⚠️</p>
          <p className="mt-1 font-black text-red-600">{fmt(earnings.dueCommissions)}</p>
          <p className="text-xs text-slate-500">عمولات مستحقة على التجار</p>
          <p className="mt-0.5 text-[11px] text-slate-400">غرامات: {fmt(earnings.penalties)}</p>
        </div>
      </div>

      {/* إدارة طلبات سحب التجار */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-black">
          📤 طلبات سحب أرباح التجار{" "}
          <span className="badge bg-orange-100 text-orange-700">
            {useLiveWithdrawals ? pendingLive : pendingMock} بانتظار البت
          </span>
        </h2>
      </div>
      <div className="mt-2 space-y-2">
        {useLiveWithdrawals
          ? live!.withdrawals.map((w) => (
              <div key={w.id} className={`card-soft p-4 ${w.status === "pending" ? "border-r-4 border-orange-400" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-black">
                      🏪 {w.store_name || w.merchant_name || "تاجر"} — <span className="text-emerald-700">{fmt(w.amount)}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {methodAr(w.method)} • {w.account_details || "—"} • 📞 <span dir="ltr">{w.merchant_phone || ""}</span>
                    </p>
                    <p className="text-xs text-slate-400">{new Date(w.created_at).toLocaleString("ar-SD")}</p>
                    {w.admin_note && <p className="mt-1 text-xs font-bold text-slate-600">📝 {w.admin_note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`badge ${
                        w.status === "pending"
                          ? "bg-orange-100 text-orange-700"
                          : w.status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-600"
                      }`}
                    >
                      {w.status === "pending" ? "⏳ بانتظار البت" : w.status === "paid" ? "✅ تم الصرف" : "❌ مرفوض"}
                    </span>
                    {w.status === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => decideLive(w.id, true)} className="btn-primary !py-1.5 text-xs">
                          ✅ اعتماد وصرف
                        </button>
                        <button onClick={() => decideLive(w.id, false)} className="rounded-xl bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600">
                          ❌ رفض
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          : mock.withdrawals.map((w) => (
              <div key={w.id} className={`card-soft p-4 ${w.status === "pending" ? "border-r-4 border-orange-400" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-black">
                      🏪 {w.storeName} — <span className="text-emerald-700">{fmt(w.amount)}</span>
                      <span className="badge mr-2 bg-amber-100 text-amber-700">🧪</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {w.methodAr} • {w.accountDetails} • 📞 <span dir="ltr">{w.merchantPhone}</span>
                    </p>
                    <p className="text-xs text-slate-400">{new Date(w.createdAt).toLocaleString("ar-SD")}</p>
                    {w.adminNote && <p className="mt-1 text-xs font-bold text-slate-600">📝 {w.adminNote}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`badge ${
                        w.status === "pending"
                          ? "bg-orange-100 text-orange-700"
                          : w.status === "paid" || w.status === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-600"
                      }`}
                    >
                      {w.status === "pending" ? "⏳ بانتظار البت" : w.status === "paid" ? "✅ تم الصرف" : w.status === "approved" ? "✅ معتمد" : "❌ مرفوض"}
                    </span>
                    {w.status === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => decideMock(w, true)} className="btn-primary !py-1.5 text-xs">
                          ✅ اعتماد وصرف
                        </button>
                        <button onClick={() => decideMock(w, false)} className="rounded-xl bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600">
                          ❌ رفض
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* سجل الدفتر المالي */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-black">📜 سجل المعاملات المالية للمنصة (دفتر الأستاذ)</h2>
        {!hasLive && <span className="badge bg-amber-100 text-amber-700">🧪 بيانات محلية</span>}
      </div>
      <div className="mt-2 space-y-2">
        {hasLive && (live?.ledger?.length || 0) > 0
          ? live!.ledger.map((e) => (
              <div key={e.id} className="card-soft flex items-center justify-between gap-2 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                    {e.entry_type.includes("commission") || e.entry_type.includes("penalty") ? "💰" : e.entry_type === "refund" ? "↩️" : "📒"}
                  </span>
                  <div>
                    <p className="font-bold">
                      {entryTypeAr(e.entry_type)} <span className="text-xs font-normal text-slate-400">• {e.description}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      مدين: {e.debit_name || "—"} ← دائن: {e.credit_name || "—"} • {new Date(e.created_at).toLocaleString("ar-SD")}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 font-black text-emerald-700">{fmt(e.amount)}</p>
              </div>
            ))
          : mock.ledger.map((e) => (
              <div key={e.id} className="card-soft flex items-center justify-between gap-2 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                    {e.entryType.includes("commission") || e.entryType.includes("penalty") ? "💰" : e.entryType === "refund" ? "↩️" : "📒"}
                  </span>
                  <div>
                    <p className="font-bold">
                      {e.entryTypeAr} <span className="text-xs font-normal text-slate-400">• {e.description}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      مدين: {e.debitLabel} ← دائن: {e.creditLabel} • {new Date(e.createdAt).toLocaleString("ar-SD")}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 font-black text-emerald-700">{fmt(e.amount)}</p>
              </div>
            ))}
      </div>

      {/* بوابات الدفع */}
      {live?.gateways && (
        <div className="mt-6">
          <h2 className="font-black">💳 بوابات الدفع الإلكتروني (بنكك / أوكاش / فوري / EBS)</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {live.gateways.totals.map((t) => (
              <div key={t.provider} className="card-soft p-3 text-center">
                <p className="text-sm font-black">{methodAr(t.provider)}</p>
                <p className="mt-1 font-black text-emerald-700">{fmt(t.s)}</p>
                <p className="text-[11px] text-slate-400">{t.c} عملية</p>
              </div>
            ))}
            {live.gateways.totals.length === 0 && (
              <div className="card-soft col-span-full p-4 text-center text-sm text-slate-400">
                لا توجد عمليات بوابات بعد
              </div>
            )}
          </div>
          <h3 className="mt-4 text-sm font-black">🧾 أحدث عمليات الدفع</h3>
          <div className="mt-2 space-y-2">
            {live.gateways.intents.map((i) => (
              <div key={i.reference} className="card-soft flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-mono font-black" dir="ltr">{i.reference}</p>
                  <p className="text-xs text-slate-400">
                    {methodAr(i.provider)} • {i.purpose === "order_payment" ? "دفع طلب" : "شحن محفظة"} • {i.user_name || ""} • {new Date(i.created_at).toLocaleString("ar-SD")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${i.status === "succeeded" ? "bg-emerald-100 text-emerald-700" : i.status === "failed" || i.status === "expired" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                    {i.status}
                  </span>
                  <span className="font-black">{fmt(i.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          <h3 className="mt-4 text-sm font-black">📡 سجل إشعارات الـ Webhook</h3>
          <div className="mt-2 space-y-2">
            {live.gateways.events.map((e, idx) => (
              <div key={idx} className="card-soft flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <span className="font-black">{methodAr(e.provider)}</span>
                <span className="font-mono" dir="ltr">{e.intent_reference || "—"}</span>
                <span>{e.signature_valid ? "🔏 توقيع سليم" : "⚠️ توقيع مرفوض"}</span>
                <span className="badge bg-slate-100">{e.status}</span>
                <span className="text-slate-400">{new Date(e.created_at).toLocaleString("ar-SD")}</span>
              </div>
            ))}
            {live.gateways.events.length === 0 && (
              <div className="card-soft p-4 text-center text-sm text-slate-400">لا توجد إشعارات بعد</div>
            )}
          </div>
          <div className="card-soft mt-3 p-3 text-xs leading-relaxed text-slate-500" dir="ltr">
            <p className="font-black" dir="rtl">🔗 نقاط الـ Webhook للبوابات:</p>
            <p className="font-mono">POST /api/payments/webhook/bankak</p>
            <p className="font-mono">POST /api/payments/webhook/ocash</p>
            <p className="font-mono">POST /api/payments/webhook/fawry</p>
            <p className="font-mono">POST /api/payments/webhook/ebs</p>
            <p dir="rtl" className="mt-1">التوقيع: HMAC-SHA256 في ترويسة <span className="font-mono">x-signature</span> — الجسم: <span className="font-mono">{"{reference, amount, status, providerRef, eventId}"}</span></p>
          </div>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-slate-400">
        🔒 جميع العمليات المالية بقيد مزدوج وسجل تدقيق غير قابل للتعديل • العمولة 5% على قيمة المنتج فقط
      </p>
    </div>
  );
}
