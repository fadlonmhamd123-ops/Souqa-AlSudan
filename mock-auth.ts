/**
 * Mock Auth — نظام المصادقة التجريبية المحلية (للتجربة الفورية)
 * يحفظ الحساب التجريبي في LocalStorage مع الدور والصلاحيات.
 */

export type MockRole = "buyer" | "merchant" | "admin" | "super_admin";

export interface MockUser {
  id: string;
  name: string;
  identifier: string; // phone or email used to login
  phone: string | null;
  email: string | null;
  role: MockRole;
  redirect: string;
  isMock: true;
  loginAt: string;
}

export const MOCK_STORAGE_KEY = "matjarak_mock_user";

export const DEMO_ADMIN_PHONE = "0124062972";
export const DEMO_ADMIN_EMAIL = "mohammedfadlon885@gmail.com";
export const DEMO_BUYER_EMAIL = "demo.buyer@gmail.com";
export const DEMO_MERCHANT_EMAIL = "merchant@matjarak.com";

export function normalizeMockPhone(phone: string): string {
  let p = phone.replace(/[\s-]/g, "");
  if (p.startsWith("+249")) p = "0" + p.slice(4);
  else if (p.startsWith("249") && p.length > 10) p = "0" + p.slice(3);
  return p;
}

export function isAdminIdentifier(identifier: string): boolean {
  const id = identifier.trim().toLowerCase();
  const phone = normalizeMockPhone(identifier.trim());
  return (
    phone === DEMO_ADMIN_PHONE ||
    id === DEMO_ADMIN_EMAIL.toLowerCase()
  );
}

export function isMerchantIdentifier(identifier: string): boolean {
  return identifier.trim().toLowerCase().includes("merchant");
}

export interface DetectedLogin {
  role: MockRole;
  redirect: string;
  name: string;
  phone: string | null;
  email: string | null;
}

/** كشف الدور من المُدخل — القاعدة الذهبية للـ Mock Auth */
export function detectMockLogin(identifier: string): DetectedLogin {
  const raw = identifier.trim();
  const lower = raw.toLowerCase();
  const isEmail = raw.includes("@");

  // 1) الحساب الإداري — أي كلمة مرور
  if (isAdminIdentifier(raw)) {
    return {
      role: "super_admin",
      redirect: "/admin",
      name: "المشرف العام 👑",
      phone: isEmail ? DEMO_ADMIN_PHONE : normalizeMockPhone(raw),
      email: isEmail ? lower : DEMO_ADMIN_EMAIL,
    };
  }

  // 2) حساب التاجر — يحتوي على merchant
  if (isMerchantIdentifier(raw)) {
    const email = isEmail ? lower : `${lower.replace(/[^a-z0-9]/g, "")}@matjarak.com`;
    return {
      role: "merchant",
      redirect: "/merchant",
      name: "تاجر متجرك 🏪",
      phone: isEmail ? null : normalizeMockPhone(raw),
      email,
    };
  }

  // 3) حساب الزبون — أي شيء آخر
  return {
    role: "buyer",
    redirect: "/",
    name: isEmail ? lower.split("@")[0] : `زبون ${normalizeMockPhone(raw).slice(-4)}`,
    phone: isEmail ? null : normalizeMockPhone(raw),
    email: isEmail ? lower : null,
  };
}

/** الدخول عبر Google — حساب تجريبي ثابت */
export function googleMockLogin(): DetectedLogin {
  return {
    role: "buyer",
    redirect: "/",
    name: "زائر Google 🛒",
    phone: null,
    email: DEMO_BUYER_EMAIL,
  };
}

export function buildMockUser(identifier: string, detected: DetectedLogin): MockUser {
  return {
    id: `mock-${detected.role}-${Buffer.from(identifier).toString("base64").slice(0, 12).replace(/[^a-zA-Z0-9]/g, "")}`,
    name: detected.name,
    identifier: identifier.trim(),
    phone: detected.phone,
    email: detected.email,
    role: detected.role,
    redirect: detected.redirect,
    isMock: true,
    loginAt: new Date().toISOString(),
  };
}

// ---------- LocalStorage helpers (client only) ----------
export function saveMockUser(user: MockUser): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(user));
    // حدث مخصص لتحديث كل المكونات فوراً
    window.dispatchEvent(new CustomEvent("matjarak:mock-auth", { detail: user }));
  } catch {}
}

export function getMockUser(): MockUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockUser;
    if (!parsed || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMockUser(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MOCK_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("matjarak:mock-auth", { detail: null }));
  } catch {}
}

// ---------- صلاحيات الأدوار ----------
export function canAccessAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function canAccessMerchant(role: string | null | undefined): boolean {
  return role === "merchant" || role === "admin" || role === "super_admin";
}

export function roleLabelAr(role: string | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "مشرف عام 👑";
    case "admin":
      return "إداري 🛡️";
    case "merchant":
      return "تاجر 🏪";
    case "buyer":
      return "زبون 🛒";
    default:
      return "زائر";
  }
}
