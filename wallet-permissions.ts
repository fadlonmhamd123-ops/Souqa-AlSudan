import { db } from "@/db";
import { merchantProfiles, kycDocuments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Role } from "./auth";

/**
 * صلاحيات محافظ متجرك — Backend-Authoritative.
 * BUYER / MERCHANT / PLATFORM(ADMIN) حسب مواصفات النظام المالي.
 */

export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED";

export type WalletAction =
  | "view_own_balance"
  | "deposit_own"
  | "pay_order"
  | "receive_refund"
  | "transfer_direct"
  | "edit_balance"
  | "view_profits"
  | "receive_settlement"
  | "request_withdrawal"
  | "view_commission_due"
  | "clear_due_manual"
  | "collect_commission"
  | "settle_due_auto"
  | "approve_withdrawal"
  | "platform_withdraw";

export interface PermissionDecision {
  allowed: boolean;
  reasonAr: string;
  reasonEn: string;
}

const ALLOW = (ar: string, en: string): PermissionDecision => ({ allowed: true, reasonAr: ar, reasonEn: en });
const DENY = (ar: string, en: string): PermissionDecision => ({ allowed: false, reasonAr: ar, reasonEn: en });

function isAdminRole(role: Role | string): boolean {
  return role === "admin" || role === "super_admin";
}

/** حالة توثيق التاجر: VERIFIED فقط إذا isVerified=true، وإلا PENDING (أو REJECTED عند رفض كل المستندات). */
export async function getMerchantKycStatus(userId: string): Promise<KycStatus> {
  try {
    const m = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId)).limit(1);
    if (m.length > 0 && m[0].isVerified) return "VERIFIED";
    const docs = await db.select().from(kycDocuments).where(eq(kycDocuments.userId, userId)).limit(10);
    if (docs.length > 0) {
      if (docs.some((d) => d.status === "approved" || d.status === "verified")) return "VERIFIED";
      if (docs.every((d) => d.status === "rejected")) return "REJECTED";
    }
    return "PENDING";
  } catch {
    return "PENDING";
  }
}

export interface WalletActor {
  id: string;
  role: Role | string;
  kycStatus?: KycStatus | null;
}

/**
 * القرار المركزي للصلاحيات — يُستدعى من كل API مالي قبل أي عملية.
 * القواعد:
 * - الزبون: عرض رصيده فقط + إيداع + دفع طلبات + استلام مستردات. ممنوع: تحويل مباشر دون طلب رسمي، تعديل الأرصدة.
 * - التاجر: تُقيد الميزات الحساسة عند KYC=PENDING (لا سحب). بعد التوثيق: عرض الأرباح/الأرصدة/المبيعات + استقبال 95% + طلب سحب + رؤية commission_due. ممنوع: تعديل الأرصدة أو مسح الديون يدوياً.
 * - الإدمن/المنصة: تحصيل العمولات + اقتطاع المستحقات تلقائياً + اعتماد السحوبات + سحب أرباح المنصة للبنك بقيد مزدوج وتدقيق.
 */
