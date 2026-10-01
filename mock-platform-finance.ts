/**
 * Mock Platform Finance — بيانات مالية تجريبية للوحة الأدمن
 * تظهر فوراً أثناء المعاينة، ومحفوظة في LocalStorage (قرارات السحب).
 */

export interface MockLedgerEntry {
  id: string;
  entryType: string;
  entryTypeAr: string;
  debitLabel: string;
  creditLabel: string;
  amount: string;
  description: string;
  createdAt: string;
}

export interface MockWithdrawal {
  id: string;
  merchantName: string;
  merchantPhone: string;
  storeName: string;
  amount: string;
  method: string;
  methodAr: string;
  accountDetails: string;
  status: "pending" | "approved" | "rejected" | "paid";
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  isMock: true;
}

export interface MockPlatformFinance {
  platformWallet: {
    availableBalance: string;
    pendingBalance: string;
    lockedBalance: string;
  };
  earnings: {
    totalCommissions: string;
    settledCommissions: string;
    dueCommissions: string;
    penalties: string;
    thisMonth: string;
    ordersSettled: number;
  };
  escrow: {
    balance: string;
    ordersCount: number;
  };
  ledger: MockLedgerEntry[];
  withdrawals: MockWithdrawal[];
}

const STORE_KEY = "matjarak_mock_platform_finance";
const WITHDRAWAL_OVERRIDES_KEY = "matjarak_mock_withdrawal_decisions";

function now(offsetMinutes = 0): string {
  return new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
}

