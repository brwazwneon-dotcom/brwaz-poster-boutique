import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trackOrderPublic, type TrackedOrder } from "@/lib/db-orders.functions";
import { CheckCircle2, Clock, Package, Truck, XCircle, Search } from "lucide-react";

export const Route = createFileRoute("/track-order")({
  head: () => ({
    meta: [
      { title: "Track Your Order — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Check the status of your BRWAZWNEON order." },
    ],
  }),
  component: TrackOrderPage,
});

const STATUS_ICON: Record<string, typeof Package> = {
  new: Clock,
  confirmed: CheckCircle2,
  processing: Package,
  shipped: Truck,
  delivered: CheckCircle2,
  cancelled: XCircle,
  returned: XCircle,
};

function TrackOrderPage() {
  const { t } = useTranslation();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<TrackedOrder | null | "not_found">(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const found = await trackOrderPublic({ data: { orderNumber: orderNumber.trim(), phone: phone.trim() } });
      setResult(found ?? "not_found");
    } finally {
      setLoading(false);
    }
  };

  const StatusIcon = result && result !== "not_found" ? (STATUS_ICON[result.status] ?? Package) : Package;

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md">
        <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          {t("trackOrder.kicker")}
        </p>
        <h1 className="text-display mt-3 text-4xl sm:text-5xl">{t("trackOrder.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("trackOrder.description")}</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              {t("trackOrder.orderNumber")}
            </label>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="BRW-1001"
              className="w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              {t("trackOrder.phone")}
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              type="tel"
              className="w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {loading ? t("trackOrder.searching") : t("trackOrder.search")}
          </button>
        </form>

        {result === "not_found" && (
          <div className="mt-8 rounded-sm border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
            {t("trackOrder.notFound")}
          </div>
        )}

        {result && result !== "not_found" && (
          <div className="mt-8 rounded-sm border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <StatusIcon className="h-8 w-8 text-primary" />
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {result.order_number}
                </div>
                <div className="text-display text-2xl capitalize">
                  {t(`trackOrder.status.${result.status}`, result.status)}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm text-muted-foreground">
              <div>{result.item_label}</div>
              <div>{result.total_price} {t("egp")}</div>
              <div>{new Date(result.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
