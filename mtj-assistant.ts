import { db } from "@/db";
import {
  users,
  orders,
  orderItems,
  orderNegotiations,
  orderTimeline,
  stores,
  products,
  withdrawals,
  contactChannels,
  merchantProfiles,
} from "@/db/schema";
import { eq, desc, or, ilike, sql } from "drizzle-orm";
import { getWallet } from "./finance";
import { PLATFORM_OWNER_ID, PLATFORM_OWNER_TYPE } from "./platform";
import { formatSDG } from "./money";
import type { Role } from "./auth";

/* =====================================================================
   MTJ AI Assistant — الوكيل المركزي لمنصة متجرك 🇸🇩
   Tool-Based: يجلب البيانات الحقيقية من الأنظمة الحالية دون تخمين،
   ويلتزم بالصلاحيات والخصوصية، ولا ينتحل صفة الإدارة أبداً.
   ===================================================================== */

export const ASSISTANT_NAME = "🤖 المساعد";
export const ASSISTANT_NAME_MERCHANT = "🤖 مساعد التاجر";

export type AssistantRole = Role | "guest";

export interface AssistantUser {
  id: string | null;
  name: string | null;
  role: AssistantRole;
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export type Intent =
  | "greeting"
  | "wallet_balance"
  | "order_status"
  | "order_list"
  | "negotiation_status"
  | "shipping_info"
  | "commission_info"
  | "withdrawal_status"
  | "product_search"
  | "payment_help"
  | "receipt_help"
  | "cancellation_help"
  | "inspection_help"
  | "friday_help"
  | "contact_human"
  | "fraud_report"
  | "dispute_help"
  | "fee_policy"
  | "identity_question"
  | "thanks"
  | "unknown";

export interface DetectedIntent {
  intent: Intent;
  confidence: number;
  orderRef: string | null;
  productQuery: string | null;
  dialectHits: string[];
  sentiment: "calm" | "neutral" | "upset" | "angry";
}

/* ---------------- Arabic + Sudanese dialect normalization ---------------- */

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function normalizeArabic(input: string): string {
  let t = (input || "").trim();
  t = t.replace(/[٠-٩]/g, (d) => AR_DIGITS[d] || d);
  t = t
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  t = t.replace(/[\u064B-\u0652]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/* Sudanese dialect lexicon -> normalized meaning hints */
const DIALECT_LEXICON: Array<{ words: string[]; label: string }> = [
  { words: ["داير", "دايره", "عايز", "عايزه", "دار", "دور"], label: "want" },
  { words: ["هسي", "هسع", "اسع", "اسي", "حسي"], label: "now" },
  { words: ["وين", "فين"], label: "where" },
  { words: ["شنو", "شنو"], label: "what" },
  { words: ["كيف", "كيفن"], label: "how" },
  { words: ["متين", "بتين"], label: "when" },
  { words: ["قروش", "قريشات", "جنيه", "جنيهات", "كاش"], label: "money" },
  { words: ["حقي", "حقتي", "بتاعي", "بتاعتي", "تابعني"], label: "mine" },
  { words: ["طلبيه", "طلبيات", "الاوردر"], label: "order" },
  { words: ["ياخ", "ياخي", "يا زول", "يا فرده"], label: "vocative" },
  { words: ["كدي", "كده"], label: "thus" },
  { words: ["مافي", "ماف", "ما في"], label: "not-exist" },
  { words: ["زابط", "ظابط", "تمام", "كويس"], label: "good" },
  { words: ["فصال", "مساومه", "مفاصله", "نقص", "نقصو"], label: "bargain" },
  { words: ["زول", "نفر", "جماعه"], label: "person" },
  { words: ["شديد", "بالحيل"], label: "very" },
  { words: ["جابو", "وصل", "جا"], label: "arrived" },
  { words: ["لسه", "لسع"], label: "still" },
  { words: ["بكره", "امس"], label: "time" },
  { words: ["رسل", "رسلو", "دز"], label: "send" },
];

export function detectDialect(normalized: string): string[] {
  const hits: string[] = [];
  for (const entry of DIALECT_LEXICON) {
    for (const w of entry.words) {
      if (normalized.includes(normalizeArabic(w))) {
        hits.push(entry.label);
        break;
      }
    }
  }
  return [...new Set(hits)];
}

function hasAny(t: string, words: string[]): boolean {
  return words.some((w) => t.includes(normalizeArabic(w)));
}

function extractOrderRef(raw: string): string | null {
  const m1 = raw.match(/ORD-[A-Z0-9-]{3,}/i);
  if (m1) return m1[0].toUpperCase();
  const m2 = raw.match(/MTJ-\d{4}-[A-Z0-9]{3,}/i);
  if (m2) return m2[0].toUpperCase();
  const m3 = raw.match(/تذكره\s*(?:رقم\s*)?([A-Z0-9-]{4,})/i);
  if (m3) return m3[1].toUpperCase();
  return null;
}

function detectSentiment(t: string): DetectedIntent["sentiment"] {
  if (
    hasAny(t, ["غاضب", "زعلان شديد", "قرف", "زهجت", "كرهت", "نصابين", "حراميه", "حسبي الله", "اشتكي", "شكوي", "بلاغ", "تهديد", "هدد"])
  )
    return "angry";
  if (hasAny(t, ["زعلان", "متضايق", "مستاء", "تاخر", "تاخير", "ما وصل", "لسه ما", "مشكله", "مشكلة", "خربان", "غلط"]))
    return "upset";
  if (hasAny(t, ["شكرا", "ممتاز", "تمام", "زابط", "كويس", "احسنت", "بارك الله", "تسلم"])) return "calm";
  return "neutral";
}

/* ---------------- Intent detection (Fusha + Sudanese) ---------------- */

export function detectIntent(rawMessage: string): DetectedIntent {
  const t = normalizeArabic(rawMessage);
  const dialectHits = detectDialect(t);
  const sentiment = detectSentiment(t);
  const orderRef = extractOrderRef(rawMessage);

  const score = (words: string[]): number => {
    let s = 0;
    for (const w of words) if (t.includes(normalizeArabic(w))) s += 1;
    return s;
  };

  // Identity (checked BEFORE escalation so "انت مدير؟" is answered honestly, not escalated)
  if (
    hasAny(t, [
      "من انت", "انت منو", "انت مين", "اسمك شنو", "ما اسمك", "هل انت ادمن", "انت ادمن",
      "انت مدير", "انت المدير", "انت روبوت", "انت ذكاء", "انت انسان", "انت بشر", "انت موظف",
    ])
  ) {
    return { intent: "identity_question", confidence: 0.95, orderRef, productQuery: null, dialectHits, sentiment };
  }

  // Human escalation (highest priority after identity)
  if (
    hasAny(t, [
      "موظف", "مدير", "بشر", "زول حقيقي", "انسان حقيقي", "اكلم حد", "اتكلم مع",
      "مسؤول", "دعم بشري", "تدخل بشري", "افتح تذكره", "تذكره دعم", "بلاغ",
      "ارفع شكوي", "اشتكي", "human", "agent", "support ticket",
    ])
  ) {
    return { intent: "contact_human", confidence: 0.95, orderRef, productQuery: null, dialectHits, sentiment };
  }

  // Fraud report
  if (
    hasAny(t, [
      "نصب", "احتيال", "غش", "حرامي", "سرقه", "سرق", "نصاب", "مزور", "تزوير",
      "خارج التطبيق", "برا التطبيق", "بره التطبيق", "حول لي", "حول خارج",
      "دفع خارج", "بنكك برا", "تهديد", "ابتزاز", "scam", "fraud",
    ])
  ) {
    return { intent: "fraud_report", confidence: 0.9, orderRef, productQuery: null, dialectHits, sentiment };
  }

  // Greeting
  if (/^(سلام|السلام|مرحبا|اهلا|صباح|مساء|هاي|هلا|ازيك|كيفك|عاملي|اخبارك)/.test(t) && t.length < 40) {
    return { intent: "greeting", confidence: 0.9, orderRef, productQuery: null, dialectHits, sentiment };
  }
  // Thanks
  if (hasAny(t, ["شكرا", "تسلم", "بارك الله", "جزاك الله", "ممتاز", "احسنت"]) && t.length < 40) {
    return { intent: "thanks", confidence: 0.9, orderRef, productQuery: null, dialectHits, sentiment };
  }

  const candidates: Array<{ intent: Intent; s: number; base: number }> = [
    {
      intent: "wallet_balance",
      s: score(["محفظه", "رصيد", "قروش", "رصيدي", "كم عندي", "شحن", "ايداع", "فلوس", "balance", "wallet", "حسابي المالي"]),
      base: 0.55,
    },
    {
      intent: "order_status",
      s: score(["طلب", "طلبيه", "اوردر", "وين طلب", "حاله الطلب", "تتبع", "وصل", "ما وصل", "order"]) + (orderRef ? 2 : 0),
      base: 0.55,
    },
    {
      intent: "order_list",
      s: score(["طلباتي", "مشترياتي", "طلباتي الاخيره", "كل الطلبات", "سجل الطلبات", "my orders"]),
      base: 0.6,
    },
    {
      intent: "negotiation_status",
      s: score(["تفاوض", "مفاوضه", "فصال", "مساومه", "عرض", "عرض سعر", "ساوم", "نقص السعر", "negotiat"]),
      base: 0.6,
    },
    {
      intent: "shipping_info",
      s: score(["شحن", "توصيل", "مندوب", "شركه شحن", "ولايه", "كم يوم", "متي يوصل", "متين يصل", "تاخير الشحن", "shipping", "delivery"]),
      base: 0.55,
    },
    {
      intent: "commission_info",
      s: score(["عموله", "نسبه", "خمسه في الميه", "5%", "مستحق", "خصم", "commission", "ارباحي", "صافي الربح"]),
      base: 0.6,
    },
    {
      intent: "withdrawal_status",
      s: score(["سحب", "سحبت", "سحوباتي", "طلب سحب", "ارباح", "تحويل ارباح", "withdraw"]),
      base: 0.6,
    },
    {
      intent: "payment_help",
      s: score(["دفع", "بنكك", "اوكاش", "فوري", "ebs", "بوابه", "محفظه الكترونيه", "فشل الدفع", "ما اندفع", "pay", "payment"]),
      base: 0.55,
    },
    {
      intent: "receipt_help",
      s: score(["ايصال", "فاتوره", "qr", "كيو ار", "تحقق", "رقم الايصال", "receipt", "invoice"]),
      base: 0.6,
    },
    {
      intent: "cancellation_help",
      s: score(["الغاء", "الغي", "استرجاع", "استرداد", "ارجاع", "مرتجع", "cancel", "refund"]),
      base: 0.6,
    },
    {
      intent: "inspection_help",
      s: score(["فحص", "مراجعه المنتج", "منتجي اترفض", "مرفوض", "قبول", "نشر منتج", "inspect"]),
      base: 0.6,
    },
    {
      intent: "friday_help",
      s: score(["جمعه", "وضع الجمعه", "صلاه", "المتجر قافل", "مقفل", "friday"]),
      base: 0.65,
    },
    {
      intent: "dispute_help",
      s: score(["نزاع", "خلاف", "مشكله مع التاجر", "مشكله مع الزبون", "التاجر ما رد", "الزبون ما", "dispute"]),
      base: 0.6,
    },
    {
      intent: "fee_policy",
      s: score(["سياسه", "شروط", "المهله", "غرامه", "3 ايام", "14 يوم", "قوانين", "policy", "terms"]),
      base: 0.55,
    },
    {
      intent: "product_search",
      s: score(["منتج", "ابحث", "دور لي", "عندكم", "سعر", "بكم", "اريد اشتري", "داير اشتري", "product", "price"]),
      base: 0.5,
    },
  ];

  candidates.sort((a, b) => b.s - a.s);
  const top = candidates[0];
  if (top.s >= 1) {
    let productQuery: string | null = null;
    if (top.intent === "product_search") {
      productQuery = rawMessage
        .replace(/داير|عايز|دار|ابحث|دور|عندكم|اريد|اشتري|منتج|سعر|بكم|عن|لي|لو سمحت|من فضلك/gi, " ")
        .replace(/[؟?!.،,]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || null;
    }
    return {
      intent: top.intent,
      confidence: Math.min(0.5 + top.s * 0.15 + top.base * 0.3, 0.92),
      orderRef,
      productQuery,
      dialectHits,
      sentiment,
    };
  }

  return { intent: "unknown", confidence: 0.3, orderRef, productQuery: null, dialectHits, sentiment };
}

/* ---------------- Privacy helpers ---------------- */

export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length < 7) return "***";
  const local = d.startsWith("249") ? "0" + d.slice(3) : d;
  return `${local.slice(0, 3)}***${local.slice(-4)}`;
}

export function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [u, dom] = email.split("@");
  if (!dom) return "***";
  return `${(u || "").slice(0, 2)}***@${dom}`;
}

export function maskName(name: string | null): string {
  if (!name) return "مستخدم";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2) + "***";
  return `${parts[0]} ${parts[1].slice(0, 1)}***`;
}

