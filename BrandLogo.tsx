import Image from "next/image";
import Link from "next/link";

export const BRAND = {
  name: "متجرك",
  tagline: "سهولة التسوق في تطبيقك",
  logoFull: "/brand/matjarak-logo-full.png",
  icon: "/brand/matjarak-icon.png",
};

type Variant = "icon" | "horizontal" | "stacked";

interface Props {
  /** icon = عربة فقط | horizontal = عربة + اسم (للهيدر) | stacked = الشعار الكامل (للدخول/الهوية) */
  variant?: Variant;
  size?: number;
  href?: string | null;
  className?: string;
  priority?: boolean;
  showTagline?: boolean;
}

/**
 * شعار متجرك الرسمي — خلفية بيضاء نقية، حواف ناعمة، واضح على كل الشاشات.
 */
export default function BrandLogo({
  variant = "horizontal",
  size,
  href = "/",
  className = "",
  priority = false,
  showTagline = true,
}: Props) {
  let content: React.ReactNode;

  if (variant === "icon") {
    const s = size ?? 40;
    content = (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm ${className}`}
        style={{ width: s, height: s }}
      >
        <Image src={BRAND.icon} alt={BRAND.name} width={s} height={s} priority={priority} className="brand-logo-img h-full w-full object-contain" />
      </span>
    );
  } else if (variant === "stacked") {
    const s = size ?? 160;
    content = (
      <span className={`inline-flex items-center justify-center rounded-3xl bg-white p-2 ring-1 ring-slate-200/70 shadow-sm ${className}`}>
        <Image
          src={BRAND.logoFull}
          alt={`${BRAND.name} — ${BRAND.tagline}`}
          width={s}
          height={s}
          priority={priority}
          className="brand-logo-img h-auto w-full object-contain"
          style={{ maxWidth: s }}
        />
      </span>
    );
  } else {
    const s = size ?? 40;
    content = (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span
          className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm"
          style={{ width: s, height: s }}
        >
          <Image src={BRAND.icon} alt="" width={s} height={s} priority={priority} className="brand-logo-img h-full w-full object-contain" />
        </span>
        <span className="leading-none">
          <span className="block text-[19px] font-black tracking-tight text-[#1F3F8F] md:text-[21px]">
            {BRAND.name}
          </span>
          {showTagline && (
            <span className="brand-tagline mt-0.5 block text-[10px] font-semibold text-slate-500 md:text-[11px]">
              {BRAND.tagline}
            </span>
          )}
        </span>
      </span>
    );
  }

  if (!href) return content;
  return (
    <Link href={href} aria-label={`${BRAND.name} — الرئيسية`} className="inline-flex items-center">
      {content}
    </Link>
  );
}
