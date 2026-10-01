import { db } from "@/db";
import { wallets, ledgerAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Platform / Admin Wallet — الهوية الرسمية للمنصة داخل النظام المالي.
 * owner_type = "PLATFORM" | owner_id = "SYSTEM_ADMIN_WALLET" | currency = "SDG" | status = "ACTIVE"
 */
export const PLATFORM_OWNER_TYPE = "PLATFORM";
export const PLATFORM_OWNER_ID = "SYSTEM_ADMIN_WALLET";
export const PLATFORM_CURRENCY = "SDG";
export const PLATFORM_WALLET_STATUS = "ACTIVE";

export const PLATFORM_COMMISSION_ACCOUNT_TYPE = "PLATFORM_COMMISSION";
export const PLATFORM_COMMISSION_ACCOUNT_CODE = "PLATFORM-COMMISSION-SDG";

// Legacy identifiers (pre-migration) — kept for backward-compatible migration only.
const LEGACY_PLATFORM_OWNER_ID = "00000000-0000-0000-0000-000000000001";
const LEGACY_PLATFORM_OWNER_TYPE = "platform";

export interface PlatformWalletInfo {
  id: string;
  ownerId: string;
  ownerType: string;
  currency: string;
  status: string;
  availableBalance: string;
  pendingBalance: string;
  lockedBalance: string;
  commissionAccountCode: string;
  commissionAccountType: string;
}

function toStr(v: unknown): string {
  return String(v ?? "0");
}

/**
 * إنشاء محفظة المنصة عند تهيئة النظام (idempotent).
 * - wallets: PLATFORM / SYSTEM_ADMIN_WALLET / SDG / ACTIVE / 0,0,0
 * - ledger: حساب PLATFORM_COMMISSION مخصص للعمولات الإدارية
 * - يرحّل أي رصيد من المحفظة القديمة (UUID) إلى الجديدة تلقائياً.
 */
export async function ensurePlatformWallet(): Promise<PlatformWalletInfo> {
  // 1) Migrate legacy platform wallet if present
  const legacy = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.ownerId, LEGACY_PLATFORM_OWNER_ID),
        eq(wallets.ownerType, LEGACY_PLATFORM_OWNER_TYPE),
        eq(wallets.currency, PLATFORM_CURRENCY)
      )
    )
    .limit(1);

  let wallet = (
    await db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.ownerId, PLATFORM_OWNER_ID),
          eq(wallets.ownerType, PLATFORM_OWNER_TYPE),
          eq(wallets.currency, PLATFORM_CURRENCY)
        )
      )
      .limit(1)
  )[0];

  if (!wallet) {
    if (legacy.length > 0) {
      // Migrate legacy row to canonical identity (preserve balances)
      const migrated = await db
        .update(wallets)
        .set({
          ownerId: PLATFORM_OWNER_ID,
          ownerType: PLATFORM_OWNER_TYPE,
          status: PLATFORM_WALLET_STATUS,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, legacy[0].id))
        .returning();
      wallet = migrated[0];
    } else {
      const inserted = await db
        .insert(wallets)
        .values({
          ownerId: PLATFORM_OWNER_ID,
          ownerType: PLATFORM_OWNER_TYPE,
          currency: PLATFORM_CURRENCY,
          status: PLATFORM_WALLET_STATUS,
          availableBalance: "0",
          pendingBalance: "0",
          lockedBalance: "0",
        })
        .returning();
      wallet = inserted[0];
    }
  } else {
    // Ensure status canonical
    if ((wallet as { status?: string }).status !== PLATFORM_WALLET_STATUS) {
      const updated = await db
        .update(wallets)
        .set({ status: PLATFORM_WALLET_STATUS, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id))
        .returning();
      wallet = updated[0];
    }
    // If both legacy and canonical exist, merge legacy balances into canonical then zero legacy
    if (legacy.length > 0 && legacy[0].id !== wallet.id) {
      const la = Number(legacy[0].availableBalance || 0);
      const lp = Number(legacy[0].pendingBalance || 0);
      const ll = Number(legacy[0].lockedBalance || 0);
      if (la !== 0 || lp !== 0 || ll !== 0) {
        const na = (Number(wallet.availableBalance || 0) + la).toFixed(2);
        const np = (Number(wallet.pendingBalance || 0) + lp).toFixed(2);
        const nl = (Number(wallet.lockedBalance || 0) + ll).toFixed(2);
        const updated = await db
          .update(wallets)
          .set({ availableBalance: na, pendingBalance: np, lockedBalance: nl, updatedAt: new Date() })
          .where(eq(wallets.id, wallet.id))
          .returning();
        wallet = updated[0];
        await db
          .update(wallets)
          .set({ availableBalance: "0", pendingBalance: "0", lockedBalance: "0", updatedAt: new Date() })
          .where(eq(wallets.id, legacy[0].id));
      }
    }
  }

  // 2) Ensure PLATFORM_COMMISSION ledger account
  let commissionAcc = (
    await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, PLATFORM_COMMISSION_ACCOUNT_CODE)).limit(1)
  )[0];
  if (!commissionAcc) {
    // Migrate legacy platform ledger account if exists
    const legacyCode = `LA-PLATFORM-${LEGACY_PLATFORM_OWNER_ID.slice(0, 8)}-SDG`;
    const legacyAcc = (
      await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, legacyCode)).limit(1)
    )[0];
    if (legacyAcc) {
      const updated = await db
        .update(ledgerAccounts)
        .set({
          ownerId: PLATFORM_OWNER_ID,
          ownerType: PLATFORM_OWNER_TYPE,
          accountType: PLATFORM_COMMISSION_ACCOUNT_TYPE,
          code: PLATFORM_COMMISSION_ACCOUNT_CODE,
          name: "Platform Commission (5%)",
        })
        .where(eq(ledgerAccounts.id, legacyAcc.id))
        .returning();
      commissionAcc = updated[0];
    } else {
      const inserted = await db
        .insert(ledgerAccounts)
        .values({
          ownerId: PLATFORM_OWNER_ID,
          ownerType: PLATFORM_OWNER_TYPE,
          currency: PLATFORM_CURRENCY,
          accountType: PLATFORM_COMMISSION_ACCOUNT_TYPE,
          code: PLATFORM_COMMISSION_ACCOUNT_CODE,
          name: "Platform Commission (5%)",
          balance: "0",
        })
        .returning();
      commissionAcc = inserted[0];
    }
  } else if (commissionAcc.accountType !== PLATFORM_COMMISSION_ACCOUNT_TYPE) {
    const updated = await db
      .update(ledgerAccounts)
      .set({ accountType: PLATFORM_COMMISSION_ACCOUNT_TYPE })
      .where(eq(ledgerAccounts.id, commissionAcc.id))
      .returning();
    commissionAcc = updated[0];
  }

  return {
    id: wallet.id,
    ownerId: PLATFORM_OWNER_ID,
    ownerType: PLATFORM_OWNER_TYPE,
    currency: PLATFORM_CURRENCY,
    status: PLATFORM_WALLET_STATUS,
    availableBalance: toStr(wallet.availableBalance),
    pendingBalance: toStr(wallet.pendingBalance),
    lockedBalance: toStr(wallet.lockedBalance),
    commissionAccountCode: commissionAcc.code,
    commissionAccountType: commissionAcc.accountType,
  };
}

/** Normalize owner types: legacy "platform" -> canonical "PLATFORM". */
export function canonicalOwnerType(t: string): string {
  if (t.toLowerCase() === "platform") return PLATFORM_OWNER_TYPE;
  return t.toLowerCase();
}

/** Check if an owner pair refers to the platform wallet (legacy or canonical). */
export function isPlatformOwner(ownerId: string, ownerType: string): boolean {
  const ot = ownerType.toLowerCase();
  if (ot !== "platform") return false;
  return ownerId === PLATFORM_OWNER_ID || ownerId === LEGACY_PLATFORM_OWNER_ID;
}
