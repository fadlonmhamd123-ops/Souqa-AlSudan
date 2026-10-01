import { db } from "@/db";
import {
  wallets,
  ledgerAccounts,
  ledgerEntries,
  transactions,
  commissions,
  orders,
  merchantProfiles,
  receipts,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { add, sub, mulRate, cmp, minOf } from "./money";
import { PLATFORM_COMMISSION_RATE } from "./constants";
import { PLATFORM_OWNER_ID, PLATFORM_OWNER_TYPE } from "./platform";
import { randomUUID, createHash } from "crypto";

export { PLATFORM_OWNER_ID, PLATFORM_OWNER_TYPE };

export async function getWallet(ownerId: string, ownerType: string, currency = "SDG") {
  const rows = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.ownerId, ownerId),
        eq(wallets.ownerType, ownerType),
        eq(wallets.currency, currency)
      )
    )
    .limit(1);
  if (rows.length === 0) {
    const ins = await db
      .insert(wallets)
      .values({ ownerId, ownerType, currency, availableBalance: "0", pendingBalance: "0", lockedBalance: "0" })
      .returning();
    return ins[0];
  }
  return rows[0];
}

async function getLedgerAccount(ownerId: string, ownerType: string) {
  const { PLATFORM_OWNER_ID: PID, PLATFORM_OWNER_TYPE: PTYPE, PLATFORM_COMMISSION_ACCOUNT_CODE, PLATFORM_COMMISSION_ACCOUNT_TYPE } = await import("./platform");
  // Canonical platform commission account
  if (ownerId === PID && ownerType.toLowerCase() === "platform") {
    const existing = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, PLATFORM_COMMISSION_ACCOUNT_CODE)).limit(1);
    if (existing.length > 0) return existing[0];
    const ins = await db
      .insert(ledgerAccounts)
      .values({
        ownerId: PID,
        ownerType: PTYPE,
        currency: "SDG",
        accountType: PLATFORM_COMMISSION_ACCOUNT_TYPE,
        code: PLATFORM_COMMISSION_ACCOUNT_CODE,
        name: "Platform Commission (5%)",
        balance: "0",
      })
      .returning();
    return ins[0];
  }
  const code = `LA-${ownerType.toUpperCase()}-${ownerId.slice(0, 8)}-SDG`;
  const rows = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, code)).limit(1);
  if (rows.length > 0) return rows[0];
  const ins = await db
    .insert(ledgerAccounts)
    .values({
      ownerId,
      ownerType,
      currency: "SDG",
      accountType: ownerType.toLowerCase() === "platform" ? "revenue" : "asset",
      code,
      name: `${ownerType} ${ownerId.slice(0, 8)}`,
      balance: "0",
    })
    .returning();
  return ins[0];
}

// Canonical platform identity imported at top (PLATFORM / SYSTEM_ADMIN_WALLET)
export async function ensurePlatformAccounts() {
  const { ensurePlatformWallet } = await import("./platform");
  await ensurePlatformWallet();
}

/** Double-entry ledger write (idempotent via idempotencyKey). */
export async function postLedgerEntry(opts: {
  debitOwnerId: string;
  debitOwnerType: string;
  creditOwnerId: string;
  creditOwnerType: string;
  amount: string;
  entryType: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const dup = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.idempotencyKey, opts.idempotencyKey))
    .limit(1);
  if (dup.length > 0) return false;
  const debitAcc = await getLedgerAccount(opts.debitOwnerId, opts.debitOwnerType);
  const creditAcc = await getLedgerAccount(opts.creditOwnerId, opts.creditOwnerType);
  await db.insert(ledgerEntries).values({
    debitAccountId: debitAcc.id,
    creditAccountId: creditAcc.id,
    amount: opts.amount,
    currency: "SDG",
    entryType: opts.entryType,
    description: opts.description,
    referenceType: opts.referenceType,
    referenceId: opts.referenceId,
    idempotencyKey: opts.idempotencyKey,
  });
  await db
    .update(ledgerAccounts)
    .set({ balance: add(debitAcc.balance, opts.amount) })
    .where(eq(ledgerAccounts.id, debitAcc.id));
  await db
    .update(ledgerAccounts)
    .set({ balance: add(creditAcc.balance, opts.amount) })
    .where(eq(ledgerAccounts.id, creditAcc.id));
  return true;
}