function uid(prefix: string): string {
  return `${prefix}-mock-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultMockPlatformFinance(): MockPlatformFinance {
  return {
    platformWallet: {
      availableBalance: "312450.00",
      pendingBalance: "48200.00",
      lockedBalance: "15000.00",
    },
    earnings: {
      totalCommissions: "312450.00",
      settledCommissions: "289300.00",
      dueCommissions: "23150.00",
      penalties: "8750.00",
      thisMonth: "96400.00",
      ordersSettled: 214,
    },
    escrow: {
      balance: "186500.00",
      ordersCount: 37,
    },
    ledger: [
      {
        id: uid("le"),
        entryType: "commission",
        entryTypeAr: "عمولة منصة 5%",
        debitLabel: "تاجر — متجر الخرطوم",
        creditLabel: "منصة متجرك",
        amount: "2250.00",
        description: "عمولة طلب ORD-K3M9X2 (قيمة المنتج 45,000)",
        createdAt: now(35),
      },
      {
        id: uid("le"),
        entryType: "sale_settlement",
        entryTypeAr: "تسوية بيع",
        debitLabel: "زبون — أحمد",
        creditLabel: "تاجر — متجر الخرطوم",
        amount: "42750.00",
        description: "تسوية طلب ORD-K3M9X2 — صافي بعد العمولة",
        createdAt: now(36),
      },
      {
        id: uid("le"),
        entryType: "commission_due_settlement",
        entryTypeAr: "تسوية مستحقات",
        debitLabel: "تاجر — متجر النور",
        creditLabel: "منصة متجرك",
        amount: "5000.00",
        description: "أولوية السداد: خصم من إيداع التاجر",
        createdAt: now(60 * 4),
      },
      {
        id: uid("le"),
        entryType: "delay_penalty",
        entryTypeAr: "غرامة تأخير 5%",
        debitLabel: "تاجر — متجر الجزيرة",
        creditLabel: "منصة متجرك",
        amount: "1875.00",
        description: "غرامة تأخير غير مبرر — طلب ORD-K1Z8Q4",
        createdAt: now(60 * 9),
      },
      {
        id: uid("le"),
        entryType: "commission",
        entryTypeAr: "عمولة منصة 5%",
        debitLabel: "تاجر — متجر النور",
        creditLabel: "منصة متجرك",
        amount: "3125.00",
        description: "عمولة طلب ORD-K2P4Q8 (دفع إلكتروني)",
        createdAt: now(60 * 26),
      },
      {
        id: uid("le"),
        entryType: "sale_settlement",
        entryTypeAr: "تسوية بيع",
        debitLabel: "زبون — سارة",
        creditLabel: "تاجر — متجر النور",
        amount: "59375.00",
        description: "تسوية طلب ORD-K2P4Q8 — صافي بعد العمولة",
        createdAt: now(60 * 27),
      },
      {
        id: uid("le"),
        entryType: "withdrawal_payout",
        entryTypeAr: "صرف سحب تاجر",
        debitLabel: "تاجر — متجر أمدرمان",
        creditLabel: "بنكك — 091****123",
        amount: "60000.00",
        description: "سحب أرباح معتمد من الإدارة ✅",
        createdAt: now(60 * 50),
      },
      {
        id: uid("le"),
        entryType: "refund",
        entryTypeAr: "استرداد زبون",
        debitLabel: "منصة متجرك (ضمان)",
        creditLabel: "زبون — محمد",
        amount: "12500.00",
        description: "استرداد تلقائي — طلب ملغي قبل القبول",
        createdAt: now(60 * 75),
      },
    ],
    withdrawals: [
      {
        id: uid("wd"),
        merchantName: "متجر الخرطوم للتجارة",
        merchantPhone: "0900000001",
        storeName: "متجر الخرطوم 🇸🇩",
        amount: "85000.00",
        method: "bankak",
        methodAr: "بنكك 📱",
        accountDetails: "0912345678 — باسم المتجر",
        status: "pending",
        adminNote: null,
        createdAt: now(60 * 2),
        decidedAt: null,
        isMock: true,
      },
      {
        id: uid("wd"),
        merchantName: "متجر النور",
        merchantPhone: "0911111111",
        storeName: "متجر النور ✨",
        amount: "42000.00",
        method: "ocash",
        methodAr: "أو-كاش 💳",
        accountDetails: "0922222222",
        status: "pending",
        adminNote: null,
        createdAt: now(60 * 7),
        decidedAt: null,
        isMock: true,
      },
      {
        id: uid("wd"),
        merchantName: "متجر أمدرمان",
        merchantPhone: "0922222222",
        storeName: "سوق أمدرمان 🛍️",
        amount: "60000.00",
        method: "bankak",
        methodAr: "بنكك 📱",
        accountDetails: "091****123",
        status: "paid",
        adminNote: "تم التحويل بنجاح ✅",
        createdAt: now(60 * 52),
        decidedAt: now(60 * 50),
        isMock: true,
      },
      {
        id: uid("wd"),
        merchantName: "متجر الجزيرة",
        merchantPhone: "0933333333",
        storeName: "الجزيرة ستور 🌾",
        amount: "15000.00",
        method: "fawry",
        methodAr: "فوري 🏦",
        accountDetails: "حساب 445566",
        status: "rejected",
        adminNote: "الرصيد المتاح لا يغطي المبلغ بعد خصم العمولة المستحقة",
        createdAt: now(60 * 90),
        decidedAt: now(60 * 80),
        isMock: true,
      },
    ],
  };
}

/** قرارات السحب المحفوظة محلياً (تبقى بعد التحديث) */
type DecisionMap = Record<string, { status: MockWithdrawal["status"]; adminNote: string | null; decidedAt: string }>;

function loadDecisions(): DecisionMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(WITHDRAWAL_OVERRIDES_KEY) || "{}") as DecisionMap;
  } catch {
    return {};
  }
}

export function saveWithdrawalDecision(id: string, status: MockWithdrawal["status"], adminNote: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadDecisions();
    all[id] = { status, adminNote, decidedAt: new Date().toISOString() };
    localStorage.setItem(WITHDRAWAL_OVERRIDES_KEY, JSON.stringify(all));
  } catch {}
}

function stableMockId(seed: string): string {
  // معرّفات ثابتة حتى تبقى القرارات المحلية مرتبطة بها بعد التحديث
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `wd-mock-${h.toString(36)}`;
}

export function loadMockPlatformFinance(): MockPlatformFinance {
  const fresh = defaultMockPlatformFinance();
  // ثبّت معرّفات السحب التجريبية
  fresh.withdrawals = fresh.withdrawals.map((w, i) => ({
    ...w,
    id: stableMockId(`withdrawal-${i}-${w.merchantName}`),
  }));
  // طبّق القرارات المحفوظة
  if (typeof window !== "undefined") {
    const decisions = loadDecisions();
    fresh.withdrawals = fresh.withdrawals.map((w) => {
      const d = decisions[w.id];
      if (d) return { ...w, status: d.status, adminNote: d.adminNote, decidedAt: d.decidedAt };
      return w;
    });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ cachedAt: new Date().toISOString() }));
    } catch {}
  }
  return fresh;
}
