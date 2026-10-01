import { createHash } from "crypto";

export interface SecurityQuestionDef {
  key: string;
  ar: string;
  en: string;
  placeholderAr: string;
}

export const SECURITY_QUESTIONS: SecurityQuestionDef[] = [
  {
    key: "first_school",
    ar: "ما اسم أول مدرسة درست بها؟",
    en: "What was the name of your first school?",
    placeholderAr: "مثال: مدرسة النور الابتدائية",
  },
  {
    key: "old_phone",
    ar: "ما اسم نوع الهاتف القديم الذي كنت تستعمله؟",
    en: "What was your old phone model?",
    placeholderAr: "مثال: نوكيا 105 / سامسونج",
  },
  {
    key: "birth_city",
    ar: "في أي مدينة وُلدت؟",
    en: "In which city were you born?",
    placeholderAr: "مثال: الخرطوم",
  },
  {
    key: "mother_name",
    ar: "ما الاسم الأول لوالدتك؟",
    en: "What is your mother's first name?",
    placeholderAr: "مثال: فاطمة",
  },
  {
    key: "fav_food",
    ar: "ما هي وجبتك السودانية المفضلة؟",
    en: "What is your favourite Sudanese meal?",
    placeholderAr: "مثال: عصيدة / كسرة",
  },
  {
    key: "first_pet",
    ar: "ما اسم أول حيوان أليف امتلكته؟",
    en: "What was the name of your first pet?",
    placeholderAr: "مثال: لولو",
  },
];

export function getQuestionByKey(key: string): SecurityQuestionDef | undefined {
  return SECURITY_QUESTIONS.find((q) => q.key === key);
}

function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

export function hashSecurityAnswer(answer: string): string {
  const norm = normalizeAnswer(answer);
  return createHash("sha256")
    .update(norm + (process.env.OTP_PEPPER || "matjarak-otp") + ":secq")
    .digest("hex");
}

export function verifySecurityAnswer(answer: string, hash: string): boolean {
  try {
    return hashSecurityAnswer(answer) === hash;
  } catch {
    return false;
  }
}

export function validateSecurityQuestionsInput(
  input: Array<{ questionKey: string; answer: string }>
): { ok: boolean; error?: string } {
  if (!Array.isArray(input) || input.length < 2) {
    return { ok: false, error: "اختر سؤالي أمان على الأقل مع إجاباتهما" };
  }
  const keys = input.map((i) => i.questionKey);
  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: "أسئلة الأمان يجب أن تكون مختلفة" };
  }
  for (const item of input) {
    const def = getQuestionByKey(item.questionKey);
    if (!def) return { ok: false, error: "سؤال أمان غير صالح" };
    if (!item.answer || String(item.answer).trim().length < 2) {
      return { ok: false, error: `أدخل إجابة صحيحة لسؤال: ${def.ar}` };
    }
    if (String(item.answer).trim().length > 100) {
      return { ok: false, error: "الإجابة طويلة جداً (100 حرف كحد أقصى)" };
    }
  }
  return { ok: true };
}
