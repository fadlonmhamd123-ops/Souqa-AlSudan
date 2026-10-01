"use client";
import { SECURITY_QUESTIONS } from "@/lib/security-questions";

export interface SecQItem {
  questionKey: string;
  answer: string;
}

interface Props {
  value: SecQItem[];
  onChange: (v: SecQItem[]) => void;
  minRequired?: number;
}

export default function SecurityQuestionsInput({ value, onChange, minRequired = 2 }: Props) {
  const setItem = (idx: number, patch: Partial<SecQItem>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const addItem = () => {
    if (value.length >= 3) return;
    const used = new Set(value.map((v) => v.questionKey));
    const nextQ = SECURITY_QUESTIONS.find((q) => !used.has(q.key));
    if (!nextQ) return;
    onChange([...value, { questionKey: nextQ.key, answer: "" }]);
  };

  const removeItem = (idx: number) => {
    if (value.length <= minRequired) return;
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/60 p-4">
      <p className="text-sm font-black">
        🔐 أسئلة الأمان <span className="text-red-500">*</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        مطلوبة لاستعادة كلمة المرور — اختر سؤالين مختلفين على الأقل وأجب عليهما. تُحفظ الإجابات مشفرة ولا
        تظهر لأي شخص.
      </p>
      <div className="mt-3 space-y-3">
        {value.map((item, idx) => {
          const def = SECURITY_QUESTIONS.find((q) => q.key === item.questionKey);
          return (
            <div key={idx} className="rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-600">السؤال {idx + 1}</label>
                {value.length > minRequired && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-xs font-bold text-red-500"
                  >
                    حذف ✕
                  </button>
                )}
              </div>
              <select
                value={item.questionKey}
                onChange={(e) => setItem(idx, { questionKey: e.target.value })}
                className="input-field mt-2"
              >
                {SECURITY_QUESTIONS.map((q) => (
                  <option
                    key={q.key}
                    value={q.key}
                    disabled={value.some((v, i) => i !== idx && v.questionKey === q.key)}
                  >
                    {q.ar}
                  </option>
                ))}
              </select>
              <input
                value={item.answer}
                onChange={(e) => setItem(idx, { answer: e.target.value })}
                placeholder={def?.placeholderAr || "أدخل إجابتك"}
                className="input-field mt-2"
                maxLength={100}
              />
            </div>
          );
        })}
      </div>
      {value.length < 3 && (
        <button
          type="button"
          onClick={addItem}
          className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-200 p-2 text-xs font-black text-slate-500"
        >
          + إضافة سؤال ثالث (اختياري — أمان أعلى)
        </button>
      )}
    </div>
  );
}