export async function creditWallet(
  ownerId: string,
  ownerType: string,
  amount: string,
  referenceType: string,
  referenceId: string | undefined,
  description: string,
  idempotencyKey: string
): Promise<string> {
  const dup = await db
    .select()
    .from(transactions)
    .where(eq(transactions.idempotencyKey, idempotencyKey))
    .limit(1);
  if (dup.length > 0) return dup[0].balanceAfter;
  const w = await getWallet(ownerId, ownerType);
  const after = add(w.availableBalance, amount);
  await db.update(wallets).set({ availableBalance: after, updatedAt: new Date() }).where(eq(wallets.id, w.id));
  await db.insert(transactions).values({
    walletId: w.id,
    type: "credit",
    amount,
    balanceAfter: after,
    referenceType,
    referenceId,
    description,
    idempotencyKey,
  });
  return after;
}

export async function debitWallet(
  ownerId: string,
  ownerType: string,
  amount: string,
  referenceType: string,
  referenceId: string | undefined,
  description: string,
  idempotencyKey: string
): Promise<string | null> {
  const dup = await db
    .select()
    .from(transactions)
    .where(eq(transactions.idempotencyKey, idempotencyKey))
    .limit(1);
  if (dup.length > 0) return dup[0].balanceAfter;
  const w = await getWallet(ownerId, ownerType);
  // Platform/KYC guard: only ACTIVE wallets can move funds
  const status = (w as { status?: string }).status;
  if (status && status !== "ACTIVE") return null;
  if (cmp(w.availableBalance, amount) < 0) return null;
  const after = sub(w.availableBalance, amount);
  await db.update(wallets).set({ availableBalance: after, updatedAt: new Date() }).where(eq(wallets.id, w.id));
  await db.insert(transactions).values({
    walletId: w.id,
    type: "debit",
    amount,
    balanceAfter: after,
    referenceType,
    referenceId,
    description,
    idempotencyKey,
  });
  return after;
}

/**
 * سحب أرباح المنصة إلى الحساب البنكي للإدارة (ADMIN ONLY).
 * Backend-authoritative: خصم من محفظة المنصة + قيد مزدوج + يُسجل في Audit من API.
 */
export async function platformWithdrawToBank(
  amount: string,
  bankRef: string,
  idempotencyKey: string
): Promise<{ ok: boolean; balanceAfter?: string; error?: string }> {
  await ensurePlatformAccounts();
  if (cmp(amount, "0") <= 0) return { ok: false, error: "المبلغ غير صالح" };
  const after = await debitWallet(
    PLATFORM_OWNER_ID,
    PLATFORM_OWNER_TYPE,
    amount,
    "platform_withdraw",
    undefined,
    `سحب أرباح المنصة إلى الحساب البنكي — ${bankRef}`,
    idempotencyKey
  );
  if (after === null) {
    return { ok: false, error: "رصيد محفظة المنصة غير كاف أو المحفظة غير نشطة" };
  }
  await postLedgerEntry({
    debitOwnerId: PLATFORM_OWNER_ID,
    debitOwnerType: PLATFORM_OWNER_TYPE,
    creditOwnerId: "BANK",
    creditOwnerType: "BANK",
    amount,
    entryType: "platform_withdraw",
    description: `Platform profit withdrawal to bank — ${bankRef}`,
    referenceType: "platform_withdraw",
    referenceId: undefined,
    idempotencyKey: `ledger-${idempotencyKey}`,
  });
  return { ok: true, balanceAfter: after };
}