export function decideWalletAction(actor: WalletActor, action: WalletAction): PermissionDecision {
  const role = actor.role;
  const admin = isAdminRole(role);
  const kyc = actor.kycStatus || null;

  // super_admin يتجاوز كل القيود التشغيلية (مع بقاء التدقيق الإلزامي في APIs)
  if (role === "super_admin") {
    if (action === "edit_balance" || action === "clear_due_manual" || action === "transfer_direct") {
      return DENY(
        "ممنوع تعديل الأرصدة أو مسح الديون يدوياً حتى للإدارة — عبر القيود المحاسبية فقط",
        "Manual balance edits are forbidden — ledger entries only"
      );
    }
    return ALLOW("مسموح للمشرف العام", "Allowed for super admin");
  }

  switch (action) {
    // ---------- مشترك: عرض الرصيد الخاص فقط ----------
    case "view_own_balance":
      return ALLOW("عرض رصيدك الخاص", "View own balance");

    // ---------- الزبون ----------
    case "deposit_own":
      if (role === "buyer" || role === "merchant" || admin) {
        return ALLOW("الإيداع في محفظتك الخاصة", "Deposit to own wallet");
      }
      return DENY("الإيداع متاح لأصحاب المحافظ فقط", "Deposit for wallet owners only");

    case "pay_order":
      if (role === "buyer" || admin) {
        return ALLOW("دفع قيمة الطلبات عبر التطبيق", "Pay for orders");
      }
      return DENY("دفع الطلبات للزبائن فقط", "Order payment for buyers only");

    case "receive_refund":
      if (role === "buyer" || admin) {
        return ALLOW("استلام المبالغ المستردة عند الإلغاء", "Receive refunds");
      }
      return DENY("المستردات للزبائن فقط", "Refunds for buyers only");

    case "transfer_direct":
      // ممنوع على الزبون (والجميع) بدون طلب بيع رسمي — يُفرض في API التحويل بطلب orderId صالح
      return DENY(
        "⛔ التحويل المباشر للتجار ممنوع دون طلب بيع رسمي — أنشئ طلباً أولاً",
        "Direct transfers forbidden without an official sales order"
      );

    case "edit_balance":
      return DENY(
        "⛔ تعديل الأرصدة مباشرة من الواجهة ممنوع منعاً باتاً — كل الحركات عبر الخادم بقيد مزدوج",
        "Direct balance edits are strictly forbidden — server-side double-entry only"
      );

    // ---------- التاجر ----------
    case "view_profits":
    case "view_commission_due":
      if (role === "merchant" || admin) {
        return ALLOW("عرض الأرباح والأرصدة والعمولات المستحقة", "View profits and dues");
      }
      return DENY("هذه البيانات للتجار فقط", "Merchant data only");

    case "receive_settlement":
      if (role === "merchant" || admin) {
        return ALLOW("استقبال صافي المبيعات (95%) بعد العمولة", "Receive 95% net settlement");
      }
      return DENY("تسويات المبيعات للتجار فقط", "Settlements for merchants only");

    case "request_withdrawal":
      if (admin) return ALLOW("الإدارة تعتمد السحوبات", "Admin approves withdrawals");
      if (role !== "merchant") return DENY("طلبات السحب للتجار فقط", "Withdrawals for merchants only");
      if (kyc === "PENDING" || kyc === null) {
        return DENY(
          "🔒 ميزات السحب مقيدة — أكمل توثيق الهوية (KYC) أولاً لتفعيل السحب",
          "Withdrawals locked — complete KYC verification first"
        );
      }
      if (kyc === "REJECTED") {
        return DENY("❌ تم رفض مستندات التوثيق — تواصل مع الدعم", "KYC rejected — contact support");
      }
      return ALLOW("طلب سحب الأرباح المتاحة", "Request profit withdrawal");

    case "clear_due_manual":
      return DENY(
        "⛔ ممنوع مسح الديون والعمولات المستحقة يدوياً — تُخصم تلقائياً من الإيداعات والتسويات",
        "Manual due clearance forbidden — auto-deducted from deposits/settlements"
      );

    // ---------- المنصة / الإدمن ----------
    case "collect_commission":
    case "settle_due_auto":
      if (admin) return ALLOW("تحصيل واقتطاع تلقائي للعمولات", "Auto commission collection");
      // النظام الداخلي (system) ينفذها تلقائياً — لا يطلبها المستخدم مباشرة
      return DENY("التحصيل التلقائي يتم من النظام فقط", "System auto-collection only");

    case "approve_withdrawal":
    case "platform_withdraw":
      if (admin) return ALLOW("إجراء إداري معتمد", "Authorized admin action");
      return DENY("هذا الإجراء للإدارة فقط", "Admin only");

    default:
      return DENY("إجراء غير معروف", "Unknown action");
  }
}

/** هل الدور مسموح له برؤية محفظة مالك معين؟ (الزبون/التاجر: محفظته فقط) */
export function canViewWalletOf(
  actor: WalletActor,
  targetOwnerId: string,
  targetOwnerType: string
): PermissionDecision {
  if (isAdminRole(actor.role)) return ALLOW("الإدارة تراجع كل المحافظ", "Admin wallet oversight");
  const ownType = actor.role === "merchant" ? "merchant" : "buyer";
  if (targetOwnerId === actor.id && targetOwnerType.toLowerCase() === ownType) {
    return ALLOW("محفظتك الخاصة", "Own wallet");
  }
  return DENY("⛔ لا يمكنك عرض محافظ الآخرين — محفظتك فقط", "You can only view your own wallet");
}

/** رفض أي محاولة تمرير أرصدة من العميل (Frontend) — Backend-Authoritative. */
const FORBIDDEN_BALANCE_KEYS = [
  "availablebalance",
  "available_balance",
  "pendingbalance",
  "pending_balance",
  "lockedbalance",
  "locked_balance",
  "balance",
  "commissiondue",
  "commission_due",
];

export function detectForbiddenBalanceKeys(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const found: string[] = [];
  for (const k of Object.keys(body as Record<string, unknown>)) {
    if (FORBIDDEN_BALANCE_KEYS.includes(k.toLowerCase())) found.push(k);
  }
  return found;
}

/** ملخص صلاحيات الدور للواجهة (عرض فقط — الفرض الحقيقي في الخادم). */
export function permissionsSummary(role: string, kyc: KycStatus | null): Record<WalletAction, boolean> {
  const actor: WalletActor = { id: "", role, kycStatus: kyc };
  const actions: WalletAction[] = [
    "view_own_balance",
    "deposit_own",
    "pay_order",
    "receive_refund",
    "transfer_direct",
    "edit_balance",
    "view_profits",
    "receive_settlement",
    "request_withdrawal",
    "view_commission_due",
    "clear_due_manual",
    "collect_commission",
    "settle_due_auto",
    "approve_withdrawal",
    "platform_withdraw",
  ];
  const out = {} as Record<WalletAction, boolean>;
  for (const a of actions) out[a] = decideWalletAction(actor, a).allowed;
  return out;
}
