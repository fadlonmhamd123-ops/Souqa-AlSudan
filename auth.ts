import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { users, sessions, wallets, ledgerAccounts, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "matjarak-dev-secret-change-in-production-32chars"
);

export type Role = "buyer" | "merchant" | "admin" | "super_admin";

export interface SessionUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  jti: string;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s-]/g, "");
  if (p.startsWith("+249")) p = "0" + p.slice(4);
  if (p.startsWith("249")) p = "0" + p.slice(3);
  return p;
}

export function isSuperAdminCredential(phone?: string | null, email?: string | null): boolean {
  const adminPhone = normalizePhone(process.env.ADMIN_PHONE || "0124062972");
  const adminEmail = (process.env.ADMIN_EMAIL || "mohammedfadlon885@gmail.com").toLowerCase();
  const p = phone ? normalizePhone(phone) : "";
  const e = email ? email.toLowerCase() : "";
  return (p !== "" && p === adminPhone) || (e !== "" && e === adminEmail);
}

export async function createSession(userId: string, role: Role, device?: string): Promise<string> {
  const jti = randomUUID();
  const h = await headers().catch(() => null);
  const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = h?.get("user-agent") || device || "unknown";
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db.insert(sessions).values({
    userId,
    jti,
    device: (device || ua).slice(0, 200),
    ip: ip.slice(0, 60),
    userAgent: ua.slice(0, 1000),
    expiresAt,
  });
  const token = await new SignJWT({ sub: userId, role, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
  const c = await cookies();
  c.set("matjarak_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const c = await cookies();
    const token = c.get("matjarak_session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sub = payload.sub as string;
    const role = payload.role as Role;
    const jti = payload.jti as string;
    if (!sub || !jti) return null;
    const rows = await db.select().from(sessions).where(eq(sessions.jti, jti)).limit(1);
    const sess = rows[0];
    if (!sess || sess.revoked) return null;
    if (new Date(sess.expiresAt).getTime() < Date.now()) return null;
    const urows = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    const u = urows[0];
    if (!u || !u.isActive) return null;
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      role: (u.role as Role) || role,
      jti,
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  const token = c.get("matjarak_session")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const jti = payload.jti as string;
      if (jti) {
        await db.update(sessions).set({ revoked: true }).where(eq(sessions.jti, jti));
      }
    } catch {}
  }
  c.delete("matjarak_session");
}

export async function revokeAllSessions(userId: string, exceptJti?: string): Promise<number> {
  const all = await db.select().from(sessions).where(eq(sessions.userId, userId));
  let count = 0;
  for (const s of all) {
    if (exceptJti && s.jti === exceptJti) continue;
    if (!s.revoked) {
      await db.update(sessions).set({ revoked: true }).where(eq(sessions.id, s.id));
      count++;
    }
  }
  return count;
}

/** Ensure wallet + ledger accounts exist for a user (idempotent). */
export async function ensureWalletAndLedger(
  ownerId: string,
  ownerType: "buyer" | "merchant" | "platform" | "PLATFORM",
  currency = "SDG"
): Promise<void> {
  // Canonicalize platform type to uppercase PLATFORM
  const canonicalType = ownerType.toLowerCase() === "platform" ? "PLATFORM" : ownerType;
  const existing = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.ownerId, ownerId),
        eq(wallets.ownerType, canonicalType),
        eq(wallets.currency, currency)
      )
    )
    .limit(1);
  if (existing.length === 0) {
    await db.insert(wallets).values({
      ownerId,
      ownerType: canonicalType,
      currency,
      status: "ACTIVE",
      availableBalance: "0",
      pendingBalance: "0",
      lockedBalance: "0",
    });
  }
  // Platform uses dedicated commission account; users get standard asset accounts
  if (canonicalType === "PLATFORM") {
    const { ensurePlatformWallet } = await import("./platform");
    await ensurePlatformWallet();
    return;
  }
  const accCode = `LA-${canonicalType.toUpperCase()}-${ownerId.slice(0, 8)}-${currency}`;
  const lrows = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, accCode)).limit(1);
  if (lrows.length === 0) {
    await db.insert(ledgerAccounts).values({
      ownerId,
      ownerType: canonicalType,
      currency,
      accountType: "asset",
      code: accCode,
      name: `${canonicalType} account ${ownerId.slice(0, 8)}`,
      balance: "0",
    });
  }
}

export async function audit(
  action: string,
  entityType: string,
  opts: {
    actorId?: string | null;
    actorRole?: string | null;
    entityId?: string | null;
    oldValues?: unknown;
    newValues?: unknown;
  } = {}
): Promise<void> {
  try {
    const h = await headers().catch(() => null);
    await db.insert(auditLogs).values({
      actorId: opts.actorId || null,
      actorRole: opts.actorRole || null,
      action,
      entityType,
      entityId: opts.entityId || null,
      oldValues: (opts.oldValues as object) ?? null,
      newValues: (opts.newValues as object) ?? null,
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim()?.slice(0, 60) || null,
      userAgent: h?.get("user-agent")?.slice(0, 1000) || null,
    });
  } catch {}
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code + (process.env.OTP_PEPPER || "matjarak-otp")).digest("hex");
}

export function requireRole(user: SessionUser | null, allowed: Role[]): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (allowed.includes(user.role)) return true;
  if (user.role === "admin" && allowed.includes("merchant")) return true;
  return false;
}
