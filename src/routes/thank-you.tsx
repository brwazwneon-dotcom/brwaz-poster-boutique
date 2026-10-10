import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, MessageCircle, PackageSearch, Phone, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Ltr } from "@/components/Ltr";
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";
import { firstNameOf, orderNumberRange, readLastOrder, type LastOrder } from "@/lib/last-order";

export const Route = createFileRoute("/thank-you")({
  head: () => ({
    meta: [{ title: "Thank you — BRWAZWNEON" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ThankYouPage,
});

type Step = { title: string; body: string };

function ThankYouPage() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "ar").startsWith("ar");
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOrder(readLastOrder());
    // One frame later so the entrance transition actually plays.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const first = order ? firstNameOf(order.name) : "";
  const numbers = order?.numbers ?? [];

  const copy = isAr
    ? {
        eyebrow: "تم استلام طلبك",
        title: first ? `شكراً لك يا ${first}` : "شكراً لك",
        lead: "طلبك وصلنا وبدأنا نراجعه. هنتواصل معاك قريباً على تليفونك لتأكيد الأوردر وتفاصيل التوصيل.",
        keepPhone: "من فضلك خلي تليفونك قريب منك.",
        orderNo: "رقم الطلب",
        items: "عدد القطع",
        total: "الإجمالي",
        payment: "الدفع",
        city: "المحافظة",
        cod: "الدفع عند الاستلام",
        instapay: "إنستا باي",
        egp: "جنيه",
        next: "اللي هيحصل بعد كده",
        steps: [
          { title: "تم استلام طلبك", body: "سجلنا الأوردر بكل تفاصيله." },
          { title: "مكالمة تأكيد", body: "هنتصل بيك قريباً لتأكيد البيانات والمقاسات." },
          { title: "تجهيز وطباعة", body: "بنطبع بوستراتك ونركّبها في البراويز بعناية." },
          { title: "التوصيل", body: "بنوصّلها لحد باب البيت في كل أنحاء مصر." },
        ] as Step[],
        change: "عايز تعدّل حاجة في طلبك؟ كلمنا على واتساب ونظبطها معاك.",
        shop: "كمّل تسوق",
        track: "تتبّع طلبك",
        whatsapp: "كلمنا على واتساب",
        copied: "تم نسخ رقم الطلب",
        copyLabel: "نسخ رقم الطلب",
      }
    : {
        eyebrow: "Order received",
        title: first ? `Thank you, ${first}` : "Thank you",
        lead: "We've got your order and we're already reviewing it. We'll contact you shortly on your phone to confirm the order and delivery details.",
        keepPhone: "Please keep your phone nearby.",
        orderNo: "Order number",
        items: "Pieces",
        total: "Total",
        payment: "Payment",
        city: "Governorate",
        cod: "Cash on delivery",
        instapay: "InstaPay",
        egp: "EGP",
        next: "What happens next",
        steps: [
          { title: "Order received", body: "Your order is saved with every detail." },
          {
            title: "Confirmation call",
            body: "We'll call you soon to confirm your details and sizes.",
          },
          { title: "Printing & framing", body: "Your posters are printed and framed with care." },
          { title: "Delivery", body: "Delivered to your door anywhere in Egypt." },
        ] as Step[],
        change: "Want to change something? Message us on WhatsApp and we'll sort it out.",
        shop: "Keep shopping",
        track: "Track your order",
        whatsapp: "Chat on WhatsApp",
        copied: "Order number copied",
        copyLabel: "Copy order number",
      };

  const waText = isAr
    ? `مرحباً برواز ونيون، بخصوص طلبي${numbers.length ? ` رقم ${orderNumberRange(numbers)}` : ""}`
    : `Hi BRWAZWNEON, about my order${numbers.length ? ` ${orderNumberRange(numbers)}` : ""}`;
  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

  const rise = (delay: number) => ({
    className: `transition-all duration-700 ease-out motion-reduce:transition-none ${
      ready ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 motion-reduce:opacity-100"
    }`,
    style: { transitionDelay: `${delay}ms` },
  });

  const facts: Array<{ label: string; value: React.ReactNode }> = [];
  if (order) {
    if (order.itemCount > 0) facts.push({ label: copy.items, value: <Ltr>{order.itemCount}</Ltr> });
    if (order.total !== null) {
      facts.push({
        label: copy.total,
        value: (
          <Ltr>
            {Math.round(order.total).toLocaleString("en-US")} {copy.egp}
          </Ltr>
        ),
      });
    }
    facts.push({
      label: copy.payment,
      value: order.paymentMethod === "instapay" ? copy.instapay : copy.cod,
    });
    if (order.governorate) facts.push({ label: copy.city, value: order.governorate });
  }

  return (
    <main
      dir={isAr ? "rtl" : "ltr"}
      className="container-page mx-auto max-w-3xl px-4 pb-20 pt-12 sm:pt-16"
    >
      <section className="text-center">
        <div
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground ring-8 ring-primary/15 transition-all duration-700 ease-out motion-reduce:transition-none ${
            ready
              ? "scale-100 opacity-100"
              : "scale-50 opacity-0 motion-reduce:scale-100 motion-reduce:opacity-100"
          }`}
          aria-hidden="true"
        >
          <Check className="h-10 w-10" strokeWidth={3} />
        </div>

        <div {...rise(120)}>
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            {copy.eyebrow}
          </p>
          <h1 className="text-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {copy.lead}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <Phone className="h-4 w-4" aria-hidden="true" />
            {copy.keepPhone}
          </p>
        </div>
      </section>

      {order && (numbers.length > 0 || facts.length > 0) && (
        <section
          aria-label={copy.orderNo}
          className={`mt-10 rounded-sm border border-border bg-card p-5 sm:p-6 ${rise(240).className}`}
          style={rise(240).style}
        >
          {numbers.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  {copy.orderNo}
                </div>
                <div className="mt-1 font-mono text-xl font-semibold tracking-wide">
                  <Ltr>{orderNumberRange(numbers)}</Ltr>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(orderNumberRange(numbers))
                    .then(() => toast.success(copy.copied))
                    .catch(() => undefined);
                }}
                aria-label={copy.copyLabel}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-sm border border-border px-3 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copy.copyLabel}
              </button>
            </div>
          )}
          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 sm:grid-cols-4">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      <section className={`mt-10 ${rise(360).className}`} style={rise(360).style}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          {copy.next}
        </h2>
        <ol className="mt-5 space-y-0">
          {copy.steps.map((step, i) => {
            const done = i === 0;
            const current = i === 1;
            return (
              <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
                {i < copy.steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 top-9 w-px bg-border ltr:left-[15px] rtl:right-[15px]"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : current
                        ? "border-primary bg-background text-foreground ring-4 ring-primary/20"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <div className="pt-0.5">
                  <div
                    className={`text-sm font-semibold ${done || current ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {step.title}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={`mt-10 ${rise(480).className}`} style={rise(480).style}>
        <p className="text-center text-sm text-muted-foreground">{copy.change}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Link
            to="/"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-sm bg-primary px-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {copy.shop}
          </Link>
          <Link
            to="/track-order"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-sm border border-border px-4 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            <PackageSearch className="h-4 w-4" aria-hidden="true" />
            {copy.track}
          </Link>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-sm border border-emerald-500/50 bg-emerald-500/10 px-4 text-xs font-semibold uppercase tracking-widest text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {copy.whatsapp}
          </a>
        </div>
      </section>
    </main>
  );
}
