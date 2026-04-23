import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200/70 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 shadow-sm p-6 md:p-8 text-center backdrop-blur">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center">
            <Image src="/CG-LOGO.svg" alt="CustomGear logo" width={44} height={44} className="object-contain" priority />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold gradient-text">CustomGear Tracking</h1>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Enter your order code (for example `CG2001`) to see shipment status.
        </p>
        <div className="mt-6">
          <Link
            href="/customgear/track"
            className="inline-flex items-center justify-center rounded-xl px-5 py-3 bg-gradient-to-r from-violet-600 to-sky-500 text-white font-semibold hover:opacity-90 transition"
          >
            Track shipment
          </Link>
        </div>
      </div>
    </div>
  );
}

