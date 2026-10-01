"use client";
import { useEffect, useState } from "react";
import { JUMUAH_VERSES, KAHF_EXCERPT, TASBEEH_LIST } from "@/lib/friday";
import BrandLogo from "./BrandLogo";

function checkFriday(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Khartoum";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const wd = get("weekday");
    const mins = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
    return wd === "Fri" && mins >= 11 * 60 + 55 && mins < 14 * 60;
  } catch {
    const n = new Date();
    return n.getDay() === 5 && n.getHours() * 60 + n.getMinutes() >= 715 && n.getHours() < 14;
  }
}

export default function FridayMode() {
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tasbeeh, setTasbeeh] = useState(0);
  const [dhikr, setDhikr] = useState(0);
  const [showKahf, setShowKahf] = useState(false);
  const [forcePreview, setForcePreview] = useState(false);

  useEffect(() => {
    const tick = () => setActive(checkFriday());
    // أول تقييم مؤجّل (لتفادي setState المتزامن داخل effect)، ثم كل 30 ثانية
    const first = setTimeout(() => {
      tick();
      const qp = new URLSearchParams(window.location.search);
      if (qp.get("friday") === "1") setForcePreview(true);
    }, 0);
    const id = setInterval(tick, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const show = (active || forcePreview) && !dismissed;
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-gradient-to-b from-emerald-950 via-emerald-900 to-slate-950 text-white">
      <div className="friday-pattern min-h-full px-5 py-10">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <BrandLogo variant="icon" size={56} href={null} />
          </div>
          <div className="animate-float-soft mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-4xl ring-2 ring-emerald-300/40">
            🕌
          </div>
          <h1 className="mt-4 text-3xl font-black">وضع الجمعة 🕌</h1>
          <p className="mt-2 text-emerald-100/90">
            توقف مؤقت للبيع والشراء وقت صلاة الجمعة — طلباتك ومحفظتك بأمان، وسنعود بعد الصلاة مباشرة
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
            {active ? "مفعّل الآن تلقائياً حسب توقيت منطقتك" : "معاينة وضع الجمعة"}
          </div>

          <div className="card-soft mt-6 p-6 text-right text-slate-900">
            <p className="text-sm font-bold text-emerald-700">{JUMUAH_VERSES.source}</p>
            <p className="mt-3 text-lg leading-loose">{JUMUAH_VERSES.ar}</p>
            <p className="mt-3 text-sm text-slate-500">
              قال ﷺ: «خير يوم طلعت عليه الشمس يوم الجمعة» — جمعة مباركة عليكم 🇸🇩
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setShowKahf(!showKahf)} className="card-soft p-4 text-slate-900 transition hover:scale-[1.02]">
              <div className="text-3xl">📖</div>
              <div className="mt-1 font-bold">قارئ الكهف</div>
              <div className="text-xs text-slate-500">سورة الكهف يوم الجمعة نور</div>
            </button>
            <div className="card-soft p-4 text-slate-900">
              <div className="text-3xl">📿</div>
              <div className="mt-1 font-bold">{TASBEEH_LIST[dhikr]}</div>
              <div className="mt-1 text-2xl font-black text-emerald-700">{tasbeeh}</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setTasbeeh((v) => v + 1)}
                  className="btn-primary flex-1 !py-2 text-sm"
                >
                  سبّح
                </button>
                <button
                  onClick={() => { setDhikr((d) => (d + 1) % TASBEEH_LIST.length); }}
                  className="btn-ghost !py-2 text-sm"
                >
                  التالي
                </button>
              </div>
              <button onClick={() => setTasbeeh(0)} className="mt-2 text-xs text-slate-400 underline">
                تصفير العداد
              </button>
            </div>
          </div>

          {showKahf && (
            <div className="card-soft mt-4 p-6 text-right text-slate-900">
              <p className="font-black text-emerald-700">{KAHF_EXCERPT.title}</p>
              <p className="mt-3 leading-loose">{KAHF_EXCERPT.ar}</p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={() => setDismissed(true)} className="flex-1 rounded-xl bg-white/15 py-3 font-bold backdrop-blur transition hover:bg-white/25">
              تصفح بهدوء (الشراء متوقف)
            </button>
          </div>
          <p className="mt-3 text-xs text-emerald-100/70">
            الطلبات القائمة والمحافظ والسجلات تعمل بشكل طبيعي في الخلفية — التوقف للواجهة فقط
          </p>
        </div>
      </div>
    </div>
  );
}
