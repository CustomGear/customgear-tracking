"use client";

import { useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { Loader2, PackageSearch, AlertCircle } from "lucide-react";

type TrackingResult = {
  customerName: string;
  destination: string;
  status: string;
  estimatedDelivery: string;
  progressKey: "production" | "transit" | "local" | "outfordelivery" | "delivered";
  message: string;
  eta: string;
};

export default function CustomGearTrackPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackingResult | null>(null);

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);

  const canSubmit = normalizedCode.length > 0 && /^CG\d+$/i.test(normalizedCode);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!canSubmit) {
      setError("Enter a valid code like CG2001.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/customgear/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } & Partial<TrackingResult>;
      if (!res.ok) {
        throw new Error(data?.error || "Tracking lookup failed.");
      }

      setResult({
        customerName: String(data.customerName || ""),
        destination: String(data.destination || ""),
        status: String(data.status || ""),
        estimatedDelivery: String(data.estimatedDelivery || ""),
        progressKey: (data.progressKey as TrackingResult["progressKey"]) || "production",
        message: String(data.message || data.status || ""),
        eta: String(data.eta || ""),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracking lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  const friendlyError = (() => {
    if (!error) return null;
    if (error.startsWith("Google Sheet unreachable")) return "We couldn't reach the order lookup service right now. Please try again in a moment.";
    if (error.startsWith("UPS unreachable")) return "We couldn't reach UPS tracking right now. Please try again in a moment.";
    if (error.startsWith("UPS tracking is not configured")) return "Tracking is currently unavailable. Please contact support.";
    if (error.includes("Google Sheet lookup failed")) return "We couldn't access your tracking details right now. Please try again later.";
    return error;
  })();

  function prettyStatus(key: TrackingResult["progressKey"]) {
    switch (key) {
      case "production":
        return "In Production";
      case "transit":
        return "In Transit";
      case "local":
        return "Arrived Locally";
      case "outfordelivery":
        return "Out for Delivery";
      case "delivered":
        return "Delivered";
      default:
        return "In Progress";
    }
  }

  function dotColorClass(key: TrackingResult["progressKey"]) {
    switch (key) {
      case "production":
        return "bg-[#d89b00]";
      case "transit":
        return "bg-[#1e88e5]";
      case "local":
        return "bg-[#7b61ff]";
      case "outfordelivery":
        return "bg-[#ff6a00]";
      case "delivered":
        return "bg-[#1f9d55]";
      default:
        return "bg-slate-400";
    }
  }

  const stepIndex: Record<TrackingResult["progressKey"], number> = {
    production: 0,
    transit: 1,
    local: 2,
    outfordelivery: 3,
    delivered: 4,
  };

  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
              <Image
                src="/CG-LOGO.svg"
                alt="CustomGear logo"
                width={56}
                height={56}
                className="object-contain"
                priority
              />
            </div>
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold gradient-text">CustomGear Order Tracking</h1>
          <p className="mt-1 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Enter your client code (example `CG2001`) to see live shipment progress.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 shadow-sm p-5 sm:p-6 backdrop-blur">
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="order-code">
              Client code
            </label>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="order-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. CG2001"
                inputMode="text"
                autoComplete="off"
                className="flex-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 bg-gradient-to-r from-violet-600 to-sky-500 text-white font-semibold hover:opacity-90 transition disabled:opacity-60 disabled:hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageSearch className="w-4 h-4" />}
                Track
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              We never display the UPS tracking number or origin details on the customer view.
            </p>
          </form>

          {friendlyError && (
            <div className="mt-5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div className="text-sm font-medium text-rose-800 dark:text-rose-200">{friendlyError}</div>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-6">
              <div className="flex items-center justify-center gap-3 text-slate-700 dark:text-slate-200">
                <Loader2 className="w-5 h-5 animate-spin" />
                Fetching live UPS shipment status…
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="mt-6 rounded-2xl border border-slate-200/70 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
                <div className="min-w-[220px]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Customer</div>
                  <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">{result.customerName}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">{result.destination}</div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-slate-200/60 dark:bg-slate-700/50">
                  <span className={`w-2.5 h-2.5 rounded-full ${dotColorClass(result.progressKey)}`} />
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{prettyStatus(result.progressKey)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Destination</div>
                  <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">{result.destination}</div>
                </div>

                {result.eta ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Estimated Delivery</div>
                    <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">{result.eta}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-900/30 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Estimated Delivery</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Unavailable</div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-4 mb-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Shipment Status</div>
                <div className="text-base sm:text-[15px] font-semibold text-slate-900 dark:text-white">{result.message || prettyStatus(result.progressKey)}</div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="mt-4 mb-3 text-sm font-bold text-slate-900 dark:text-white">Order Progress</div>

                {(
                  [
                    { key: "production", title: "In Production", desc: "Your order is being prepared." },
                    { key: "transit", title: "In Transit", desc: "Your shipment is moving through the shipping network." },
                    { key: "local", title: "Arrived Locally", desc: "Your shipment has reached the destination area." },
                    { key: "outfordelivery", title: "Out for Delivery", desc: "Your order is on the final stretch." },
                    { key: "delivered", title: "Delivered", desc: "Your shipment has arrived." },
                  ] as Array<{ key: TrackingResult["progressKey"]; title: string; desc: string }>
                ).map((s, idx) => {
                  const current = stepIndex[result.progressKey] ?? 0;
                  const done = idx <= current;
                  const iconClass = done ? dotColorClass(s.key) : "bg-slate-300 dark:bg-slate-600";

                  return (
                    <div key={s.key} className="flex items-start gap-3 mb-4 last:mb-0">
                      <span className={`mt-0.5 w-[18px] h-[18px] rounded-full ${iconClass}`} />
                      <div>
                        <div className="font-bold text-[15px] text-slate-900 dark:text-white">{s.title}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{s.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

