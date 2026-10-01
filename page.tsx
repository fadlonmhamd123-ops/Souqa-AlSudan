import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

/** شاشة البداية — تصميم موبايل خفيف: Hero قصير + بطاقتان + شريط ثقة */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* ===== Hero قصير ===== */}
      <section className="rounded-3xl border border-slate-100 bg-white px-5 pb-5 pt-4 text-center shadow-[0_4px_16px_rgba(16,24,40,0.06)]">
        {/* الشعار الرسمي */}
        <div className="mx-auto flex justify-center">
          <BrandLogo variant="stacked" size={170} href={null} priority className="!ring-0 !shadow-none" />
        </div>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
          🇸🇩 منصة سودانية للتجارة الإلكترونية
        </span>
        <h1 className="mt-2 text-2xl font-black leading-snug text-slate-900 md:text-3xl">
          بيع وتسوق بسهولة مع متجرك
        </h1>
        <p className="mt-1 text-sm text-slate-500">مكان واحد يجمع التجار والمتسوقين</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-600">
          <span className="rounded-full bg-slate-50 px-3 py-1">💳 محفظة</span>
          <span className="text-slate-300">|</span>
          <span className="rounded-full bg-slate-50 px-3 py-1">💰 عمولة 5%</span>
          <span className="text-slate-300">|</span>
          <span className="rounded-full bg-slate-50 px-3 py-1">🔐 آمن</span>
        </div>

      </section>

      {/* ===== ابدأ مع متجرك ===== */}
      <h2 className="mt-5 text-center text-lg font-black text-slate-900">ابدأ مع متجرك</h2>
      <section className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* بطاقة التاجر */}
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_4px_16px_rgba(16,24,40,0.06)]">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-2xl">🏪</span>
            <div>
              <h3 className="font-black text-slate-900">فتح حساب تاجر</h3>
              <p className="text-xs text-slate-500">ابدأ بيع منتجاتك</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm font-bold text-slate-700">
            <li><span className="text-emerald-600">✓</span> محفظة تاجر</li>
            <li><span className="text-emerald-600">✓</span> عمولة 5%</li>
            <li><span className="text-emerald-600">✓</span> KYC آمن</li>
          </ul>
          <Link href="/auth/signup" className="btn-primary mt-4 w-full !py-3">
            ابدأ الآن ←
          </Link>
          <p className="mt-2 text-center text-xs text-slate-500">
            لديك حساب تاجر؟{" "}
            <Link href="/auth/login" className="font-black text-emerald-700 hover:underline">
              دخول
            </Link>
          </p>
        </div>

        {/* بطاقة الزبون */}
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_4px_16px_rgba(16,24,40,0.06)]">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-2xl">🛒</span>
            <div>
              <h3 className="font-black text-slate-900">دخول كزبون</h3>
              <p className="text-xs text-slate-500">تسوق وتابع طلباتك</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm font-bold text-slate-700">
            <li><span className="text-emerald-600">✓</span> متابعة الطلبات</li>
            <li><span className="text-emerald-600">✓</span> محفظة SDG</li>
            <li><span className="text-emerald-600">✓</span> Google</li>
          </ul>
          <Link href="/auth/login" className="btn-primary mt-4 w-full !py-3">
            دخول كزبون ←
          </Link>
          <p className="mt-2 text-center text-xs text-slate-500">
            جديد هنا؟{" "}
            <Link href="/auth/signup" className="font-black text-emerald-700 hover:underline">
              حساب مجاني
            </Link>
          </p>
        </div>
      </section>

      {/* ===== شريط الثقة ===== */}
      <section className="mt-3 grid grid-cols-4 gap-2 rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-[0_4px_16px_rgba(16,24,40,0.06)]">
        {[
          ["🔐", "أمان"],
          ["💳", "محفظة"],
          ["📦", "شحن"],
          ["💰", "5%"],
        ].map(([icon, label]) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-xl">{icon}</span>
            <span className="text-[11px] font-black text-slate-600">{label}</span>
          </div>
        ))}
      </section>

      <p className="mt-3 text-center">
        <Link href="/market" className="text-sm font-black text-emerald-700 hover:underline">
          🛍️ تصفح السوق
        </Link>
      </p>
    </div>
  );
}
