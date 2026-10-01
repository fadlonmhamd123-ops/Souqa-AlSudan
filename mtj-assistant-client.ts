/* Client-safe MTJ assistant helpers (no db imports) */

export const SUGGESTED_PROMPTS: Record<string, string[]> = {
  buyer: [
    "كم رصيد محفظتي؟",
    "وين طلبي؟",
    "عايز أتفاوض في السعر، كيف؟",
    "كيف أدفع ببنكك؟",
    "داير أتكلم مع موظف",
  ],
  merchant: [
    "كم أرباحي ورصيدي؟",
    "كم العمولة المستحقة علي؟",
    "كيف أسحب أرباحي؟",
    "منتجي اترفض في الفحص، ليه؟",
    "عايز أتكلم مع الدعم",
  ],
  guest: [
    "ما هي عمولة متجرك؟",
    "كم مهلة التوصيل بين الولايات؟",
    "كيف أشتري من المتجر؟",
    "كيف أتواصل واتساب؟",
  ],
};

export function promptsFor(role: string): string[] {
  if (role === "merchant") return SUGGESTED_PROMPTS.merchant;
  if (role === "admin" || role === "super_admin") return SUGGESTED_PROMPTS.merchant;
  if (role === "buyer") return SUGGESTED_PROMPTS.buyer;
  return SUGGESTED_PROMPTS.guest;
}
