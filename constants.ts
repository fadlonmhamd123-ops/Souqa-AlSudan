export const PLATFORM_COMMISSION_RATE = 0.05;
export const DELAY_PENALTY_RATE = 0.05;
export const SAME_STATE_DEADLINE_DAYS = 3;
export const CROSS_STATE_DEADLINE_DAYS = 14;
export const GRACE_PERIOD_HOURS = 48;
export const CURRENCY = "SDG";
export const CURRENCY_AR = "ج.س";

export const ORDER_STATUSES = [
  "PENDING",
  "NEGOTIATING",
  "ACCEPTED",
  "PROCESSING",
  "READY_FOR_SHIPPING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_MERCHANT",
  "MERCHANT_FAILED_TO_FULFILL",
  "DISPUTED",
] as const;

export const ORDER_STATUS_AR: Record<string, string> = {
  PENDING: "بانتظار القبول",
  NEGOTIATING: "قيد التفاوض",
  ACCEPTED: "مقبول",
  PROCESSING: "قيد التجهيز",
  READY_FOR_SHIPPING: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  OUT_FOR_DELIVERY: "خارج للتوصيل",
  DELIVERED: "تم التوصيل",
  RECEIVED: "تم الاستلام",
  COMPLETED: "مكتمل",
  CANCELLED_BY_CUSTOMER: "ملغي من الزبون",
  CANCELLED_BY_MERCHANT: "ملغي من التاجر",
  MERCHANT_FAILED_TO_FULFILL: "تعذر التنفيذ",
  DISPUTED: "متنازع عليه",
};

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["NEGOTIATING", "ACCEPTED", "CANCELLED_BY_CUSTOMER", "DISPUTED"],
  NEGOTIATING: ["ACCEPTED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_MERCHANT"],
  ACCEPTED: ["PROCESSING", "CANCELLED_BY_MERCHANT", "MERCHANT_FAILED_TO_FULFILL", "DISPUTED"],
  PROCESSING: ["READY_FOR_SHIPPING", "MERCHANT_FAILED_TO_FULFILL", "DISPUTED"],
  READY_FOR_SHIPPING: ["SHIPPED", "DISPUTED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DISPUTED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["RECEIVED", "DISPUTED"],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_MERCHANT: [],
  MERCHANT_FAILED_TO_FULFILL: [],
  DISPUTED: ["ACCEPTED", "CANCELLED_BY_MERCHANT", "COMPLETED"],
};

export const SUDAN_STATES = [
  "الخرطوم", "الجزيرة", "البحر الأحمر", "كسلا", "القضارف", "سنار",
  "النيل الأبيض", "النيل الأزرق", "الشمالية", "نهر النيل", "غرب كردفان",
  "جنوب كردفان", "شمال كردفان", "شرق دارفور", "جنوب دارفور", "غرب دارفور",
  "وسط دارفور", "شمال دارفور",
];

export const INSPECTION_DECISIONS = {
  APPROVED: "APPROVED",
  NEEDS_MORE_INFO: "NEEDS_MORE_INFO",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  REJECTED: "REJECTED",
} as const;
