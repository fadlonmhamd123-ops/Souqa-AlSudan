import BrandLogo from "@/components/BrandLogo";

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto flex justify-center animate-pulse">
          <BrandLogo variant="stacked" size={140} href={null} priority />
        </div>
        <p className="mt-3 text-sm font-bold text-slate-500">جاري التحميل...</p>
      </div>
    </div>
  );
}