/**
 * Settle commission_due FIRST before releasing funds (mandatory priority rule).
 * Returns the remaining amount after settling due.
 */
export async function settleCommissionDueFirst(
  merchantUserId: string,
  incomingAmount: string,
  orderId?: string
): Promise<{ settled: string; remaining: string }> {
  await ensurePlatformAccounts();
  const mrows = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, merchantUserId)).limit(1);
  const due = mrows.length > 0 ? String(mrows[0].commissionDue) : "0";
  if (cmp(due, "0") <= 0 || cmp(incomingAmount, "0") <= 0) {
    return { settled: "0", remaining: incomingAmount };
  }
  const toSettle = minOf(due, incomingAmount);
  const remaining = sub(incomingAmount, toSettle);
  if (mrows.length > 0) {
    await db
      .update(merchantProfiles)
      .set({ commissionDue: sub(due, toSettle) })
      .where(eq(merchantProfiles.userId, merchantUserId));
  }
  // Move settled part to platform wallet
  await creditWallet(
    PLATFORM_OWNER_ID,
    PLATFORM_OWNER_TYPE,
    toSettle,
    "commission_due_settlement",
    orderId,
    `تسوية عمولة مستحقة من التاجر ${merchantUserId.slice(0, 8)}`,
    `due-settle-${orderId || randomUUID()}-${Date.now()}`
  );
  await postLedgerEntry({
    debitOwnerId: merchantUserId,
    debitOwnerType: "merchant",
    creditOwnerId: PLATFORM_OWNER_ID,
    creditOwnerType: PLATFORM_OWNER_TYPE,
    amount: toSettle,
    entryType: "commission_due_settlement",
    description: "Commission due priority settlement",
    referenceType: "order",
    referenceId: orderId,
    idempotencyKey: `ledger-due-${orderId || randomUUID()}-${Date.now()}`,
  });
  return { settled: toSettle, remaining };
}

/**
 * Final settlement on COMPLETED/DELIVERED — idempotent via UNIQUE(order_id, commission_type).
 * - Electronic: deduct 5% auto, credit 95% merchant, 5% platform.
 * - Cash/External: deduct from wallet if sufficient else record commission_due.
 */
