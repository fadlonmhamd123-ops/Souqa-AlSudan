import { createHmac, timingSafeEqual } from "crypto";

/* ============ Payment Gateways Registry (Sudan local) ============ */

export type GatewayProvider = "bankak" | "ocash" | "fawry" | "ebs";
export type PaymentPurpose = "wallet_topup" | "order_payment";

export interface GatewayInfo {
  id: GatewayProvider;
  nameAr: string;
  nameEn: string;
  icon: string;
  color: string;
  accountLabel: string;
  instructionsAr: string[];
  supportsInstantCallback: boolean;
}

export const GATEWAYS: GatewayInfo[] = [
  {
    id: "bankak",
    nameAr: "بنكك",
    nameEn: "Bankak",
    icon: "📱",
    color: "#c81e1e",
    accountLabel: "حساب متجرك في بنك الخرطوم",
    instructionsAr: [
      "افتح تطبيق بنكك واختر (تحويل).",
      "حوّل المبلغ إلى حساب متجرك التجاري.",
      "اكتب رقم المرجع في حقل التعليق.",
      "سيتم تأكيد الدفع تلقائياً خلال ثوانٍ.",
    ],
    supportsInstantCallback: true,
  },
  {
    id: "ocash",
    nameAr: "أو كاش",
    nameEn: "O-Cash",
    icon: "💳",
    color: "#1d4ed8",
    accountLabel: "محفظة متجرك — أوكاش",
    instructionsAr: [
      "افتح تطبيق أوكاش واختر (دفع فواتير).",
      "اختر (متجرك) وأدخل رقم المرجع.",
      "أكّد المبلغ وستصلك رسالة نجاح.",
    ],
    supportsInstantCallback: true,
  },
  {
    id: "fawry",
    nameAr: "فوري",
    nameEn: "Fawry",
    icon: "🏦",
    color: "#b45309",
    accountLabel: "قناة متجرك — فوري",
    instructionsAr: [
      "من تطبيق فوري اختر (تسوق إلكتروني).",
      "أدخل رقم المرجع الظاهر أمامك.",
      "أكمل الدفع بكلمة المرور.",
    ],
    supportsInstantCallback: true,
  },
  {
    id: "ebs",
    nameAr: "EBS الموحدة",
    nameEn: "EBS",
    icon: "🌐",
    color: "#047857",
    accountLabel: "بوابة EBS الوطنية",
    instructionsAr: [
      "اختر EBS من أي تطبيق بنكي سوداني.",
      "أدخل رقم الفاتورة (رقم المرجع).",
      "سيتم إشعار متجرك آلياً عبر EBS.",
    ],
    supportsInstantCallback: true,
  },
];

export function isSupportedProvider(p: string): p is GatewayProvider {
  return (["bankak", "ocash", "fawry", "ebs"] as string[]).includes(p);
}

export function getGateway(id: string): GatewayInfo | undefined {
  return GATEWAYS.find((g) => g.id === id);
}

export function gatewayLabel(id: string): string {
  const g = getGateway(id);
  return g ? `${g.nameAr} ${g.icon}` : id;
}

/* ============ Webhook signature (HMAC-SHA256, backend authoritative) ============ */

function secretFor(provider: string): string {
  const upper = provider.toUpperCase();
  return (
    process.env[`${upper}_WEBHOOK_SECRET`] ||
    process.env.PAYMENT_WEBHOOK_SECRET ||
    "matjarak-dev-webhook-secret-change-in-production"
  );
}

export function signWebhookPayload(provider: string, rawBody: string): string {
  return createHmac("sha256", secretFor(provider)).update(rawBody, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  provider: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const sig = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = signWebhookPayload(provider, rawBody);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isMockPaymentsEnabled(): boolean {
  if (process.env.PAYMENTS_MOCK_MODE === "1") return true;
  if (process.env.PAYMENTS_MOCK_MODE === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export function generatePaymentReference(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const year = new Date().getFullYear();
  return `PAY-${year}-${rand}`;
}

export interface WebhookPayload {
  reference: string;
  amount: string | number;
  currency?: string;
  status: string;
  providerRef?: string;
  eventId?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}

export function normalizeWebhookStatus(s: string): "succeeded" | "failed" | "unknown" {
  const v = String(s || "").toLowerCase().trim();
  if (["success", "succeeded", "paid", "completed", "ok", "approved"].includes(v)) return "succeeded";
  if (["failed", "failure", "declined", "rejected", "cancelled", "canceled", "error"].includes(v)) return "failed";
  return "unknown";
}

export function amountsEqual(a: string | number, b: string | number): boolean {
  const na = Math.round(Number(a) * 100);
  const nb = Math.round(Number(b) * 100);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return na === nb;
}