/* ---------------- Fraud / conflict signal scan ---------------- */

export interface RiskFlag {
  code: string;
  labelAr: string;
  severity: "low" | "medium" | "high" | "critical";
}

export function scanMessageRisk(raw: string): RiskFlag[] {
  const t = normalizeArabic(raw);
  const flags: RiskFlag[] = [];
  const push = (code: string, labelAr: string, severity: RiskFlag["severity"]) => {
    if (!flags.some((f) => f.code === code)) flags.push({ code, labelAr, severity });
  };
  if (hasAny(t, ["خارج التطبيق", "برا التطبيق", "بره التطبيق", "خارج المنصه", "برا المنصه"])) {
    push("OFF_PLATFORM", "طلب تعامل خارج المنصة", "high");
  }
  if (hasAny(t, ["حول لي بنكك", "حول بنكك", "ادفع برا", "دفع خارج"])) {
    push("OFF_PLATFORM_PAY", "طلب دفع خارج قنوات المنصة", "high");
  }
  if (hasAny(t, ["نصب", "احتيال", "حرامي", "نصاب", "سرق"])) {
    push("FRAUD_CLAIM", "ادعاء احتيال/سرقة", "critical");
  }
  if (hasAny(t, ["مزور", "تزوير", "ايصال مزور", "فاتوره مزوره"])) {
    push("FORGERY_CLAIM", "ادعاء تزوير", "critical");
  }
  if (hasAny(t, ["تهديد", "هدد", "ابتزاز", "اقتلك", "اضربك"])) {
    push("THREAT", "لغة تهديد", "critical");
  }
  if (hasAny(t, ["غش", "مغشوش", "مقلد", "تقليد", "اصلي ولا"])) {
    push("COUNTERFEIT_CONCERN", "اشتباه غش/تقليد منتج", "medium");
  }
  if (hasAny(t, ["منتج مختلف", "غير مطابق", "غير الوصف", "صوره غير", "الصوره غير الحقيقه"])) {
    push("MISMATCH_CLAIM", "ادعاء عدم مطابقة المنتج للوصف", "medium");
  }
  if (hasAny(t, ["رجع قروشي", "شال قروشي", "اكل حقي", "ما رجع"])) {
    push("MONEY_CLAIM", "نزاع مالي يتطلب مراجعة", "high");
  }
  return flags;
}

