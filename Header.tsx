import Link from "next/link";
import { getSession } from "@/lib/auth";
import HeaderAuth from "./HeaderAuth";
import BrandLogo from "./BrandLogo";

export default async function Header() {
  const user = await getSession();
  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <BrandLogo variant="horizontal" size={42} priority />
        <nav className="hidden items-center gap-1 text-sm font-bold text-slate-600 md:flex">
          <Link href="/" className="rounded-lg px-3 py-2 hover:bg-slate-100">الرئيسية</Link>
          <Link href="/market" className="rounded-lg px-3 py-2 hover:bg-slate-100">السوق</Link>
          <Link href="/orders" className="rounded-lg px-3 py-2 hover:bg-slate-100">طلباتي</Link>
          <Link href="/verify" className="rounded-lg px-3 py-2 hover:bg-slate-100">تحقق من إيصال</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/cart" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl transition hover:bg-slate-200" aria-label="السلة">
            🛒
          </Link>
          <HeaderAuth serverName={user?.name || null} serverRole={user?.role || null} />
        </div>
      </div>
    </header>
  );
}
