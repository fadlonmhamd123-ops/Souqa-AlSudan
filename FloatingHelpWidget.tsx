"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChannelIcon } from "./ContactIcons";
import type { PublicChannel } from "@/lib/contact-channels";

/** Global floating help bubble: one-click WhatsApp / Messenger / Help page */
export default function FloatingHelpWidget() {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<PublicChannel[]>([]);

  useEffect(() => {
    fetch("/api/contact-channels?scope=platform")
      .then((r) => r.json())
      .then((d) => setChannels(d.channels || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open ]);

  const wa = channels.find((c) => c.channel === "whatsapp");
  const ms = channels.find((c) => c.channel === "messenger");

  return (
    <div className="no-print fixed bottom-20 left-4 z-40 md:bottom-6" onClick={(e) => e.stopPropagation()}>
      {open && (
        <div className="mb-3 w-64 overflow-hidden rounded-3xl border bg-white shadow-2xl">
          <div className="bg-gradient-to-l from-emerald-700 to-emerald-600 p-3 text-white">
            <p className="font-black">💬 تحتاج مساعدة؟</p>
            <p className="text-[11px] text-white/80">تواصل مباشر بنقرة واحدة</p>
          </div>
          <div className="space-y-2 p-3">
            {wa && (
              <a
                href={wa.goUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl bg-[#E7F8EF] p-3 transition hover:bg-[#D6F2E3] active:scale-[0.98]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#25D366] text-white">
                  <ChannelIcon channel="whatsapp" size={22} />
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-800">واتساب الدعم</span>
                  <span className="block font-mono text-[11px] text-slate-500" dir="ltr">
                    {wa.displayMasked}
                  </span>
                </span>
              </a>
            )}
            {ms && (
              <a
                href={ms.goUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl bg-[#EBF0FF] p-3 transition hover:bg-[#DCE6FF] active:scale-[0.98]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#006AFF] to-[#A855F7] text-white">
                  <ChannelIcon channel="messenger" size={22} />
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-800">ماسنجر الدعم</span>
                  <span className="block font-mono text-[11px] text-slate-500" dir="ltr">
                    {ms.displayMasked}
                  </span>
                </span>
              </a>
            )}
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="block rounded-2xl bg-slate-100 p-3 text-center text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              📖 مركز المساعدة الكامل
            </Link>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-label="المساعدة والتواصل"
        className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 text-2xl text-white shadow-[0_10px_30px_rgba(0,135,81,0.45)] transition hover:scale-105 active:scale-95"
      >
        {open ? "✕" : "💬"}
        {!open && (
          <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-[11px] font-black ring-2 ring-white">
            ?
          </span>
        )}
      </button>
    </div>
  );
}