/* ---------------- Escalation decision ---------------- */

export interface EscalationDecision {
  shouldEscalate: boolean;
  autoCreate: boolean;
  severity: "normal" | "high" | "critical";
  reason: string;
}

export function decideEscalation(
  intent: Intent,
  sentiment: DetectedIntent["sentiment"],
  riskFlags: RiskFlag[],
  history: ChatHistoryItem[],
  rawMessage: string
): EscalationDecision {
  const t = normalizeArabic(rawMessage);
  const critical = riskFlags.some((f) => f.severity === "critical");
  const high = riskFlags.some((f) => f.severity === "high");

  // Explicit human request -> always escalate + auto create
  if (intent === "contact_human") {
    const sev = critical ? "critical" : high ? "high" : "normal";
    return {
      shouldEscalate: true,
      autoCreate: true,
      severity: sev,
      reason: "طلب صريح من المستخدم للتحدث مع فريق بشري",
    };
  }
  // Fraud report -> always escalate + auto create
  if (intent === "fraud_report" || critical) {
    return {
      shouldEscalate: true,
      autoCreate: true,
      severity: "critical",
      reason: "بلاغ احتيال/تهديد يتطلب تدخلاً بشرياً فورياً",
    };
  }
  // Repeated failure: 3+ consecutive unknowns
  const recentUser = history.filter((h) => h.role === "user").slice(-3);
  if (recentUser.length >= 3) {
    return {
      shouldEscalate: true,
      autoCreate: false,
      severity: "normal",
      reason: "تعثر متكرر في فهم الطلب — يُقترح التصعيد",
    };
  }
  // Angry + dispute/payment -> suggest escalation, auto-create on high risk
  if ((sentiment === "angry" || high) && (intent === "dispute_help" || intent === "payment_help" || intent === "order_status")) {
    return {
      shouldEscalate: true,
      autoCreate: high,
      severity: high ? "high" : "normal",
      reason: "مستخدم غاضب مع مؤشرات نزاع/دفع",
    };
  }
  void t;
  return { shouldEscalate: false, autoCreate: false, severity: "normal", reason: "" };
}

