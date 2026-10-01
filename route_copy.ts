import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { withdrawals, stores } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSession, audit } from "@/lib/auth";
import { getWallet } from "@/lib/finance";
import { decideWalletAction, detectForbiddenBalanceKeys, getMerchantKycStatus } from "@/lib/wallet-permissions";
import { cmp } from "@/lib/money";
import { randomUUID } from "crypto";

/** Merchant creates a withdrawal request; admin approves/pays from finance tab. */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "سجل الدخول أولاً" }, { status: 401 });
  if (s.role !== "merchant" && s.role !== "admin" && s.role !== "super_admin") {
    return NextResponse.json({ error: "للتجار فقط" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(withdrawals)
    .where(
      s.role === "merchant"
        ? eq(withdrawals.merchantId, s.id)
        : and(eq(withdrawals.status, "pending"))
    )
    .orderBy(desc(withdrawals.createdAt))
    .limit(50);
  return NextResponse.json({ withdrawals: rows });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "سجل الدخول أولاً" }, { status: 401 });
  if (s.role !== "merchant" && s.role !== "admin" && s.role !== "super_admin") {
    return NextResponse.json({ error: "طلبات السحب للتجار فقط" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const forbidden = detectForbiddenBalanceKeys(body);
    if (forbidden.length > 0) {
      return NextResponse.json({ error: `⛔ ممنوع تمرير حقول الأرصدة من الواجهة (${forbidden.join(", ")})` }, { status: 403 });
    }
    const { amount, method = "bankak", accountDetails, storeId } = body;
    if (!amount || cmp(String(amount), "0") <= 0) {
      return NextResponse.json({ error: "المبلغ غير صالح" }, { status: 400 });
    }
    // KYC gate: sensitive merchant finance locked while PENDING
    if (s.role === "merchant") {
      const kyc = await getMerchantKycStatus(s.id);
      const w = decideWalletAction({ id: s.id, role: s.role, kycStatus: kyc }, "request_withdrawal");
      if (!w.allowed) return NextResponse.json({ error: w.reasonAr, kycStatus: kyc }, { status: 403 });
    }
    // Backend-authoritative balance check at request time
    const w = await getWallet(s.id, "merchant", "SDG");
    if (cmp(String(w.availableBalance), String(amount)) < 0) {
      return NextResponse.json(
        { error: `الرصيد المتاح (${w.availableBalance} ج.س) لا يغطي المبلغ المطلوب` },
        { status: 400 }
      );
    }
    let finalStoreId: string | null = storeId || null;
    if (!finalStoreId) {
      const st = await db.select().from(stores).where(eq(stores.merchantId, s.id)).limit(1);
      finalStoreId = st[0]?.id || null;
    }
    const ins = await db
      .insert(withdrawals)
      .values({
        merchantId: s.id,
        storeId: finalStoreId,
        amount: Number(amount).toFixed(2),
        currency: "SDG",
        method: String(method).slice(0, 30),
        accountDetails: accountDetails ? String(accountDetails).slice(0, 255) : null,
        status: "pending",
        idempotencyKey: randomUUID(),
      })
      .returning();
    await audit("withdrawal_requested", "withdrawal", {
      actorId: s.id,
      actorRole: s.role,
      entityId: ins[0].id,
      newValues: { amount: ins[0].amount, method },
    });
    return NextResponse.json({ ok: true, withdrawal: ins[0] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "تعذر إرسال طلب السحب" }, { status: 500 });
  }
}
