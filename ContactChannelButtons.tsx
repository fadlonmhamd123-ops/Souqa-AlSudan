"use client";
import { ChannelIcon } from "./ContactIcons";
import type { PublicChannel } from "@/lib/contact-channels";

export function channelCardStyle(channel: string): string {
  if (channel === "whatsapp") {
    return "bg-gradient-to-br from-[#128C4B] to-[#25D366] text-white shadow-[0_10px_30px_rgba(37,211,102,0.35)]";
  }
  return "bg-gradient-to-br from-[#006AFF] via-[#4A6CF7] to-[#A855F7] text-white shadow-[0_10px_30px_rgba(74,108,247,0.35)]";
}

export function channelSoftStyle(channel: string): string {
  if (channel === "whatsapp") return "bg-[#E7F8EF] text-[#0E7A3D] border-[#BDE8CD]";
  return "bg-[#EBF0FF] text-[#2547C9] border-[#C7D5FF]";
}

export function channelNameAr(channel: string): string {
  return channel === "whatsapp" ? "واتساب WhatsApp" : "ماسنجر Messenger";
}

/** Big prominent one-click chat card */
export function ContactChannelCard({
  ch,
  compact = false,
}: {
  ch: PublicChannel;
  compact?: boolean;
}) {
  return (
    <a
      href={ch.goUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block overflow-hidden rounded-3xl ${channelCardStyle(ch.channel)} transition hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98]`}
    >
      <div className={`flex items-center gap-4 ${compact ? "p-4" : "p-5"}`}>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur transition group-hover:scale-110">
          <ChannelIcon channel={ch.channel} size={30} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black leading-tight">
            {ch.label || channelNameAr(ch.channel)}
          </span>
          {ch.ownerLabel && (
            <span className="block truncate text-xs font-bold text-white/80">{ch.ownerLabel}</span>
          )}
          <span className="mt-0.5 block font-mono text-xs text-white/85" dir="ltr">
            {ch.displayMasked || ""}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-900 shadow transition group-hover:bg-emerald-50">
          💬 محادثة
        </span>
      </div>
      {!compact && (
        <div className="bg-black/10 px-5 py-2 text-center text-[11px] font-bold text-white/90">
          نقرة واحدة تفتح المحادثة مباشرة 🚀 • رقمك يظهر للطرف الآخر فقط داخل المحادثة
        </div>
      )}
    </a>
  );
}

/** Small pill button (for lists / orders / floating widget) */
export function ContactChannelPill({
  ch,
  orderId,
}: {
  ch: PublicChannel;
  orderId?: string;
}) {
  const href = orderId ? `${ch.goUrl}${ch.goUrl.includes("?") ? "&" : "?"}orderId=${orderId}` : ch.goUrl;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-black transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95 ${channelSoftStyle(ch.channel)}`}
    >
      <ChannelIcon channel={ch.channel} size={18} />
      {ch.channel === "whatsapp" ? "واتساب" : "ماسنجر"}
      {ch.displayMasked && (
        <span className="font-mono text-[11px] font-bold opacity-70" dir="ltr">
          {ch.displayMasked}
        </span>
      )}
    </a>
  );
}