/* =====================================================================
   TOOLS — تقرأ من الأنظمة الحالية فقط، مع احترام الصلاحيات
   ===================================================================== */

export interface ToolResult {
  tool: string;
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  denied?: string;
}

function isAdmin(r: string): boolean {
  return r === "admin" || r === "super_admin";
}

export async function toolGetWallet(user: AssistantUser): Promise<ToolResult> {
  if (!user.id) {
    return { tool: "get_wallet", ok: false, summary: "guest", denied: "سجّل الدخول لعرض رصيد محفظتك." };
  }
  try {
    if (isAdmin(user.role)) {
      const w = await getWallet(PLATFORM_OWNER_ID, PLATFORM_OWNER_TYPE, "SDG");
      return {
        tool: "get_wallet",
        ok: true,
        summary: "platform",
        data: {
          available: String(w.availableBalance),
          pending: String(w.pendingBalance),
          locked: String(w.lockedBalance),
        },
      };
    }
    const ownerType = user.role === "merchant" ? "merchant" : "buyer";
    const w = await getWallet(user.id, ownerType, "SDG");
    let commissionDue: string | null = null;
    if (user.role === "merchant") {
      const m = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, user.id)).limit(1);
      commissionDue = m[0] ? String(m[0].commissionDue) : "0.00";
    }
    return {
      tool: "get_wallet",
      ok: true,
      summary: ownerType,
      data: {
        available: String(w.availableBalance),
        pending: String(w.pendingBalance),
        locked: String(w.lockedBalance),
        commissionDue,
      },
    };
  } catch {
    return { tool: "get_wallet", ok: false, summary: "error", denied: "تعذّر جلب رصيد المحفظة حالياً." };
  }
}