export async function settleOrderCommission(orderId: string): Promise<{
  ok: boolean;
  commission: string;
  merchantNet: string;
  method: string;
}> {
  await ensurePlatformAccounts();
  const orows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (orows.length === 0) throw new Error("Order not found");
  const order = orows[0];
  // Idempotency: check existing commission
  const existing = await db
    .select()
    .from(commissions)
    .where(and(eq(commissions.orderId, orderId), eq(commissions.commissionType, "standard")))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: true,
      commission: String(existing[0].amount),
      merchantNet: sub(String(order.subtotal), String(existing[0].amount)),
      method: "already_settled",
    };
  }
  const productValue = String(order.subtotal);
  const commission = mulRate(productValue, PLATFORM_COMMISSION_RATE);
  const merchantNet = sub(productValue, commission);
  const paymentMethod = order.paymentMethod;

  if (paymentMethod === "electronic" || paymentMethod === "wallet") {
    // Prepaid (gateway / wallet balance): funds held in PLATFORM escrow, distribute 95/5.
    // Settle due first from merchant net, then credit remainder
    const { remaining } = await settleCommissionDueFirst(order.merchantId, merchantNet, orderId);
    await creditWallet(
      order.merchantId,
      "merchant",
      remaining,
      "order_settlement",
      orderId,
      `تسوية طلب ${order.orderNumber} (صافي بعد العمولة)`,
      `settle-merchant-${orderId}`
    );
    await creditWallet(
      PLATFORM_OWNER_ID,
      PLATFORM_OWNER_TYPE,
      commission,
      "commission",
      orderId,
      `عمولة المنصة 5% طلب ${order.orderNumber}`,
      `settle-platform-${orderId}`
    );
    await postLedgerEntry({
      debitOwnerId: order.buyerId,
      debitOwnerType: "buyer",
      creditOwnerId: order.merchantId,
      creditOwnerType: "merchant",
      amount: merchantNet,
      entryType: "sale_settlement",
      description: `Order ${order.orderNumber} settlement`,
      referenceType: "order",
      referenceId: orderId,
      idempotencyKey: `ledger-sale-${orderId}`,
    });
    await postLedgerEntry({
      debitOwnerId: order.merchantId,
      debitOwnerType: "merchant",
      creditOwnerId: PLATFORM_OWNER_ID,
      creditOwnerType: PLATFORM_OWNER_TYPE,
      amount: commission,
      entryType: "commission",
      description: `5% commission order ${order.orderNumber}`,
      referenceType: "order",
      referenceId: orderId,
      idempotencyKey: `ledger-commission-${orderId}`,
    });
    await db.insert(commissions).values({
      orderId,
      merchantId: order.merchantId,
      productValue,
      rate: String(PLATFORM_COMMISSION_RATE),
      amount: commission,
      commissionType: "standard",
      status: "settled",
      settledAt: new Date(),
    });
  } else {
    // Cash / external: try wallet deduction, else commission_due
    const w = await getWallet(order.merchantId, "merchant");
    const available = String(w.availableBalance);
    if (cmp(available, commission) >= 0) {
      await debitWallet(
        order.merchantId,
        "merchant",
        commission,
        "commission",
        orderId,
        `عمولة المنصة 5% طلب ${order.orderNumber} (نقدي)`,
        `settle-cash-${orderId}`
      );
      await creditWallet(
        PLATFORM_OWNER_ID,
        PLATFORM_OWNER_TYPE,
        commission,
        "commission",
        orderId,
        `عمولة المنصة 5% طلب ${order.orderNumber}`,
        `settle-platform-${orderId}`
      );
      await db.insert(commissions).values({
        orderId,
        merchantId: order.merchantId,
        productValue,
        rate: String(PLATFORM_COMMISSION_RATE),
        amount: commission,
        commissionType: "standard",
        status: "settled",
        settledAt: new Date(),
      });
    } else {
      // Partial: deduct available, rest to commission_due
      if (cmp(available, "0") > 0) {
        await debitWallet(
          order.merchantId,
          "merchant",
          available,
          "commission_partial",
          orderId,
          `عمولة جزئية طلب ${order.orderNumber}`,
          `settle-partial-${orderId}`
        );
        await creditWallet(
          PLATFORM_OWNER_ID,
          PLATFORM_OWNER_TYPE,
          available,
          "commission",
          orderId,
          `عمولة جزئية طلب ${order.orderNumber}`,
          `settle-platform-partial-${orderId}`
        );
      }
      const rest = sub(commission, available);
      const mrows = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, order.merchantId)).limit(1);
      if (mrows.length > 0) {
        await db
          .update(merchantProfiles)
          .set({ commissionDue: add(String(mrows[0].commissionDue), rest) })
          .where(eq(merchantProfiles.userId, order.merchantId));
      }
      await db.insert(commissions).values({
        orderId,
        merchantId: order.merchantId,
        productValue,
        rate: String(PLATFORM_COMMISSION_RATE),
        amount: commission,
        commissionType: "standard",
        status: "due",
      });
    }
    await postLedgerEntry({
      debitOwnerId: order.merchantId,
      debitOwnerType: "merchant",
      creditOwnerId: PLATFORM_OWNER_ID,
      creditOwnerType: PLATFORM_OWNER_TYPE,
      amount: commission,
      entryType: "commission_cash",
      description: `5% commission (cash) order ${order.orderNumber}`,
      referenceType: "order",
      referenceId: orderId,
      idempotencyKey: `ledger-commission-${orderId}`,
    });
  }

  await db
    .update(orders)
    .set({ commissionAmount: commission, commissionSettled: true, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  return { ok: true, commission, merchantNet, method: paymentMethod };
}

/** 5% unjustified delay penalty — atomic idempotent ledger entry. */
export async function applyDelayPenalty(orderId: string): Promise<boolean> {
  const orows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (orows.length === 0) return false;
  const order = orows[0];
  if (order.penaltyApplied) return false;
  const existing = await db
    .select()
    .from(commissions)
    .where(and(eq(commissions.orderId, orderId), eq(commissions.commissionType, "delay_penalty")))
    .limit(1);
  if (existing.length > 0) return false;
  const penalty = mulRate(String(order.subtotal), 0.05);
  await ensurePlatformAccounts();
  const debited = await debitWallet(
    order.merchantId,
    "merchant",
    penalty,
    "delay_penalty",
    orderId,
    `غرامة تأخير 5% طلب ${order.orderNumber}`,
    `penalty-${orderId}`
  );
  if (debited === null) {
    const mrows = await db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, order.merchantId)).limit(1);
    if (mrows.length > 0) {
      await db
        .update(merchantProfiles)
        .set({ commissionDue: add(String(mrows[0].commissionDue), penalty) })
        .where(eq(merchantProfiles.userId, order.merchantId));
    }
  } else {
    await creditWallet(
      PLATFORM_OWNER_ID,
      PLATFORM_OWNER_TYPE,
      penalty,
      "delay_penalty",
      orderId,
      `غرامة تأخير طلب ${order.orderNumber}`,
      `penalty-platform-${orderId}`
    );
  }
  await postLedgerEntry({
    debitOwnerId: order.merchantId,
    debitOwnerType: "merchant",
    creditOwnerId: PLATFORM_OWNER_ID,
    creditOwnerType: PLATFORM_OWNER_TYPE,
    amount: penalty,
    entryType: "delay_penalty",
    description: `Delay penalty order ${order.orderNumber}`,
    referenceType: "order",
    referenceId: orderId,
    idempotencyKey: `ledger-penalty-${orderId}`,
  });
  await db.insert(commissions).values({
    orderId,
    merchantId: order.merchantId,
    productValue: String(order.subtotal),
    rate: "0.05",
    amount: penalty,
    commissionType: "delay_penalty",
    status: debited === null ? "due" : "settled",
    settledAt: debited === null ? null : new Date(),
  });
  await db.update(orders).set({ penaltyApplied: true, updatedAt: new Date() }).where(eq(orders.id, orderId));
  return true;
}

