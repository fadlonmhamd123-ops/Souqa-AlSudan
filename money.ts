/** Decimal-safe money helpers for SDG. All amounts stored as NUMERIC strings. */
const B100 = BigInt(100);
const B10000 = BigInt(10000);
const B0 = BigInt(0);

export function toCents(amount: string | number): bigint {
  const s = String(amount);
  const [whole, frac = ""] = s.split(".");
  const padded = (frac + "00").slice(0, 2);
  const neg = whole.trim().startsWith("-");
  const w = BigInt(whole.replace("-", "") || "0");
  const f = BigInt(padded || "0");
  const v = w * B100 + f;
  return neg ? -v : v;
}

export function fromCents(cents: bigint): string {
  const neg = cents < B0;
  const abs = neg ? -cents : cents;
  const w = abs / B100;
  const f = (abs % B100).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${w.toString()}.${f}`;
}

export function add(a: string | number, b: string | number): string {
  return fromCents(toCents(a) + toCents(b));
}
export function sub(a: string | number, b: string | number): string {
  return fromCents(toCents(a) - toCents(b));
}
export function mulRate(amount: string | number, rate: number): string {
  const cents = toCents(amount);
  const scaled = BigInt(Math.round(rate * 10000));
  const result = (cents * scaled) / B10000;
  return fromCents(result);
}
export function cmp(a: string | number, b: string | number): number {
  const x = toCents(a);
  const y = toCents(b);
  return x === y ? 0 : x > y ? 1 : -1;
}
export function minOf(a: string, b: string): string {
  return cmp(a, b) <= 0 ? a : b;
}
export function maxOf(a: string, b: string): string {
  return cmp(a, b) >= 0 ? a : b;
}
export function isZero(a: string | number): boolean {
  return toCents(a) === B0;
}
export function isPositive(a: string | number): boolean {
  return toCents(a) > B0;
}

export function formatSDG(amount: string | number, locale: "ar" | "en" = "ar"): string {
  const n = Number(amount);
  try {
    const formatted = n.toLocaleString(locale === "ar" ? "ar-SD" : "en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return locale === "ar" ? `${formatted} ج.س` : `SDG ${formatted}`;
  } catch {
    return locale === "ar" ? `${n} ج.س` : `SDG ${n}`;
  }
}
