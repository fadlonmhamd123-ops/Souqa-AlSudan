"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import {
  loadMockWallet,
  saveMockWallet,
  resetMockWallet,
  mockDeposit,
  mockWithdraw,
  mockTransfer,
  type MockWalletData,
} from "@/lib/mock-wallet";
import { GatewayPaymentFlow } from "./GatewayPayment";
import BrandLogo from "./BrandLogo";

type Source = "mock" | "live";
type Action = "deposit" | "withdraw" | "transfer" | null;

function fmt(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0 ج.س";
  try {
    return `${n.toLocaleString("ar-SD")} ج.س`;
  } catch {
    return `${n.toLocaleString()} ج.س`;
  }
}

function methodLabel(m: string): string {
  if (m === "bankak") return "بنكك 📱";
  if (m === "ocash") return "أو-كاش 💳";
  if (m === "fawry") return "فوري 🏦";
  if (m === "ebs") return "EBS 🌐";
  return m;
}

export default function WalletView() {
  const { user, mockUser, realUser, isLoggedIn, loading: authLoading } = useAuth();

  // مفتاح المستخدم للبيانات المحلية (Mock أولاً ثم الحقيقي)
  const userKey = useMemo(() => {
    if (mockUser) return `mock:${mockUser.identifier}`;
    if (realUser) return `real:${realUser.id}`;
    return "guest";
  }, [mockUser, realUser]);

  const role = user?.role || null;

  // ⚡ عرض فوري: بيانات تجريبية من أول render — لا تعليق أبداً
  const [data, setData] = useState<MockWalletData | null>(null);
  const [source, setSource] = useState<Source>("mock");
  const [syncing, setSyncing] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bankak");
  const [target, setTarget] = useState("");
  const [orderId, setOrderId] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [totalSales, setTotalSales] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);
  const [depositStep, setDepositStep] = useState<"amount" | "gateway">("amount");
  const [depositAmount, setDepositAmount] = useState("");
  const didLiveSync = useRef(false);

  // 1) تحميل فوري من LocalStorage
  useEffect(() => {
    if (!isLoggedIn) {
      setData(null);
      return;
    }
    const local = loadMockWallet(userKey, role);
    setData(local);
    setSource("mock");
  }, [isLoggedIn, userKey, role]);

  // 2) محاولة الترقية للبيانات الحية في الخلفية (مهلة 4 ثوانٍ — لا تعلق الصفحة)
  const syncLive = useCallback(async () => {
    if (!isLoggedIn || didLiveSync.current) return;
    didLiveSync.current = true;
    setSyncing(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch("/api/wallets", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("live failed");
      const d = await res.json();
      if (!d?.wallet?.availableBalance) throw new Error("bad shape");
      if (d.kycStatus) setKycStatus(String(d.kycStatus));
      if (d.totalSales !== null && d.totalSales !== undefined) setTotalSales(String(d.totalSales));
      if (d.permissions) setPermissions(d.permissions as Record<string, boolean>);
      setData({
        wallet: {
          availableBalance: String(d.wallet.availableBalance),
          pendingBalance: String(d.wallet.pendingBalance ?? "0.00"),
          lockedBalance: String(d.wallet.lockedBalance ?? "0.00"),
        },
        transactions: Array.isArray(d.transactions)
          ? d.transactions.map((t: Record<string, string>) => ({
              id: String(t.id),
              type: t.type === "debit" ? "debit" : "credit",
              amount: String(t.amount),
              balanceAfter: String(t.balanceAfter ?? "0.00"),
              description: String(t.description || t.type),
              createdAt: String(t.createdAt || new Date().toISOString()),
            }))
          : [],
        commissionDue: d.commissionDue !== null && d.commissionDue !== undefined ? String(d.commissionDue) : null,
        updatedAt: new Date().toISOString(),
      });
      setSource("live");
    } catch {
      // يبقى على البيانات المحلية — الصفحة تعمل فوراً
      setSource("mock");
    } finally {
      setSyncing(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    didLiveSync.current = false;
    if (isLoggedIn) syncLive();
  }, [isLoggedIn, userKey, syncLive]);

  const showMsg = (text: string, type: "ok" | "err" = "ok") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 5000);
  };

  const persist = (next: MockWalletData) => {
    setData(next);
    saveMockWallet(userKey, next);
  };

  const doDeposit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      showMsg("أدخل مبلغاً صالحاً أكبر من صفر", "err");
      return;
    }
    // جرّب API أولاً (أفضل جهد)، ثم المحلي
    let liveOk = false;
    if (source === "live") {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch("/api/wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: n.toFixed(2), method }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const d = await res.json();
        if (res.ok && d.ok) {
          liveOk = true;
          showMsg(`✅ تم الإيداع — الصافي: ${d.deposited} | تسوية مستحقات: ${d.settledDue}`);
          didLiveSync.current = false;
          await syncLive();
        }
      } catch {}
    }
    if (!liveOk) {
      if (!data) return;
      const next = mockDeposit(data, n, `إلكتروني (${methodLabel(method)}) 🧪`);
      persist(next);
      setSource("mock");
      showMsg(`✅ تم الإيداع التجريبي ${fmt(n)} عبر ${methodLabel(method)}`);
    }
    setAmount("");
    setAction(null);
  };

  const doWithdraw = () => {
    const n = Number(amount);
    if (!data) return;
    const { data: next, error } = mockWithdraw(data, n, `إلى ${methodLabel(method)} 🧪`);
    if (error) {
      showMsg(error, "err");
      return;
    }
    persist(next);
    setSource("mock");
    showMsg(`✅ تم السحب التجريبي ${fmt(n)} إلى ${methodLabel(method)}`);
    setAmount("");
    setAction(null);
  };

  /** إرسال طلب سحب رسمي للإدارة (يظهر في اللوحة المالية للأدمن) */
  const requestOfficialWithdrawal = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      showMsg("أدخل مبلغاً صالحاً أكبر من صفر", "err");
      return;
    }
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n.toFixed(2), method, accountDetails: target || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        showMsg(d.error || "تعذر إرسال الطلب", "err");
        return;
      }
      showMsg(`📝 تم إرسال طلب السحب الرسمي ${fmt(n)} — بانتظار اعتماد الإدارة`);
      setAmount("");
      setTarget("");
      setAction(null);
    } catch {
      showMsg("تعذر الاتصال بالخادم", "err");
    }
  };

  const doTransfer = async () => {
    const n = Number(amount);
    if (!data) return;
    // Backend-Authoritative: التحويل يتطلب طلب بيع رسمي — بدونه يُرفض
    if (source === "live") {
      if (!orderId.trim()) {
        showMsg("⛔ التحويل المباشر ممنوع دون طلب بيع رسمي — أدخل رقم الطلب (Order ID)", "err");
        return;
      }
      try {
        const res = await fetch("/api/wallets/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: n.toFixed(2), orderId: orderId.trim(), note: target || undefined }),
        });
        const d = await res.json();
        if (!res.ok) {
          showMsg(d.error || "تعذر التحويل", "err");
          return;
        }
        showMsg(`✅ تم تحويل ${fmt(n)} على الطلب — تسوية مستحقات: ${d.settledDue}`);
        setAmount("");
        setTarget("");
        setOrderId("");
        setAction(null);
        didLiveSync.current = false;
        await syncLive();
        return;
      } catch {
        showMsg("تعذر الاتصال بالخادم", "err");
        return;
      }
    }
    const { data: next, error } = mockTransfer(data, n, target);
    if (error) {
      showMsg(error, "err");
      return;
    }
    persist(next);
    setSource("mock");
    showMsg(`✅ تم التحويل التجريبي ${fmt(n)} إلى ${target} 🧪 (في الوضع الحي: يتطلب طلباً رسمياً)`);
    setAmount("");
    setTarget("");
    setAction(null);
  };

  // ---- حالة التحقق من الجلسة (قصيرة — لا تعليق) ----
  if (authLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card-soft animate-pulse p-6">
          <div className="h-6 w-40 rounded bg-slate-200" />
          <div className="mt-4 h-28 rounded-2xl bg-slate-100" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  // ---- غير مسجل الدخول ----
  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card-soft p-8 text-center md:p-10">
          <div className="mx-auto flex justify-center">
            <BrandLogo variant="stacked" size={130} href={null} />
          </div>
          <h1 className="mt-4 text-2xl font-black">💰 محفظة متجرك</h1>
          <p className="mt-2 font-bold text-slate-600">سجل الدخول لمشاهدة المحفظة</p>
          <p className="mt-1 text-sm text-slate-400">
            اعرض رصيدك، أودع، اسحب، وحوّل — كل معاملاتك في مكان واحد آمن
          </p>
          <Link href="/auth/login" className="btn-primary mt-5 w-full !py-3">
            تسجيل الدخول 🚀
          </Link>
          <Link href="/auth/signup" className="btn-ghost mt-2 w-full !py-3">
            إنشاء حساب جديد ✨
          </Link>
          <p className="mt-3 text-[11px] text-slate-400">🧪 الوضع التجريبي: أي كلمة مرور تعمل — جرّب merchant@matjarak.com كتاجر</p>
        </div>
      </div>
    );
  }

  // ---- مسجل الدخول: عرض فوري (البيانات المحلية جاهزة دائماً) ----
  const wallet = data?.wallet || { availableBalance: "0.00", pendingBalance: "0.00", lockedBalance: "0.00" };
  const transactions = data?.transactions || [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black">💰 المحفظة</h1>
        <button
          onClick={() => {
            didLiveSync.current = false;
            syncLive();
          }}
          className="btn-ghost !py-2 text-xs"
        >
          {syncing ? "⏳ جاري المزامنة..." : "🔄 تحديث"}
        </button>
      </div>

      {/* تنبيه شفاف: محفظة تجريبية */}
      {source === "mock" ? (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 text-center text-sm font-bold text-amber-800">
          🧪 هذه محفظة تجريبية موصلة بالبيانات المحلية
          <span className="mt-0.5 block text-xs font-normal text-amber-600">
            تعمل فوراً بدون انتظار الخادم — عملياتك محفوظة على جهازك
          </span>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
          🟢 المحفظة متصلة بالخادم — الأرصدة حية
        </div>
      )}

      {/* تنبيه التوثيق للتاجر */}
      {role === "merchant" && (kycStatus === "PENDING" || (source === "mock" && kycStatus === null)) && (
        <div className="mt-3 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 text-center">
          <p className="text-sm font-black text-orange-800">🔒 الميزات المالية الحساسة مقيدة — التوثيق (KYC) غير مكتمل</p>
          <p className="mt-1 text-xs text-orange-600">
            يمكنك عرض الأرباح والأرصدة واستقبال التسويات، لكن طلب السحب يتطلب إكمال التوثيق أولاً
          </p>
        </div>
      )}
      {role === "merchant" && kycStatus === "VERIFIED" && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
          ✅ حساب موثق (KYC) — كل الميزات المالية متاحة
        </div>
      )}

      {/* بطاقة الرصيد */}
      <div className="card-soft mt-3 overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-700 to-teal-600 p-6 text-white">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm opacity-80">الرصيد المتاح (SDG) 💵</p>
              <p className="mt-1 text-4xl font-black">{fmt(wallet.availableBalance)}</p>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
              {user.isMock ? "🧪 تجريبي" : "👤 " + (user.name?.slice(0, 12) || "")}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <p className="text-xs opacity-80">⏳ الرصيد المعلق</p>
              <p className="mt-0.5 text-lg font-black">{fmt(wallet.pendingBalance)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <p className="text-xs opacity-80">🔒 الرصيد المحجوز</p>
              <p className="mt-0.5 text-lg font-black">{fmt(wallet.lockedBalance)}</p>
            </div>
          </div>
          {data?.commissionDue && Number(data.commissionDue) > 0 && (
            <div className="mt-3 rounded-xl bg-red-500/25 p-3 text-sm font-bold backdrop-blur">
              ⚠️ عمولة مستحقة للمنصة: {fmt(data.commissionDue)} — تُخصم أولاً من أي إيداع قادم (أولوية إلزامية)
              <span className="mt-0.5 block text-xs font-normal opacity-90">⛔ لا يمكن مسحها يدوياً — تُسوّى تلقائياً فقط</span>
            </div>
          )}
          {totalSales !== null && role === "merchant" && (
            <div className="mt-2 rounded-xl bg-white/15 p-3 text-sm font-bold backdrop-blur">
              📊 إجمالي المبيعات: {fmt(totalSales)}
            </div>
          )}
        </div>

        {/* أزرار العمليات السريعة */}
        <div className="p-5">
          <h2 className="font-black">⚡ عمليات سريعة</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button onClick={() => { setAction("deposit"); setMsg(""); }} className={`rounded-2xl p-4 text-center font-black transition active:scale-95 ${action === "deposit" ? "bg-emerald-700 text-white shadow-lg" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
              <span className="block text-2xl">📥</span>
              إيداع
            </button>
            <button onClick={() => { setAction("withdraw"); setMsg(""); }} className={`rounded-2xl p-4 text-center font-black transition active:scale-95 ${action === "withdraw" ? "bg-orange-600 text-white shadow-lg" : "bg-orange-50 text-orange-800 hover:bg-orange-100"}`}>
              <span className="block text-2xl">📤</span>
              سحب
            </button>
            <button onClick={() => { setAction("transfer"); setMsg(""); }} className={`rounded-2xl p-4 text-center font-black transition active:scale-95 ${action === "transfer" ? "bg-blue-700 text-white shadow-lg" : "bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>
              <span className="block text-2xl">🔄</span>
              تحويل
            </button>
          </div>

          {/* نموذج العملية */}
          {action === "deposit" && (
            <div className="mt-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-sm font-black text-emerald-800">📥 شحن المحفظة إلكترونياً</p>
              {source === "live" ? (
                depositStep === "amount" ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input type="number" min="1" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="المبلغ (ج.س)" className="input-field" />
                    <button
                      onClick={() => {
                        const n = Number(depositAmount);
                        if (!Number.isFinite(n) || n <= 0) {
                          showMsg("أدخل مبلغاً صالحاً أكبر من صفر", "err");
                          return;
                        }
                        setMsg("");
                        setDepositStep("gateway");
                      }}
                      className="btn-primary"
                    >
                      متابعة لاختيار البوابة 💳
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <GatewayPaymentFlow
                      purpose="wallet_topup"
                      amount={Number(depositAmount).toFixed(2)}
                      onSuccess={() => {
                        showMsg("✅ تم شحن المحفظة بنجاح — جاري تحديث الرصيد...");
                        setDepositAmount("");
                        setDepositStep("amount");
                        setAction(null);
                        didLiveSync.current = false;
                        setTimeout(() => syncLive(), 800);
                      }}
                      onCancel={() => setDepositStep("amount")}
                    />
                  </div>
                )
              ) : (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ (ج.س) 🧪" className="input-field" />
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className="input-field">
                    <option value="bankak">بنكك 📱</option>
                    <option value="ocash">أو-كاش 💳</option>
                    <option value="fawry">فوري 🏦</option>
                    <option value="ebs">EBS 🌐</option>
                  </select>
                  <button onClick={doDeposit} className="btn-primary">تأكيد الإيداع ✅</button>
                </div>
              )}
              {source === "live" && (
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  🔒 الدفع عبر بوابات معتمدة (بنكك / أوكاش / فوري / EBS) — التأكيد تلقائي عبر Webhook + قيد مزدوج
                </p>
              )}
            </div>
          )}
          {action === "withdraw" && (
            <div className="mt-3 rounded-2xl border-2 border-orange-200 bg-orange-50/50 p-4">
              <p className="text-sm font-black text-orange-800">📤 سحب إلى حسابك</p>
              {role === "merchant" && kycStatus === "PENDING" && source === "live" && (
                <p className="mt-1 rounded-xl bg-orange-100 p-2 text-xs font-bold text-orange-700">
                  🔒 طلب السحب الرسمي مقيد حتى إكمال التوثيق (KYC) — القرار يُفرض من الخادم
                </p>
              )}
              {role === "buyer" && (
                <p className="mt-1 rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-500">
                  ℹ️ الزبون يسحب رصيده الخاص فقط — التحويل للتجار يتم عبر دفع الطلبات فقط
                </p>
              )}
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ (ج.س)" className="input-field" />
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="input-field">
                  <option value="bankak">بنكك 📱</option>
                  <option value="ocash">أو-كاش 💳</option>
                  <option value="fawry">فوري 🏦</option>
                  <option value="ebs">EBS 🌐</option>
                </select>
                <button onClick={doWithdraw} className="rounded-xl bg-orange-600 px-4 py-3 font-black text-white transition hover:bg-orange-700">تأكيد السحب ✅</button>
              </div>
              <p className="mt-1 text-xs text-slate-500">المتاح للسحب: {fmt(wallet.availableBalance)}</p>
              {(role === "merchant" || role === "admin" || role === "super_admin") && (
                <button
                  onClick={requestOfficialWithdrawal}
                  disabled={role === "merchant" && kycStatus === "PENDING" && source === "live"}
                  className="mt-2 w-full rounded-xl border-2 border-dashed border-orange-300 bg-white px-4 py-2.5 text-sm font-black text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📝 إرسال كطلب سحب رسمي للإدارة (يُعتمد من اللوحة المالية)
                </button>
              )}
            </div>
          )}
          {action === "transfer" && (
            <div className="mt-3 rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4">
              <p className="text-sm font-black text-blue-800">🔄 تحويل على طلب رسمي</p>
              <p className="mt-1 rounded-xl bg-red-50 p-2 text-xs font-bold text-red-600">
                ⛔ التحويل المباشر للتجار ممنوع دون طلب بيع رسمي — التحويل متاح فقط لدفع طلب يخصك
              </p>
              <div className="mt-2 grid gap-2">
                <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ (ج.س)" className="input-field" />
                <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="رقم الطلب الرسمي (Order ID) — مطلوب" className="input-field font-mono" dir="ltr" style={{ textAlign: "right" }} />
                <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="ملاحظة (اختياري)" className="input-field" />
                <button onClick={doTransfer} className="rounded-xl bg-blue-700 px-4 py-3 font-black text-white transition hover:bg-blue-800">تأكيد التحويل على الطلب ✅</button>
              </div>
            </div>
          )}

          {msg && (
            <p className={`mt-3 rounded-xl p-3 text-sm font-bold ${msgType === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {msg}
            </p>
          )}

          {source === "mock" && (
            <button
              onClick={() => {
                const fresh = resetMockWallet(userKey, role);
                setData(fresh);
                showMsg("🔄 تمت إعادة تعيين البيانات التجريبية");
              }}
              className="mt-3 w-full text-center text-xs font-bold text-slate-400 underline"
            >
              إعادة تعيين البيانات التجريبية
            </button>
          )}
        </div>
      </div>

      {/* سجل المعاملات */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-black">📜 سجل المعاملات المالية الأخيرة</h2>
        <span className="badge bg-slate-100 text-slate-600">{transactions.length} عملية</span>
      </div>
      <div className="mt-2 space-y-2 pb-4">
        {transactions.length === 0 && (
          <div className="card-soft p-6 text-center text-slate-400">لا توجد حركات بعد — جرّب الإيداع ⚡</div>
        )}
        {transactions.map((t) => (
          <div key={t.id} className="card-soft flex items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${t.type === "credit" ? "bg-emerald-100" : "bg-red-100"}`}>
                {t.type === "credit" ? "📥" : "📤"}
              </span>
              <div>
                <p className="text-sm font-bold">{t.description || t.type}</p>
                <p className="text-xs text-slate-400">
                  {new Date(t.createdAt).toLocaleString("ar-SD", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-left">
              <p className={`font-black ${t.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>
                {t.type === "credit" ? "+" : "−"}{fmt(t.amount)}
              </p>
              <p className="text-xs text-slate-400">بعد: {fmt(t.balanceAfter)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
