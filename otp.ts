import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { hashOtp, normalizePhone } from "./auth";

// ====== Config (Backend-Authoritative) ======
export const OTP_EXPIRY_MINUTES = 3; // 2-3 min validity
export const OTP_RESEND_COOLDOWN_SECONDS = 60; // 01:00 countdown
export const OTP_MAX_ATTEMPTS = 3; // lock after >3 wrong
export const OTP_LOCK_MINUTES = 15; // temporary lock
export const OTP_MAX_RESENDS = 5;
export const OTP_FAST_GATEWAY_MAX_MS = 5000; // 5s guarantee

export type OtpChannel = "sms" | "whatsapp" | "email";

export function normalizeContact(contact: string, channel: OtpChannel): string {
  const c = String(contact).trim();
  if (channel === "email") return c.toLowerCase();
  // sms / whatsapp use phone
  if (c.includes("@")) return c.toLowerCase();
  return normalizePhone(c);
}

export function maskContact(contact: string): string {
  const c = String(contact);
  if (c.includes("@")) {
    const [u, d] = c.split("@");
    if (!d) return "***";
    return `${u.slice(0, 2)}***@${d}`;
  }
  const digits = c.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

/** Simulated fast gateway — resolves in <5s, records latency */
async function fastGatewaySend(
  channel: OtpChannel,
  contact: string,
  code: string
): Promise<{ latencyMs: number; providerRef: string }> {
  const start = Date.now();
  // Simulate 600-2400ms network latency (always < 5000ms)
  const simulated = 600 + Math.floor(Math.random() * 1800);
  await new Promise((r) => setTimeout(r, Math.min(simulated, 2600)));
  const latencyMs = Date.now() - start;
  const prefix = channel === "sms" ? "SMS" : channel === "whatsapp" ? "WA" : "MAIL";
  const providerRef = `${prefix}-${Date.now().toString(36).toUpperCase()}-${code.slice(0, 3)}`;
  // In production: plug real provider here (e.g. fetch to SMS gateway)
  // console log for observability (no code leak in prod logs beyond dev)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[OTP:${channel}] -> ${maskContact(contact)} ref=${providerRef} in ${latencyMs}ms`);
  }
  return { latencyMs, providerRef };
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function findUserByContact(contact: string) {
  const c = String(contact).trim();
  const isEmail = c.includes("@");
  const rows = await db
    .select()
    .from(users)
    .where(isEmail ? eq(users.email, c.toLowerCase()) : eq(users.phone, normalizePhone(c)))
    .limit(1);
  return rows[0] || null;
}

export async function isAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil: Date | null }> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  if (!u || !u.lockedUntil) return { locked: false, lockedUntil: null };
  if (new Date(u.lockedUntil).getTime() > Date.now()) {
    return { locked: true, lockedUntil: new Date(u.lockedUntil) };
  }
  // auto-unlock + reset counter
  if (u.otpFailedAttempts > 0 || u.lockedUntil) {
    await db.update(users).set({ lockedUntil: null, otpFailedAttempts: 0 }).where(eq(users.id, userId));
  }
  return { locked: false, lockedUntil: null };
}

export async function lockAccount(userId: string): Promise<Date> {
  const until = new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000);
  await db.update(users).set({ lockedUntil: until }).where(eq(users.id, userId));
  return until;
}

interface RequestOtpParams {
  contact: string;
  purpose: string;
  channel: OtpChannel;
  userId?: string | null;
}

export async function requestOtp({ contact, purpose, channel, userId = null }: RequestOtpParams) {
  const normContact = normalizeContact(contact, channel);
  // Resolve user for lockout enforcement
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const u = await findUserByContact(normContact);
    if (u) resolvedUserId = u.id;
  }
  if (resolvedUserId) {
    const { locked, lockedUntil } = await isAccountLocked(resolvedUserId);
    if (locked) {
      return {
        ok: false as const,
        locked: true,
        lockedUntil,
        error: `تم حظر الحساب مؤقتاً لأسباب أمنية حتى ${lockedUntil?.toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" })} — حاول لاحقاً`,
      };
    }
  }

  // Cooldown: check latest code for same contact+purpose
  const latest = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.contact, normContact), eq(otpCodes.purpose, purpose)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  const last = latest[0];
  if (last) {
    const sinceLast = Date.now() - new Date(last.lastSentAt).getTime();
    const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
    if (sinceLast < cooldownMs && !last.verified) {
      const waitSec = Math.ceil((cooldownMs - sinceLast) / 1000);
      return {
        ok: false as const,
        cooldown: true,
        resendAfterSeconds: waitSec,
        expiresAt: last.expiresAt,
        error: `انتظر ${waitSec} ثانية قبل إعادة الإرسال`,
      };
    }
    if ((last.resendCount || 0) >= OTP_MAX_RESENDS && !last.verified) {
      // allow new cycle after expiry only
      if (new Date(last.expiresAt).getTime() > Date.now()) {
        return {
          ok: false as const,
          error: "تجاوزت حد إعادة الإرسال — انتظر انتهاء صلاحية الرمز الحالي ثم حاول مجدداً",
        };
      }
    }
  }

  const code = generateOtpCode();
  const { latencyMs, providerRef } = await fastGatewaySend(channel, normContact, code);

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const ins = await db
    .insert(otpCodes)
    .values({
      userId: resolvedUserId,
      contact: normContact,
      codeHash: hashOtp(code),
      purpose,
      channel,
      expiresAt,
      attempts: 0,
      resendCount: last && !last.verified ? (last.resendCount || 0) + 1 : 0,
      lastSentAt: new Date(),
      deliveryMs: latencyMs,
    })
    .returning();

  return {
    ok: true as const,
    otpId: ins[0].id,
    contact: normContact,
    maskedContact: maskContact(normContact),
    channel,
    expiresAt,
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    deliveryMs: latencyMs,
    deliverySeconds: Number((latencyMs / 1000).toFixed(1)),
    providerRef,
    ...(process.env.NODE_ENV !== "production" ? { demoCode: code } : {}),
  };
}

