/**
 * Mock Wallet — بيانات المحفظة التجريبية المحلية
 * تعمل فوراً بدون انتظار قاعدة البيانات، مع حفظ في LocalStorage لكل مستخدم.
 */

export interface MockTransaction {
  id: string;
  type: "credit" | "debit";
  amount: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

export interface MockWalletData {
  wallet: {
    availableBalance: string;
    pendingBalance: string;
    lockedBalance: string;
  };
  transactions: MockTransaction[];
  commissionDue: string | null;
  updatedAt: string;
}

const PREFIX = "matjarak_mock_wallet:";

function walletKey(userKey: string): string {
  return `${PREFIX}${userKey || "guest"}`;
}

function now(offsetMinutes = 0): string {
  return new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** بيانات تجريبية افتراضية واقعية بالجنيه السوداني */
export function defaultMockWallet(role: string | null): MockWalletData {
  const isMerchant = role === "merchant" || role === "admin" || role === "super_admin";
  const available = isMerchant ? "125750.00" : "48250.00";
  const pending = isMerchant ? "15000.00" : "5000.00";
  const locked = isMerchant ? "5000.00" : "0.00";

  const transactions: MockTransaction[] = isMerchant
    ? [
        {
          id: uid("tx"),
          type: "credit",
          amount: "42750.00",
          balanceAfter: available,
          description: "تسوية طلب ORD-K3M9X2 — صافي بعد العمولة 5%",
          createdAt: now(35),
        },
        {
          id: uid("tx"),
          type: "debit",
          amount: "2250.00",
          balanceAfter: "83000.00",
          description: "عمولة المنصة 5% طلب ORD-K3M9X2",
          createdAt: now(36),
        },
        {
          id: uid("tx"),
          type: "credit",
          amount: "50000.00",
          balanceAfter: "85250.00",
          description: "إيداع إلكتروني (بنكك 📱)",
          createdAt: now(60 * 5),
        },
        {
          id: uid("tx"),
          type: "debit",
          amount: "10000.00",
          balanceAfter: "35250.00",
          description: "سحب إلى بنكك — 091****123",
          createdAt: now(60 * 26),
        },
        {
          id: uid("tx"),
          type: "credit",
          amount: "38000.00",
          balanceAfter: "45250.00",
          description: "تسوية طلب ORD-K2P4Q8 — صافي بعد العمولة 5%",
          createdAt: now(60 * 49),
        },
        {
          id: uid("tx"),
          type: "debit",
          amount: "2000.00",
          balanceAfter: "7250.00",
          description: "تحويل إلى تاجر — متجر النور 🏪",
          createdAt: now(60 * 72),
        },
      ]
    : [
        {
          id: uid("tx"),
          type: "credit",
          amount: "30000.00",
          balanceAfter: available,
          description: "إيداع إلكتروني (بنكك 📱)",
          createdAt: now(60 * 3),
        },
        {
          id: uid("tx"),
          type: "debit",
          amount: "12500.00",
          balanceAfter: "18250.00",
          description: "شراء — سامسونج جالاكسي A54 🛒",
          createdAt: now(60 * 8),
        },
        {
          id: uid("tx"),
          type: "credit",
          amount: "12500.00",
          balanceAfter: "30750.00",
          description: "استرداد طلب ملغي ORD-K1A2B3 ↩️",
          createdAt: now(60 * 30),
        },
        {
          id: uid("tx"),
          type: "debit",
          amount: "3000.00",
          balanceAfter: "18250.00",
          description: "رسوم توصيل — الخرطوم بحري 🚚",
          createdAt: now(60 * 31),
        },
        {
          id: uid("tx"),
          type: "debit",
          amount: "5000.00",
          balanceAfter: "21250.00",
          description: "تحويل إلى صديق — 092****456 📤",
          createdAt: now(60 * 55),
        },
      ];

  return {
    wallet: {
      availableBalance: available,
      pendingBalance: pending,
      lockedBalance: locked,
    },
    transactions,
    commissionDue: isMerchant ? "1125.00" : null,
    updatedAt: new Date().toISOString(),
  };
}

export function loadMockWallet(userKey: string, role: string | null): MockWalletData {
  if (typeof window === "undefined") return defaultMockWallet(role);
  try {
    const raw = localStorage.getItem(walletKey(userKey));
    if (raw) {
      const parsed = JSON.parse(raw) as MockWalletData;
      if (parsed?.wallet?.availableBalance !== undefined && Array.isArray(parsed.transactions)) {
        return parsed;
      }
    }
  } catch {}
  const fresh = defaultMockWallet(role);
  try {
    localStorage.setItem(walletKey(userKey), JSON.stringify(fresh));
  } catch {}
  return fresh;
}

export function saveMockWallet(userKey: string, data: MockWalletData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(walletKey(userKey), JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  } catch {}
}

export function resetMockWallet(userKey: string, role: string | null): MockWalletData {
  const fresh = defaultMockWallet(role);
  saveMockWallet(userKey, fresh);
  return fresh;
}

function toNum(v: string | number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** إيداع محلي */
export function mockDeposit(data: MockWalletData, amount: number, label: string): MockWalletData {
  // أولوية تسوية العمولة المستحقة (مطابق للقاعدة المالية)
  let due = toNum(data.commissionDue || 0);
  let remaining = amount;
  let settled = 0;
  if (due > 0 && remaining > 0) {
    settled = Math.min(due, remaining);
    due = due - settled;
    remaining = remaining - settled;
  }
  const current = toNum(data.wallet.availableBalance);
  const after = current + remaining;
  const tx: MockTransaction = {
    id: uid("tx"),
    type: "credit",
    amount: fmt(amount),
    balanceAfter: fmt(after),
    description:
      settled > 0
        ? `إيداع ${label} — صافي ${fmt(remaining)} بعد تسوية مستحقات ${fmt(settled)}`
        : `إيداع ${label}`,
    createdAt: new Date().toISOString(),
  };
  return {
    wallet: { ...data.wallet, availableBalance: fmt(after) },
    transactions: [tx, ...data.transactions].slice(0, 50),
    commissionDue: fmt(due),
    updatedAt: new Date().toISOString(),
  };
}

/** سحب محلي */
export function mockWithdraw(data: MockWalletData, amount: number, label: string): { data: MockWalletData; error?: string } {
  const current = toNum(data.wallet.availableBalance);
  if (amount <= 0) return { data, error: "أدخل مبلغاً صالحاً أكبر من صفر" };
  if (amount > current) return { data, error: `الرصيد غير كاف — المتاح ${fmt(current)} ج.س` };
  const after = current - amount;
  const tx: MockTransaction = {
    id: uid("tx"),
    type: "debit",
    amount: fmt(amount),
    balanceAfter: fmt(after),
    description: `سحب ${label}`,
    createdAt: new Date().toISOString(),
  };
  return {
    data: {
      wallet: { ...data.wallet, availableBalance: fmt(after) },
      transactions: [tx, ...data.transactions].slice(0, 50),
      commissionDue: data.commissionDue,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** تحويل محلي */
export function mockTransfer(data: MockWalletData, amount: number, target: string): { data: MockWalletData; error?: string } {
  const current = toNum(data.wallet.availableBalance);
  if (amount <= 0) return { data, error: "أدخل مبلغاً صالحاً أكبر من صفر" };
  if (!target.trim()) return { data, error: "أدخل رقم/حساب المستلم" };
  if (amount > current) return { data, error: `الرصيد غير كاف — المتاح ${fmt(current)} ج.س` };
  const after = current - amount;
  const tx: MockTransaction = {
    id: uid("tx"),
    type: "debit",
    amount: fmt(amount),
    balanceAfter: fmt(after),
    description: `تحويل إلى ${target.trim()} 📤`,
    createdAt: new Date().toISOString(),
  };
  return {
    data: {
      wallet: { ...data.wallet, availableBalance: fmt(after) },
      transactions: [tx, ...data.transactions].slice(0, 50),
      commissionDue: data.commissionDue,
      updatedAt: new Date().toISOString(),
    },
  };
}