/** Generate official receipt with serial MTJ-YYYY-XXXXXX, token, hash. */
export async function generateReceipt(orderId: string, baseUrl: string) {
  const existing = await db.select().from(receipts).where(eq(receipts.orderId, orderId)).limit(1);
  if (existing.length > 0) return existing[0];
  const orows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (orows.length === 0) throw new Error("Order not found");
  const order = orows[0];
  const year = new Date().getFullYear();
  const rand = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  const serial = `MTJ-${year}-${rand}`;
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
  const payload = `${baseUrl}/verify/${serial}?t=${token}`;
  const hash = createHash("sha256")
    .update(`${serial}|${orderId}|${order.total}|${token}|${process.env.JWT_SECRET || "matjarak"}`)
    .digest("hex");
  const ins = await db
    .insert(receipts)
    .values({
      orderId,
      serialNumber: serial,
      verificationToken: token,
      receiptHash: hash,
      qrPayload: payload,
      receiptData: {
        orderNumber: order.orderNumber,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        commission: order.commissionAmount,
        paymentMethod: order.paymentMethod,
        buyerId: order.buyerId,
        storeId: order.storeId,
        completedAt: new Date().toISOString(),
      },
    })
    .returning();
  return ins[0];
}
// NOTE: PLATFORM_OWNER_ID / PLATFORM_OWNER_TYPE already exported at top via platform.ts