export async function toolGetOrders(
  user: AssistantUser,
  limit = 5
): Promise<ToolResult> {
  if (!user.id) {
    return { tool: "get_orders", ok: false, summary: "guest", denied: "سجّل الدخول لعرض طلباتك." };
  }
  try {
    let rows;
    if (isAdmin(user.role)) {
      rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
    } else if (user.role === "merchant") {
      rows = await db.select().from(orders).where(eq(orders.merchantId, user.id)).orderBy(desc(orders.createdAt)).limit(limit);
    } else {
      rows = await db.select().from(orders).where(eq(orders.buyerId, user.id)).orderBy(desc(orders.createdAt)).limit(limit);
    }
    return {
      tool: "get_orders",
      ok: true,
      summary: `${rows.length}`,
      data: {
        orders: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          total: String(o.total),
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          createdAt: o.createdAt,
        })),
      },
    };
  } catch {
    return { tool: "get_orders", ok: false, summary: "error", denied: "تعذّر جلب الطلبات حالياً." };
  }
}

export async function toolGetOrderDetail(
  user: AssistantUser,
  orderRef: string
): Promise<ToolResult> {
  if (!user.id) {
    return { tool: "get_order_detail", ok: false, summary: "guest", denied: "سجّل الدخول لعرض تفاصيل الطلب." };
  }
  try {
    const ref = orderRef.trim().toUpperCase();
    const rows = await db.select().from(orders).where(eq(orders.orderNumber, ref)).limit(1);
    if (!rows[0]) {
      return { tool: "get_order_detail", ok: false, summary: "not_found", denied: `لم أجد طلباً برقم ${ref} — تحقّق من الرقم.` };
    }
    const o = rows[0];
    const allowed = isAdmin(user.role) || o.buyerId === user.id || o.merchantId === user.id;
    if (!allowed) {
      return {
        tool: "get_order_detail",
        ok: false,
        summary: "forbidden",
        denied: "هذا الطلب لا يخصّك — لا يمكنني عرض تفاصيل طلبات الآخرين حفاظاً على الخصوصية.",
      };
    }
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).limit(10);
    const timeline = await db
      .select()
      .from(orderTimeline)
      .where(eq(orderTimeline.orderId, o.id))
      .orderBy(desc(orderTimeline.createdAt))
      .limit(5);
    const st = o.storeId
      ? (await db.select().from(stores).where(eq(stores.id, o.storeId)).limit(1))[0]
      : undefined;
    return {
      tool: "get_order_detail",
      ok: true,
      summary: o.status,
      data: {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        subtotal: String(o.subtotal),
        deliveryFee: String(o.deliveryFee),
        total: String(o.total),
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        storeName: st?.nameAr || null,
        deadlineAt: o.deadlineAt,
        items: items.map((i) => ({ title: i.title, qty: i.qty, price: String(i.agreedPrice || i.unitPrice) })),
        timeline: timeline.map((x) => ({ to: x.toStatus, note: x.note, at: x.createdAt })),
      },
    };
  } catch {
    return { tool: "get_order_detail", ok: false, summary: "error", denied: "تعذّر جلب تفاصيل الطلب حالياً." };
  }
}