interface VerifyOtpParams {
  contact: string;
  purpose: string;
  code: string;
  userId?: string | null;
}

export async function verifyOtp({ contact, purpose, code, userId = null }: VerifyOtpParams) {
  // Normalize: try both phone/email forms
  const raw = String(contact).trim();
  const candidates = raw.includes("@")
    ? [raw.toLowerCase()]
    : [normalizePhone(raw), raw];
  let rec: typeof otpCodes.$inferSelect | undefined;
  for (const c of candidates) {
    const rows = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.contact, c), eq(otpCodes.purpose, purpose)))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (rows[0]) {
      rec = rows[0];
      break;
    }
  }
  if (!rec) {
    return { ok: false as const, error: "لا يوجد رمز مرسل لهذا الرقم — اطلب رمزاً جديداً", code: "NOT_FOUND" };
  }
  if (rec.verified) {
    return { ok: true as const, already: true, token: `verified:${rec.contact}` };
  }
  if (new Date(rec.expiresAt).getTime() < Date.now()) {
    return {
      ok: false as const,
      error: "انتهت صلاحية الرمز (3 دقائق) — اضغط إعادة الإرسال لرمز جديد",
      code: "EXPIRED",
      canResend: true,
    };
  }

  const resolvedUserId = userId || rec.userId || (await findUserByContact(rec.contact))?.id || null;
  if (resolvedUserId) {
    const { locked, lockedUntil } = await isAccountLocked(resolvedUserId);
    if (locked) {
      return {
        ok: false as const,
        locked: true,
        lockedUntil,
        error: `الحساب محظور مؤقتاً حتى ${lockedUntil?.toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" })} بسبب محاولات خاطئة متكررة`,
        code: "LOCKED",
      };
    }
  }

  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    // Already at limit — enforce lock
    if (resolvedUserId) {
      const until = await lockAccount(resolvedUserId);
      return {
        ok: false as const,
        locked: true,
        lockedUntil: until,
        error: `تم حظر الحساب مؤقتاً لمدة ${OTP_LOCK_MINUTES} دقيقة بسبب 3 محاولات خاطئة`,
        code: "LOCKED",
      };
    }
    return { ok: false as const, error: "تجاوزت عدد المحاولات المسموحة", code: "MAX_ATTEMPTS" };
  }

  if (hashOtp(String(code).trim()) !== rec.codeHash) {
    const newAttempts = (rec.attempts || 0) + 1;
    await db.update(otpCodes).set({ attempts: newAttempts }).where(eq(otpCodes.id, rec.id));
    // bump user counter too
    if (resolvedUserId) {
      const urows = await db.select().from(users).where(eq(users.id, resolvedUserId)).limit(1);
      const cur = urows[0]?.otpFailedAttempts || 0;
      await db
        .update(users)
        .set({ otpFailedAttempts: cur + 1 })
        .where(eq(users.id, resolvedUserId));
    }
    const remaining = OTP_MAX_ATTEMPTS - newAttempts;
    if (remaining <= 0) {
      if (resolvedUserId) {
        const until = await lockAccount(resolvedUserId);
        return {
          ok: false as const,
          locked: true,
          lockedUntil: until,
          error: `رمز غير صحيح — تم حظر الحساب مؤقتاً لمدة ${OTP_LOCK_MINUTES} دقيقة (3 محاولات خاطئة) 🔒`,
          code: "LOCKED",
        };
      }
      return { ok: false as const, error: "الرمز غير صحيح — نفدت محاولاتك", code: "MAX_ATTEMPTS" };
    }
    return {
      ok: false as const,
      error: `الرمز غير صحيح — تبقى ${remaining} ${remaining === 1 ? "محاولة واحدة" : "محاولات"} قبل الحظر المؤقت ⚠️`,
      code: "WRONG_CODE",
      remainingAttempts: remaining,
    };
  }

  await db.update(otpCodes).set({ verified: true }).where(eq(otpCodes.id, rec.id));
  if (resolvedUserId) {
    await db
      .update(users)
      .set({ otpFailedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, resolvedUserId));
  }
  return { ok: true as const, token: `verified:${rec.contact}`, otpId: rec.id };
}
