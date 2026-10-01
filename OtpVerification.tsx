"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Channel = "sms" | "whatsapp" | "email";

interface Props {
  contact: string;
  purpose?: string;
  defaultChannel?: Channel;
  title?: string;
  onVerified?: (token: string) => void;
  autoSend?: boolean;
}

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const CHANNEL_META: Record<Channel, { label: string; icon: string; desc: string }> = {
  sms: { label: "رسائل SMS", icon: "📩", desc: "رمز سريع على هاتفك" },
  whatsapp: { label: "واتساب WhatsApp", icon: "💬", desc: "رمز عبر واتساب" },
  email: { label: "البريد الإلكتروني", icon: "📧", desc: "رمز على بريدك" },
};

export default function OtpVerification({
  contact,
  purpose = "verify",
  defaultChannel,
  title = "تحقق من الرمز",
  onVerified,
  autoSend = true,
}: Props) {
  const initialChannel: Channel = defaultChannel || (contact.includes("@") ? "email" : "sms");
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [deliverySeconds, setDeliverySeconds] = useState<number | null>(null);
  const [showAlt, setShowAlt] = useState(false);
  const [masked, setMasked] = useState(contact);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const sentOnce = useRef(false);

  const requestCode = useCallback(
    async (ch: Channel) => {
      setSending(true);
      setError("");
      setInfo("");
      setDemoCode("");
      try {
        const res = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact, purpose, channel: ch }),
        });
        const d = await res.json();
        if (!res.ok) {
          if (d.locked || res.status === 423) {
            setLockedUntil(d.lockedUntil ? new Date(d.lockedUntil).getTime() : Date.now() + 15 * 60 * 1000);
            setError(d.error || "الحساب محظور مؤقتاً");
          } else if (d.cooldown || res.status === 429) {
            setResendAt(Date.now() + (d.resendAfterSeconds || 60) * 1000);
            if (d.expiresAt) setExpiresAt(new Date(d.expiresAt).getTime());
            setError(d.error || "انتظر قبل إعادة الإرسال");
          } else {
            setError(d.error || "تعذر إرسال الرمز");
          }
          return;
        }
        setMasked(d.maskedContact || contact);
        setExpiresAt(new Date(d.expiresAt).getTime());
        setResendAt(Date.now() + (d.resendAfterSeconds || 60) * 1000);
        setDeliverySeconds(d.deliverySeconds ?? null);
        setRemainingAttempts(null);
        if (d.demoCode) setDemoCode(d.demoCode);
        const chLabel = CHANNEL_META[ch].label;
        setInfo(`تم إرسال الرمز عبر ${chLabel} خلال ${d.deliverySeconds ?? "أقل من 5"} ثانية ⚡ — صالح لمدة 3 دقائق`);
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => inputsRef.current[0]?.focus(), 100);
      } catch {
        setError("تعذر الاتصال بالخادم");
      } finally {
        setSending(false);
      }
    },
    [contact, purpose]
  );

  useEffect(() => {
    if (autoSend && !sentOnce.current && contact) {
      sentOnce.current = true;
      requestCode(initialChannel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiryLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const resendLeft = resendAt ? Math.max(0, Math.floor((resendAt - now) / 1000)) : 0;
  const expired = expiresAt !== null && expiryLeft <= 0;
  const locked = lockedUntil !== null && lockedUntil > now;

  const setDigit = (i: number, v: string) => {
    const val = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
    if (val && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) next[i] = text[i] || "";
      return next;
    });
    const idx = Math.min(text.length, 5);
    inputsRef.current[idx]?.focus();
  };

  const verify = async () => {
    const code = digits.join("");
    if (code.length !== 6) {
      setError("أدخل الرمز المكون من 6 أرقام");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, purpose, code }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.locked) {
          setLockedUntil(d.lockedUntil ? new Date(d.lockedUntil).getTime() : Date.now() + 15 * 60 * 1000);
        }
        if (typeof d.remainingAttempts === "number") setRemainingAttempts(d.remainingAttempts);
        setError(d.error || "الرمز غير صحيح");
        return;
      }
      setInfo("✅ تم التحقق بنجاح");
      onVerified?.(d.token);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  const switchChannel = async (ch: Channel) => {
    setChannel(ch);
    setShowAlt(false);
    // bypass cooldown display for explicit channel switch? backend still enforces 60s;
    // we force by clearing resendAt UI only if user explicitly chose another method is not allowed —
    // keep backend authoritative: just request, backend decides.
    await requestCode(ch);
  };

  return (
    <div className="card-soft p-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
          {CHANNEL_META[channel].icon}
        </div>
        <h3 className="mt-2 text-lg font-black">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          أرسلنا رمزاً إلى <b dir="ltr">{masked}</b> عبر {CHANNEL_META[channel].label}
        </p>
        {deliverySeconds !== null && (
          <p className="mt-1 text-[11px] font-bold text-emerald-700">
            ⚡ وصل خلال {deliverySeconds} ثانية (بوابة سريعة — حد أقصى 5 ثوانٍ)
          </p>
        )}
      </div>

      {locked ? (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-center">
          <p className="text-2xl">🔒</p>
          <p className="mt-1 text-sm font-black text-red-700">تم حظر الحساب مؤقتاً لأسباب أمنية</p>
          <p className="mt-1 text-xs text-red-500">
            بسبب 3 محاولات خاطئة — يُرفع الحظر خلال {formatMMSS(Math.floor((lockedUntil - now) / 1000))}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm font-black">
            <span className={expired ? "text-red-600" : "text-slate-600"}>
              {expired ? "⏰ انتهت صلاحية الرمز" : `⏳ صالح لمدة: ${formatMMSS(expiryLeft)}`}
            </span>
          </div>
          <p className="mt-1 text-center text-[11px] text-slate-400">مدة الصلاحية: 3 دقائق من لحظة الإرسال</p>

          <div className="mt-3 flex justify-center gap-2" dir="ltr" onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                inputMode="numeric"
                maxLength={1}
                className="h-12 w-11 rounded-xl border-2 border-slate-200 text-center text-xl font-black outline-none transition focus:border-emerald-600"
              />
            ))}
          </div>

          {remainingAttempts !== null && (
            <p className="mt-2 text-center text-xs font-bold text-amber-600">
              ⚠️ تبقى {remainingAttempts} {remainingAttempts === 1 ? "محاولة واحدة" : "محاولات"} قبل الحظر المؤقت
            </p>
          )}

          <button onClick={verify} disabled={loading || expired} className="btn-primary mt-4 w-full !py-3">
            {loading ? "جاري التحقق..." : "تحقق من الرمز ✅"}
          </button>

          {demoCode && (
            <p className="mt-2 rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-700">
              🧪 رمز تجريبي (وضع التطوير): <span dir="ltr" className="font-mono text-sm">{demoCode}</span>
            </p>
          )}

          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button
              onClick={() => requestCode(channel)}
              disabled={sending || resendLeft > 0}
              className="font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "جاري الإرسال..." : "🔄 إعادة إرسال الرمز"}
            </button>
            {resendLeft > 0 && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-black text-slate-600" dir="ltr">
                {formatMMSS(resendLeft)}
              </span>
            )}
          </div>
          {channel === "email" && (
            <p className="mt-1 text-center text-[11px] text-slate-400">
              📧 تحقق من البريد الوارد والرسائل المزعجة — يمكنك إعادة الإرسال بعد العداد (01:00)
            </p>
          )}

          <div className="my-3 flex items-center gap-2 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" /> أو <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button onClick={() => setShowAlt(!showAlt)} className="btn-ghost w-full !py-2.5 text-sm">
            🔀 جرب طريقة أخرى
          </button>
          {showAlt && (
            <div className="mt-2 grid gap-2">
              {(Object.keys(CHANNEL_META) as Channel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => switchChannel(ch)}
                  disabled={sending}
                  className={`flex items-center justify-between rounded-xl border-2 p-3 text-sm font-bold transition ${
                    channel === ch ? "border-emerald-600 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span>
                    {CHANNEL_META[ch].icon} {CHANNEL_META[ch].label}
                    <span className="block text-[11px] font-normal text-slate-400">{CHANNEL_META[ch].desc}</span>
                  </span>
                  {channel === ch && <span className="text-xs text-emerald-700">الحالية ✓</span>}
                </button>
              ))}
              <p className="text-center text-[11px] text-slate-400">اختيار قناة أخرى يرسل رمزاً جديداً فوراً (يخضع لمهلة 60 ثانية)</p>
            </div>
          )}
        </>
      )}

      {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-600">{error}</div>}
      {info && !error && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">{info}</div>
      )}
    </div>
  );
}
