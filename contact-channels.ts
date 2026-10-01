export type OwnerType = "platform" | "store" | "user";
export type ChannelType = "whatsapp" | "messenger";
export type Visibility = "public" | "order_only" | "private";

export interface PublicChannel {
  id: string;
  ownerType: string;
  ownerLabel: string | null;
  channel: ChannelType;
  label: string | null;
  displayMasked: string | null;
  isPrimary: boolean;
  /** Privacy-preserving one-click link (redirect, hides raw number from HTML) */
  goUrl: string;
  isMock?: boolean;
}

/** Normalize Sudanese WhatsApp to 249XXXXXXXXX digits */
export function normalizeWhatsApp(input: string): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, "");
  if (d.startsWith("00249")) d = d.slice(2);
  if (d.startsWith("249") && d.length === 12) return d;
  if (d.startsWith("0") && d.length === 10) return "249" + d.slice(1);
  if (d.length === 9 && /^[19]/.test(d)) return "249" + d;
  // allow already-international without leading 0
  if (d.length === 12 && d.startsWith("249")) return d;
  return null;
}

export function validateWhatsApp(input: string): { ok: boolean; normalized?: string; error?: string } {
  const n = normalizeWhatsApp(input);
  if (!n) {
    return {
      ok: false,
      error: "رقم الواتساب غير صالح — استخدم صيغة سودانية مثل 0912345678 أو 249912345678",
    };
  }
  if (!/^249[19]\d{8}$/.test(n)) {
    return {
      ok: false,
      error: "رقم الواتساب يجب أن يكون سودانياً (249 + 9 أرقام تبدأ بـ 9 أو 1)",
    };
  }
  return { ok: true, normalized: n };
}

/** Normalize messenger to https://m.me/username */
export function normalizeMessenger(input: string): string | null {
  if (!input) return null;
  const v = input.trim();
  // full URL
  const m1 = v.match(/(?:https?:\/\/)?(?:www\.)?(?:m\.me|messenger\.com|facebook\.com)\/([A-Za-z0-9._-]{3,})/i);
  if (m1) return `https://m.me/${m1[1]}`;
  // bare username
  const m2 = v.match(/^@?([A-Za-z0-9._-]{3,})$/);
  if (m2) return `https://m.me/${m2[1]}`;
  return null;
}

export function validateMessenger(input: string): { ok: boolean; normalized?: string; error?: string } {
  const n = normalizeMessenger(input);
  if (!n) {
    return {
      ok: false,
      error: "رابط الماسنجر غير صالح — استخدم اسم المستخدم أو رابط m.me",
    };
  }
  return { ok: true, normalized: n };
}

/** Mask phone for privacy: 249912345678 -> 091***45678 */
export function maskWhatsApp(digits249: string): string {
  const local = "0" + digits249.slice(3);
  if (local.length < 7) return local.slice(0, 3) + "***";
  return `${local.slice(0, 3)}***${local.slice(-5)}`;
}

export function maskMessenger(url: string): string {
  const m = url.match(/m\.me\/([A-Za-z0-9._-]+)/i);
  if (!m) return "m.me/***";
  const u = m[1];
  if (u.length <= 4) return "m.me/***";
  return `m.me/${u.slice(0, 2)}***${u.slice(-1)}`;
}

export function buildChatUrl(
  channel: ChannelType,
  value: string,
  prefill?: string
): string {
  if (channel === "whatsapp") {
    const base = `https://wa.me/${value}`;
    if (prefill) return `${base}?text=${encodeURIComponent(prefill)}`;
    return base;
  }
  return value;
}

export function defaultPrefillAr(ownerLabel?: string | null): string {
  return `مرحباً ${ownerLabel || "متجرك 🇸🇩"}، أحتاج مساعدة بخصوص طلبي/استفساري.`;
}

/** Mock platform channels so Help page never looks empty in preview */
export function mockPlatformChannels(): PublicChannel[] {
  return [
    {
      id: "mock-platform-whatsapp",
      ownerType: "platform",
      ownerLabel: "دعم متجرك 🇸🇩",
      channel: "whatsapp",
      label: "واتساب الدعم",
      displayMasked: "091***0000",
      isPrimary: true,
      goUrl: "https://wa.me/249900000000?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%20%D9%85%D8%AA%D8%AC%D8%B1%D9%83",
      isMock: true,
    },
    {
      id: "mock-platform-messenger",
      ownerType: "platform",
      ownerLabel: "دعم متجرك 🇸🇩",
      channel: "messenger",
      label: "ماسنجر الدعم",
      displayMasked: "m.me/ma***k",
      isPrimary: true,
      goUrl: "https://m.me/matjarak.sd",
      isMock: true,
    },
  ];
}