export async function toolGetNegotiations(user: AssistantUser): Promise<ToolResult> {
  if (!user.id) {
    return { tool: "get_negotiations", ok: false, summary: "guest", denied: "سجّل الدخول لعرض مفاوضاتك." };
  }
  try {
    const rows = await db
      .select()
      .from(orderNegotiations)
      .where(
        user.role === "merchant"
          ? eq(orderNegotiations.merchantId, user.id)
          : eq(orderNegotiations.buyerId, user.id)
      )
      .orderBy(desc(orderNegotiations.updatedAt))
      .limit(5);
    return {
      tool: "get_negotiations",
      ok: true,
      summary: `${rows.length}`,
      data: {
        items: rows.map((n) => ({
          id: n.id,
          status: n.status,
          originalPrice: String(n.originalPrice),
          buyerOffer: n.buyerOffer ? String(n.buyerOffer) : null,
          merchantCounterOffer: n.merchantCounterOffer ? String(n.merchantCounterOffer) : null,
          agreedPrice: n.agreedPrice ? String(n.agreedPrice) : null,
        })),
      },
    };
  } catch {
    return { tool: "get_negotiations", ok: false, summary: "error", denied: "تعذّر جلب المفاوضات حالياً." };
  }
}

export async function toolGetWithdrawals(user: AssistantUser): Promise<ToolResult> {
  if (!user.id || user.role !== "merchant") {
    if (!user.id) return { tool: "get_withdrawals", ok: false, summary: "guest", denied: "سجّل الدخول أولاً." };
    return { tool: "get_withdrawals", ok: false, summary: "role", denied: "طلبات السحب خاصة بالتجار." };
  }
  try {
    const rows = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.merchantId, user.id))
      .orderBy(desc(withdrawals.createdAt))
      .limit(5);
    return {
      tool: "get_withdrawals",
      ok: true,
      summary: `${rows.length}`,
      data: { items: rows.map((w) => ({ amount: String(w.amount), status: w.status, method: w.method })) },
    };
  } catch {
    return { tool: "get_withdrawals", ok: false, summary: "error", denied: "تعذّر جلب السحوبات حالياً." };
  }
}

export async function toolGetPlatformChannels(): Promise<ToolResult> {
  try {
    const rows = await db
      .select()
      .from(contactChannels)
      .where(eq(contactChannels.ownerType, "platform"))
      .limit(10);
    const active = rows.filter((r) => r.isActive);
    return {
      tool: "get_platform_channels",
      ok: true,
      summary: `${active.length}`,
      data: {
        channels: active.map((r) => ({
          id: r.id,
          channel: r.channel,
          label: r.label,
          displayMasked: r.displayMasked,
          goUrl: `/api/contact-channels/go?id=${r.id}`,
        })),
      },
    };
  } catch {
    return { tool: "get_platform_channels", ok: true, summary: "fallback", data: { channels: [] } };
  }
}

export async function toolSearchProducts(query: string): Promise<ToolResult> {
  const q = (query || "").trim().slice(0, 60);
  if (!q || q.length < 2) {
    return { tool: "search_products", ok: false, summary: "empty", denied: "أخبرني باسم المنتج الذي تبحث عنه." };
  }
  try {
    const rows = await db
      .select()
      .from(products)
      .where(
        or(
          ilike(products.titleAr, `%${q}%`),
          ilike(products.descriptionAr, `%${q}%`),
          ilike(products.titleEn, `%${q}%`)
        )
      )
      .limit(5);
    return {
      tool: "search_products",
      ok: true,
      summary: `${rows.length}`,
      data: {
        items: rows.map((p) => ({
          id: p.id,
          title: p.titleAr,
          price: String(p.price),
          negotiable: p.isNegotiable,
          status: p.status,
        })),
      },
    };
  } catch {
    return { tool: "search_products", ok: false, summary: "error", denied: "تعذّر البحث حالياً." };
  }
}

