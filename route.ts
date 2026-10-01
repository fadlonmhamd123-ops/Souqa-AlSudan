import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  users, orders, products, stores, commissions, auditLogs, wallets,
  productInspectionLogs, improvementProposals, receipts, withdrawals,
  ledgerEntries, ledgerAccounts, transactions, supportTickets,
  supportTicketMessages, aiConversations,
} from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { getSession, audit } from "@/lib/auth";
import { computeRiskScore } from "@/lib/inspection";
import {
  applyDelayPenalty,
  getWallet,
  ensurePlatformAccounts,
  debitWallet,
  creditWallet,
  platformWithdrawToBank,
} from "@/lib/finance";
import { PLATFORM_OWNER_ID, PLATFORM_OWNER_TYPE } from "@/lib/platform";
import { decideWalletAction, detectForbiddenBalanceKeys } from "@/lib/wallet-permissions";

function isAdminRole(role?: string | null) {
  return role === "admin" || role === "super_admin";
}

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s || !isAdminRole(s.role)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const url = new URL(req.url);
  const section = url.searchParams.get("section") || "overview";

  if (section === "overview") {
    const userCount = await db.execute(sql`select count(*)::int c from users`);
    const orderCount = await db.execute(sql`select count(*)::int c from orders`);
    const gmv = await db.execute(sql`select coalesce(sum(total),0)::numeric as s from orders where status='COMPLETED'`);
    const comm = await db.execute(sql`select coalesce(sum(amount),0)::numeric as s from commissions where status='settled'`);
    const due = await db.execute(sql`select coalesce(sum(amount),0)::numeric as s from commissions where status='due'`);
    const pendingInsp = await db.execute(sql`select count(*)::int c from products where status in ('pending_inspection','needs_review')`);
    const disputes = await db.execute(sql`select count(*)::int c from orders where status='DISPUTED'`);
    const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(15);
    const recentAudits = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(20);
    return NextResponse.json({
      stats: {
        users: (userCount.rows[0] as { c: number }).c,
        orders: (orderCount.rows[0] as { c: number }).c,
        gmv: String((gmv.rows[0] as { s: string }).s),
        commissionsSettled: String((comm.rows[0] as { s: string }).s),
        commissionsDue: String((due.rows[0] as { s: string }).s),
        pendingInspection: (pendingInsp.rows[0] as { c: number }).c,
        disputes: (disputes.rows[0] as { c: number }).c,
      },
      recentOrders,
      recentAudits,
    });
  }

  if (section === "users") {
    const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
    return NextResponse.json({ users: rows.map((u) => ({ ...u, passwordHash: undefined, twoFaSecret: undefined })) });
  }
  if (section === "inspections") {
    const pending = await db.select().from(products).where(sql`${products.status} in ('pending_inspection','needs_review','needs_more_info','rejected')`).orderBy(desc(products.createdAt)).limit(50);
    const logs = await db.select().from(productInspectionLogs).orderBy(desc(productInspectionLogs.createdAt)).limit(50);
    return NextResponse.json({ products: pending, logs });
  }
  if (section === "commissions") {
    const rows = await db.select().from(commissions).orderBy(desc(commissions.createdAt)).limit(100);
    const ords = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100);
    return NextResponse.json({ commissions: rows, orders: ords });
  }
  if (section === "integrity") {
    // Commerce Integrity AI: scan products for manipulation signals
    const prods = await db.select().from(products).orderBy(desc(products.updatedAt)).limit(60);
    const flagged = prods.map((p) => {
      const hist = (Array.isArray(p.priceHistory) ? p.priceHistory : []) as Array<{ oldPrice?: string; newPrice?: string; price?: string; at: string }>;
      const changes = hist
        .filter((h) => h.oldPrice && h.newPrice)
        .map((h) => ({ oldPrice: String(h.oldPrice), newPrice: String(h.newPrice), at: String(h.at) }));
      const r = computeRiskScore({ priceChanges: changes, imageReuseCount: 0, stockImageCount: 0 });
      return { id: p.id, titleAr: p.titleAr, price: p.price, status: p.status, risk: r };
    }).filter((f) => f.risk.level !== "LOW");
    return NextResponse.json({ flagged, scanned: prods.length });
  }
  if (section === "improvements") {
    const rows = await db.select().from(improvementProposals).orderBy(desc(improvementProposals.createdAt)).limit(50);
    return NextResponse.json({ proposals: rows });
  }
  if (section === "audits") {
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    return NextResponse.json({ audits: rows });
  }
  if (section === "deadlines") {
    // Orders past deadline (server time)
    const rows = await db.select().from(orders).where(sql`${orders.deadlineAt} < now() and ${orders.status} not in ('COMPLETED','CANCELLED_BY_CUSTOMER','CANCELLED_BY_MERCHANT','MERCHANT_FAILED_TO_FULFILL')`).limit(50);
    return NextResponse.json({ overdue: rows });
  }
  if (section === "finance") {
    // Platform Financial Dashboard — backend authoritative
    await ensurePlatformAccounts();
    const platformWallet = await getWallet(PLATFORM_OWNER_ID, PLATFORM_OWNER_TYPE, "SDG");
    const settled = await db.execute(sql`select coalesce(sum(amount),0)::numeric as s, count(*)::int as c from commissions where status='settled' and commission_type='standard'`);
    const due = await db.execute(sql`select coalesce(sum(amount),0)::numeric as s from commissions where status='due'`);
    const penalties = await db.execute(sql`select coalesce(sum(amount),0)::numeric as s from commissions where commission_type='delay_penalty'`);
    const month = await db.execute(sql`select coalesce(sum(amount),0)::numeric as s from commissions where status='settled' and created_at >= date_trunc('month', now())`);
    const escrow = await db.execute(sql`select coalesce(sum(total),0)::numeric as s, count(*)::int as c from orders where status not in ('COMPLETED','CANCELLED_BY_CUSTOMER','CANCELLED_BY_MERCHANT','MERCHANT_FAILED_TO_FULFILL')`);
    // Platform ledger history (latest entries with account labels)
    const ledger = await db.execute(sql`
      select le.id, le.entry_type, le.amount, le.description, le.created_at,
             da.name as debit_name, da.owner_type as debit_owner,
             ca.name as credit_name, ca.owner_type as credit_owner
      from ledger_entries le
      left join ledger_accounts da on da.id = le.debit_account_id
      left join ledger_accounts ca on ca.id = le.credit_account_id
      order by le.created_at desc limit 50
    `);
    // Platform wallet transactions
    const platformTx = await db.select().from(transactions).where(eq(transactions.walletId, platformWallet.id)).orderBy(desc(transactions.createdAt)).limit(30);
    // Merchant withdrawals with merchant/store names
    const wd = await db.execute(sql`
      select w.id, w.merchant_id, w.store_id, w.amount, w.currency, w.method, w.account_details,
             w.status, w.admin_note, w.decided_at, w.created_at,
             u.name as merchant_name, u.phone as merchant_phone,
             s.name_ar as store_name
      from withdrawals w
      left join users u on u.id = w.merchant_id
      left join stores s on s.id = w.store_id
      order by case when w.status='pending' then 0 else 1 end, w.created_at desc
      limit 60
    `);
    const sRow = settled.rows[0] as { s: string; c: number };
    const eRow = escrow.rows[0] as { s: string; c: number };
    // Gateway monitoring: recent intents + webhook events + per-provider totals
    const gwIntents = await db.execute(sql`
      select pi.reference, pi.provider, pi.purpose, pi.amount, pi.status, pi.created_at, u.name as user_name
      from payment_intents pi
      left join users u on u.id = pi.user_id
      order by pi.created_at desc limit 20
    `);
    const gwEvents = await db.execute(sql`
      select provider, event_id, intent_reference, signature_valid, status, created_at
      from payment_webhook_events
      order by created_at desc limit 20
    `);
    const gwTotals = await db.execute(sql`
      select provider, count(*)::int as c, coalesce(sum(case when status='succeeded' then amount else 0 end),0)::numeric as s
      from payment_intents group by provider
    `);
    return NextResponse.json({
      platformWallet: {
        id: platformWallet.id,
        ownerId: PLATFORM_OWNER_ID,
        ownerType: PLATFORM_OWNER_TYPE,
        currency: "SDG",
        status: (platformWallet as { status?: string }).status || "ACTIVE",
        availableBalance: String(platformWallet.availableBalance),
        pendingBalance: String(platformWallet.pendingBalance),
        lockedBalance: String(platformWallet.lockedBalance),
      },
      earnings: {
        totalCommissions: String(sRow.s),
        settledCommissions: String(sRow.s),
        dueCommissions: String((due.rows[0] as { s: string }).s),
        penalties: String((penalties.rows[0] as { s: string }).s),
        thisMonth: String((month.rows[0] as { s: string }).s),
        ordersSettled: sRow.c,
      },
      escrow: { balance: String(eRow.s), ordersCount: eRow.c },
      ledger: ledger.rows,
      platformTransactions: platformTx,
      withdrawals: wd.rows,
      gateways: { intents: gwIntents.rows, events: gwEvents.rows, totals: gwTotals.rows },
    });
  }
  if (section === "support") {
    const tickets = await db
      .select()
      .from(supportTickets)
      .orderBy(desc(supportTickets.updatedAt))
      .limit(100);
    const withUsers = await Promise.all(
      tickets.map(async (t) => {
        const u = t.userId
          ? (await db.select().from(users).where(eq(users.id, t.userId)).limit(1))[0]
          : undefined;
        const msgCount = await db.execute(
          sql`select count(*)::int c from support_ticket_messages where ticket_id=${t.id}`
        );
        return {
          ...t,
          userName: u?.name || (t.guestKey ? "زائر" : "—"),
          userRole: u?.role || "guest",
          // privacy: masked contact only in list
          userPhoneMasked: u?.phone ? `${String(u.phone).slice(0, 3)}***${String(u.phone).slice(-4)}` : null,
          messagesCount: (msgCount.rows[0] as { c: number }).c,
        };
      })
    );
    const openCount = await db.execute(sql`select count(*)::int c from support_tickets where status in ('open','in_progress')`);
    const critCount = await db.execute(sql`select count(*)::int c from support_tickets where severity='critical' and status not in ('resolved','closed')`);
    const convCount = await db.execute(sql`select count(*)::int c from ai_conversations`);
    const escCount = await db.execute(sql`select count(*)::int c from ai_conversations where escalated=true`);
    return NextResponse.json({
      tickets: withUsers,
      stats: {
        open: (openCount.rows[0] as { c: number }).c,
        critical: (critCount.rows[0] as { c: number }).c,
        conversations: (convCount.rows[0] as { c: number }).c,
        escalated: (escCount.rows[0] as { c: number }).c,
      },
    });
  }
  return NextResponse.json({ error: "قسم غير معروف" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s || !isAdminRole(s.role)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  try {
    const body = await req.json();
    const { action } = body;
    // ⛔ Reject any direct balance manipulation attempts from frontend
    const forbiddenKeys = detectForbiddenBalanceKeys(body);
    if (forbiddenKeys.length > 0 && (action === "approve_withdrawal" || action === "platform_withdraw")) {
      await audit("wallet_forbidden_keys_rejected", "wallet", {
        actorId: s.id, actorRole: s.role, entityId: s.id, newValues: { keys: forbiddenKeys, action },
      });
      return NextResponse.json({ error: `⛔ ممنوع تمرير حقول الأرصدة (${forbiddenKeys.join(", ")})` }, { status: 403 });
    }

    if (action === "set_role") {
      if (s.role !== "super_admin") return NextResponse.json({ error: "تعيين الأدوار للمشرف العام فقط" }, { status: 403 });
      const { userId, role } = body;
      if (!["buyer", "merchant", "admin"].includes(role)) return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
      const old = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
      await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
      await audit("role_changed", "user", { actorId: s.id, actorRole: s.role, entityId: userId, oldValues: { role: old?.role }, newValues: { role } });
      return NextResponse.json({ ok: true });
    }
    if (action === "toggle_user") {
      const { userId, isActive } = body;
      await db.update(users).set({ isActive: Boolean(isActive), updatedAt: new Date() }).where(eq(users.id, userId));
      await audit("user_toggled", "user", { actorId: s.id, actorRole: s.role, entityId: userId, newValues: { isActive } });
      return NextResponse.json({ ok: true });
    }
    if (action === "decide_inspection") {
      const { productId, decision } = body; // APPROVED | REJECTED | NEEDS_MORE_INFO
      const map: Record<string, string> = { APPROVED: "published", REJECTED: "rejected", NEEDS_MORE_INFO: "needs_more_info" };
      if (!map[decision]) return NextResponse.json({ error: "قرار غير صالح" }, { status: 400 });
      await db.update(products).set({ status: map[decision], updatedAt: new Date() }).where(eq(products.id, productId));
      await db.insert(productInspectionLogs).values({
        productId, decision, confidenceScore: "100",
        checks: [{ name: "human_review", nameAr: "مراجعة بشرية", passed: decision === "APPROVED", weight: 100, detailAr: `قرار ${s.name}` }],
        explanationAr: decision === "APPROVED" ? "🟢 تم القبول بعد المراجعة البشرية" : "تمت المراجعة من الإدارة",
        reviewedBy: `admin:${s.id}`,
      });
      await audit("inspection_decided", "product", { actorId: s.id, actorRole: s.role, entityId: productId, newValues: { decision } });
      return NextResponse.json({ ok: true });
    }
    if (action === "apply_penalty") {
      const { orderId } = body;
      const ok = await applyDelayPenalty(orderId);
      await audit("delay_penalty_applied", "order", { actorId: s.id, actorRole: s.role, entityId: orderId });
      return NextResponse.json({ ok });
    }
    if (action === "approve_withdrawal" || action === "reject_withdrawal") {
      const perm = decideWalletAction({ id: s.id, role: s.role }, "approve_withdrawal");
      if (!perm.allowed) return NextResponse.json({ error: perm.reasonAr }, { status: 403 });
      const { withdrawalId, adminNote } = body;
      const rows = await db.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).limit(1);
      if (!rows[0]) return NextResponse.json({ error: "طلب السحب غير موجود" }, { status: 404 });
      const w = rows[0];
      if (w.status !== "pending") {
        return NextResponse.json({ error: `تم البت في هذا الطلب مسبقاً (${w.status})` }, { status: 400 });
      }
      if (action === "reject_withdrawal") {
        await db.update(withdrawals).set({
          status: "rejected",
          adminNote: adminNote ? String(adminNote).slice(0, 500) : "مرفوض من الإدارة",
          decidedBy: s.id,
          decidedAt: new Date(),
        }).where(eq(withdrawals.id, withdrawalId));
        await audit("withdrawal_rejected", "withdrawal", { actorId: s.id, actorRole: s.role, entityId: withdrawalId, newValues: { amount: w.amount } });
        return NextResponse.json({ ok: true });
      }
      // Approve: backend-authoritative debit from merchant wallet (idempotent)
      const { cmp } = await import("@/lib/money");
      const mw = await getWallet(w.merchantId, "merchant", "SDG");
      if (cmp(String(mw.availableBalance), String(w.amount)) < 0) {
        return NextResponse.json({ error: `رصيد التاجر المتاح (${mw.availableBalance}) لا يغطي المبلغ (${w.amount})` }, { status: 400 });
      }
      const after = await debitWallet(
        w.merchantId, "merchant", String(w.amount),
        "withdrawal", withdrawalId,
        `سحب أرباح معتمد — ${w.method} ${w.accountDetails || ""}`,
        `withdrawal-${withdrawalId}`
      );
      if (after === null) {
        return NextResponse.json({ error: "تعذر خصم المبلغ — رصيد غير كاف" }, { status: 400 });
      }
      await db.update(withdrawals).set({
        status: "paid",
        adminNote: adminNote ? String(adminNote).slice(0, 500) : "تم الصرف ✅",
        decidedBy: s.id,
        decidedAt: new Date(),
      }).where(eq(withdrawals.id, withdrawalId));
      await audit("withdrawal_approved", "withdrawal", { actorId: s.id, actorRole: s.role, entityId: withdrawalId, newValues: { amount: w.amount, balanceAfter: after } });
      return NextResponse.json({ ok: true, balanceAfter: after });
    }
    if (action === "platform_withdraw") {
      const perm = decideWalletAction({ id: s.id, role: s.role }, "platform_withdraw");
      if (!perm.allowed) return NextResponse.json({ error: perm.reasonAr }, { status: 403 });
      const { amount, bankRef } = body as { amount: string; bankRef?: string };
      const { cmp } = await import("@/lib/money");
      const { randomUUID } = await import("crypto");
      if (!amount || cmp(String(amount), "0") <= 0) {
        return NextResponse.json({ error: "المبلغ غير صالح" }, { status: 400 });
      }
      const ref = bankRef ? String(bankRef).slice(0, 120) : "Admin Bank Account";
      const res = await platformWithdrawToBank(Number(amount).toFixed(2), ref, `platform-wd-${randomUUID()}`);
      if (!res.ok) return NextResponse.json({ error: res.error || "تعذر السحب" }, { status: 400 });
      await audit("platform_withdraw", "wallet", {
        actorId: s.id, actorRole: s.role, entityId: PLATFORM_OWNER_ID,
        newValues: { amount: Number(amount).toFixed(2), bankRef: ref, balanceAfter: res.balanceAfter },
      });
      return NextResponse.json({ ok: true, balanceAfter: res.balanceAfter });
    }
    if (action === "approve_improvement") {
      const { proposalId } = body;
      const rows = await db.select().from(improvementProposals).where(eq(improvementProposals.id, proposalId)).limit(1);
      if (!rows[0]) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
      if (rows[0].level === 3) {
        return NextResponse.json({ error: "مستوى 3 (المال والأذونات) محظور — يتطلب مراجعة يدوية خارج النظام" }, { status: 403 });
      }
      await db.update(improvementProposals).set({ status: "approved", approvedBy: s.id }).where(eq(improvementProposals.id, proposalId));
      await audit("improvement_approved", "improvement", { actorId: s.id, actorRole: s.role, entityId: proposalId });
      return NextResponse.json({ ok: true });
    }
    if (action === "run_improvement_scan") {
      // Continuous Improvement AI: Level 1 auto-applies, Level 2 proposes, Level 3 banned
      const disputes = await db.execute(sql`select count(*)::int c from orders where status='DISPUTED'`);
      const dc = (disputes.rows[0] as { c: number }).c;
      const proposals: Array<{ level: number; category: string; titleAr: string; descriptionAr: string }> = [
        { level: 1, category: "localization", titleAr: "تحسين نص زر إتمام الطلب", descriptionAr: "تغيير النص إلى '✅ استلمت طلبي — إتمام' لزيادة الوضوح (تطبيق تلقائي آمن)" },
      ];
      if (dc > 2) {
        proposals.push({ level: 2, category: "workflow", titleAr: "تقليص مهلة الولايات لـ 12 يوماً", descriptionAr: `رُصد ${dc} نزاعات — يُقترح تقليص مهلة الولايات مع إشعار مبكر (يحتاج موافقة)` });
      }
      proposals.push({ level: 3, category: "finance", titleAr: "[محظور تلقائياً] تعديل معادلة العمولة", descriptionAr: "وكيل التحسين ممنوع من لمس الدفاتر والمحافظ — للعلم فقط" });
      for (const p of proposals) {
        await db.insert(improvementProposals).values({
          level: p.level, category: p.category, titleAr: p.titleAr, descriptionAr: p.descriptionAr,
          payload: {}, status: p.level === 1 ? "auto_applied" : "pending", autoApplied: p.level === 1,
        });
      }
      await audit("improvement_scan", "system", { actorId: s.id, actorRole: s.role, entityId: "system" });
      return NextResponse.json({ ok: true, created: proposals.length });
    }
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}
