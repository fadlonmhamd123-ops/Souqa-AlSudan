import { db } from "@/db";
import {
  paymentIntents,
  payments,
  orders,
  users,
  orderTimeline,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  creditWallet,
  postLedgerEntry,
  settleCommissionDueFirst,
  ensurePlatformAccounts,
  PLATFORM_OWNER_ID,
  PLATFORM_OWNER_TYPE,
} from "./finance";
import { cmp } from "./money";
import { audit } from "./auth";
import { gatewayLabel } from "./payments";

export interface IntentRow {
  id: string;
  reference: string;
  provider: string;
  purpose: string;
  userId: string;
  orderId: string | null;
  amount: string;
  currency: string;
  status: string;
  providerRef: string | null;
}

/**
 * Backend-authoritative settlement of a successful gateway payment.
 * Idempotent: safe to call multiple times for the same reference.
 * - wallet_topup: credits user wallet + double-entry (BANK -> user), settles merchant commission_due first.
 * - order_payment: marks order paid + ledger (BANK -> PLATFORM escrow) + payment row.
 */
export async function settleSuccessfulIntent(
  intent: IntentRow,
  providerRef: string
): Promise<{ ok: boolean; already?: boolean; credited?: string; settledDue?: string }> {
  await ensurePlatformAccounts();

  // Re-read fresh status for idempotency
  const fresh = (
    await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1)
  )[0];
  if (!fresh) return { ok: false };
  if (fresh.status === "succeeded") return { ok: true, already: true };

  const amount = String(fresh.amount);
  const bankOwnerId = `BANK-${fresh.provider.toUpperCase()}`;
  const label = gatewayLabel(fresh.provider);

  if (fresh.purpose === "wallet_topup") {
    const urows = await db.select().from(users).where(eq(users.id, fresh.userId)).limit(1);
    const role = urows[0]?.role || "buyer";
    const ownerType = role === "merchant" ? "merchant" : "buyer";

    let credited = amount;
    let settled = "0.00";
    if (ownerType === "merchant") {
      // Mandatory priority: commission_due settled FIRST from any incoming gateway deposit
      const res = await settleCommissionDueFirst(fresh.userId, amount, fresh.orderId || undefined);
      settled = res.settled;
      credited = res.remaining;
    }
    if (cmp(credited, "0") > 0) {
      await creditWallet(
        fresh.userId,
        ownerType,
        credited,
        "gateway_deposit",
        fresh.id,
        `شحن محفظة عبر ${label} — مرجع ${fresh.reference}`,
        `gateway-${fresh.reference}`
      );
    }
    // Double-entry: BANK-provider -> user (full amount, auditors reconcile due split via commission entries)
    await postLedgerEntry({
      debitOwnerId: bankOwnerId,
      debitOwnerType: "BANK",
      creditOwnerId: fresh.userId,
      creditOwnerType: ownerType,
      amount,
      entryType: "gateway_deposit",
      description: `Gateway deposit ${label} ref ${fresh.reference} providerRef ${providerRef}`,
      referenceType: "payment_intent",
      referenceId: fresh.id,
      idempotencyKey: `ledger-gateway-${fresh.reference}`,
    });
    // Payment record
    try {
      await db.insert(payments).values({
        orderId: fresh.orderId,
        payerId: fresh.userId,
        payeeId: fresh.userId,
        amount,
        method: fresh.provider,
        status: "succeeded",
        providerRef,
        idempotencyKey: `pay-${fresh.reference}`.slice(0, 100),
      });
    } catch {
      // duplicate — fine (idempotent)
    }
    await db
      .update(paymentIntents)
      .set({ status: "succeeded", providerRef, updatedAt: new Date() })
      .where(eq(paymentIntents.id, fresh.id));
    await audit("gateway_deposit_settled", "payment_intent", {
      actorId: fresh.userId,
      entityId: fresh.id,
      newValues: { reference: fresh.reference, provider: fresh.provider, amount, credited, settledDue: settled },
    });
    return { ok: true, credited, settledDue: settled };
  }

  // order_payment
  if (!fresh.orderId) return { ok: false };
  const orows = await db.select().from(orders).where(eq(orders.id, fresh.orderId)).limit(1);
  if (orows.length === 0) return { ok: false };
  const order = orows[0];
  if (order.buyerId !== fresh.userId) return { ok: false };

  // Double-entry: BANK-provider -> PLATFORM escrow (settlement to merchant happens at COMPLETED 95/5)
  await postLedgerEntry({
    debitOwnerId: bankOwnerId,
    debitOwnerType: "BANK",
    creditOwnerId: PLATFORM_OWNER_ID,
    creditOwnerType: PLATFORM_OWNER_TYPE,
    amount,
    entryType: "gateway_order_payment",
    description: `Order payment ${label} ref ${fresh.reference} order ${order.orderNumber}`,
    referenceType: "order",
    referenceId: order.id,
    idempotencyKey: `ledger-gateway-${fresh.reference}`,
  });
  try {
    await db.insert(payments).values({
      orderId: order.id,
      payerId: fresh.userId,
      payeeId: order.merchantId,
      amount,
      method: fresh.provider,
      status: "succeeded",
      providerRef,
      idempotencyKey: `pay-${fresh.reference}`.slice(0, 100),
    });
  } catch {
    // duplicate — fine
  }
  await db.update(orders).set({ paymentStatus: "paid", updatedAt: new Date() }).where(eq(orders.id, order.id));
  await db.insert(orderTimeline).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: order.status,
    actorId: fresh.userId,
    actorRole: "buyer",
    note: `💳 تم الدفع إلكترونياً عبر ${label} — مرجع ${fresh.reference}`,
    metadata: { provider: fresh.provider, providerRef, amount } as object,
  });
  await db
    .update(paymentIntents)
    .set({ status: "succeeded", providerRef, updatedAt: new Date() })
    .where(eq(paymentIntents.id, fresh.id));
  await audit("gateway_order_paid", "payment_intent", {
    actorId: fresh.userId,
    entityId: fresh.id,
    newValues: { reference: fresh.reference, provider: fresh.provider, amount, orderId: order.id },
  });
  return { ok: true, credited: amount, settledDue: "0.00" };
}