export async function toolGetMerchantKyc(user: AssistantUser): Promise<ToolResult> {
  if (!user.id || user.role !== "merchant") {
    return { tool: "get_kyc", ok: false, summary: "role", denied: "التوثيق خاص بحسابات التجار." };
  }
  try {
    const m = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, user.id)).limit(1);
    const verified = !!m[0]?.isVerified;
    return { tool: "get_kyc", ok: true, summary: verified ? "VERIFIED" : "PENDING", data: { verified } };
  } catch {
    return { tool: "get_kyc", ok: false, summary: "error", denied: "تعذّر التحقق حالياً." };
  }
}

/* ---------------- Status labels ---------------- */

const ORDER_STATUS_AR: Record<string, string> = {
  PENDING: "بانتظار قبول التاجر",
  NEGOTIATING: "قيد التفاوض",
  ACCEPTED: "مقبول — قيد التجهيز",
  PROCESSING: "قيد التجهيز",
  READY_FOR_SHIPPING: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  OUT_FOR_DELIVERY: "خارج للتوصيل",
  DELIVERED: "تم التوصيل",
  RECEIVED: "تم الاستلام",
  COMPLETED: "مكتمل ✅",
  CANCELLED_BY_CUSTOMER: "ملغي من الزبون",
  CANCELLED_BY_MERCHANT: "ملغي من التاجر",
  MERCHANT_FAILED_TO_FULFILL: "تعذّر التنفيذ",
  DISPUTED: "متنازع عليه ⚠️",
};

export function orderStatusAr(s: string): string {
  return ORDER_STATUS_AR[s] || s;
}

/* ---------------- Suggested prompts ---------------- */

export const SUGGESTED_PROMPTS: Record<string, string[]> = {
  buyer: [
    "كم رصيد محفظتي؟",
    "وين طلبي؟",
    "عايز أتفاوض في السعر، كيف؟",
    "كيف أدفع ببنكك؟",
    "داير أتكلم مع موظف",
  ],
  merchant: [
    "كم أرباحي ورصيدي؟",
    "كم العمولة المستحقة علي؟",
    "كيف أسحب أرباحي؟",
    "منتجي اترفض في الفحص، ليه؟",
    "عايز أتكلم مع الدعم",
  ],
  guest: [
    "ما هي عمولة متجرك؟",
    "كم مهلة التوصيل بين الولايات؟",
    "كيف أشتري من المتجر؟",
    "كيف أتواصل واتساب؟",
  ],
};

export function promptsFor(role: string): string[] {
  if (role === "merchant") return SUGGESTED_PROMPTS.merchant;
  if (role === "admin" || role === "super_admin") return SUGGESTED_PROMPTS.merchant;
  if (role === "buyer") return SUGGESTED_PROMPTS.buyer;
  return SUGGESTED_PROMPTS.guest;
}

/* ---------------- Safe official-channel reply draft ---------------- */

export function draftChannelReply(params: {
  userName?: string | null;
  topic: string;
  statusLine?: string;
  needsHuman: boolean;
}): string {
  const name = params.userName ? `الأستاذ/ة ${params.userName}` : "عزيزنا العميل";
  const lines = [
    `السلام عليكم ${name}، معك ${ASSISTANT_NAME} من منصة متجرك 🇸🇩.`,
    ``,
    `بخصوص استفسارك (${params.topic}):`,
    params.statusLine || "تم استلام استفسارك ومراجعته.",
    ``,
  ];
  if (params.needsHuman) {
    lines.push(
      "قمتُ بتحويل طلبك إلى فريق الدعم البشري، وسيتواصل معك أحد الموظفين قريباً.",
      "رقم التذكرة سيصلك هنا لمتابعة الحالة."
    );
  } else {
    lines.push("هل يوجد شيء آخر يمكنني مساعدتك فيه؟");
  }
  lines.push("", "ملاحظة: حفاظاً على خصوصيتك، لا نشارك أي بيانات حساسة عبر المحادثات.");
  return lines.join("\n");
}

/* ---------------- Smart summary for admin ---------------- */

export function buildSmartSummary(params: {
  user: AssistantUser;
  messages: ChatHistoryItem[];
  intent: Intent;
  sentiment: string;
  riskFlags: RiskFlag[];
  toolsUsed: string[];
  toolFacts: string[];
  category: string;
  severity: string;
}): string {
  const lastUser = [...params.messages].reverse().find((m) => m.role === "user")?.content || "";
  const lines = [
    `📌 ملخص ذكي للتذكرة (أعده ${ASSISTANT_NAME}):`,
    `— المستخدم: ${params.user.name || "زائر"} (${params.user.role})`,
    `— التصنيف: ${params.category} | الخطورة: ${params.severity} | المشاعر: ${params.sentiment}`,
    `— القصد المكتشف: ${params.intent}`,
    `— الأدوات المستخدمة: ${params.toolsUsed.length ? params.toolsUsed.join("، ") : "لا يوجد"}`,
  ];
  if (params.toolFacts.length) {
    lines.push(`— حقائق من الأنظمة:`);
    for (const f of params.toolFacts.slice(0, 8)) lines.push(`   • ${f}`);
  }
  if (params.riskFlags.length) {
    lines.push(`— مؤشرات المخاطر:`);
    for (const f of params.riskFlags) lines.push(`   ⚠️ [${f.severity}] ${f.labelAr} (${f.code})`);
  }
  lines.push(`— آخر رسالة للمستخدم: "${lastUser.slice(0, 300)}"`);
  lines.push(
    `— الإجراء المقترح: ${
      params.severity === "critical"
        ? "تدخل بشري فوري + مراجعة سجل التدقيق والأمر المرتبط."
        : params.severity === "high"
          ? "مراجعة بشرية ذات أولوية والرد خلال ساعات العمل."
          : "رد بشري اعتيادي حسب الدور."
    }`
  );
  return lines.join("\n");
}

export function categorizeFromIntent(intent: Intent): string {
  if (intent === "fraud_report") return "fraud";
  if (intent === "dispute_help") return "dispute";
  if (intent === "payment_help") return "payment";
  if (intent === "wallet_balance" || intent === "withdrawal_status" || intent === "commission_info") return "wallet";
  if (intent === "order_status" || intent === "order_list" || intent === "cancellation_help") return "order";
  if (intent === "negotiation_status") return "negotiation";
  if (intent === "shipping_info") return "shipping";
  if (intent === "product_search" || intent === "inspection_help") return "product";
  return "general";
}

/* ---------------- Calming + fraud-warning snippets (Fusha) ---------------- */

export function calmingLine(sentiment: string): string | null {
  if (sentiment === "angry") {
    return "أتفهم غضبك تماماً، وحقك محفوظ لدينا — دعني أساعدك خطوة بخطوة حتى نصل إلى حلٍّ عادل.";
  }
  if (sentiment === "upset") {
    return "أنا آسف لسماع ذلك، لا تقلق — سنعالج الأمر معاً بهدوء.";
  }
  return null;
}

export function fraudWarningLine(flags: RiskFlag[]): string | null {
  if (!flags.length) return null;
  const off = flags.some((f) => f.code === "OFF_PLATFORM" || f.code === "OFF_PLATFORM_PAY");
  if (off) {
    return "⚠️ تنبيه مهم لحمايتك: أي دفعٍ أو اتفاقٍ خارج منصة متجرك يفقدك الحماية والضمان والحق في الاسترداد. أنصحك بشدة بإتمام كل التعاملات داخل المنصة فقط.";
  }
  const fraud = flags.some((f) => f.code === "FRAUD_CLAIM" || f.code === "FORGERY_CLAIM" || f.code === "THREAT");
  if (fraud) {
    return "⚠️ أخذتُ بلاغك بجدية تامة. سأوثّق كل التفاصيل وأحوّلها فوراً إلى فريق الدعم البشري للمراجعة العاجلة.";
  }
  return "⚠️ لاحظتُ مؤشراً يستحق الانتباه في رسالتك، وسأضعه في الاعتبار أثناء المساعدة.";
}

export function fmtMoney(v: string | number): string {
  try {
    return formatSDG(v, "ar");
  } catch {
    return `${v} ج.س`;
  }
}
