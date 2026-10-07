import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, MessageCircle, Package, PhoneCall } from "lucide-react";
import { useTranslation } from "react-i18next";
import { whatsappLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/order-confirmed")({
  head: () => ({
    meta: [{ title: "Order received — BRWAZWNEON" }, { name: "robots", content: "noindex" }],
  }),
  component: OrderConfirmed,
});

function OrderConfirmed() {
  const { i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const L = (en: string, a: string) => (ar ? a : en);
  const steps = [
    {
      icon: PhoneCall,
      text: L(
        "We call or WhatsApp you to confirm the details.",
        "هنتواصل معاك تليفونياً أو واتساب لتأكيد التفاصيل.",
      ),
    },
    {
      icon: Package,
      text: L("Your frames are printed and packed with care.", "بنطبع البراويز ونجهزها بعناية."),
    },
    {
      icon: CheckCircle2,
      text: L(
        "Delivery across Egypt — pay on delivery or via Instapay.",
        "التوصيل لكل مصر — الدفع عند الاستلام أو إنستا باي.",
      ),
    },
  ];
  return (
    <section className="container-page py-20 text-center" dir={ar ? "rtl" : "ltr"}>
      <CheckCircle2 className="mx-auto h-14 w-14 text-primary" aria-hidden />
      <h1 className="text-display mt-6 text-4xl sm:text-6xl">
        {L("Order received", "تم استلام طلبك")}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        {L(
          "Thank you! Your order is in. Here is what happens next:",
          "شكراً ليك! طلبك وصلنا. دي الخطوات الجاية:",
        )}
      </p>
      <ol className="mx-auto mt-8 grid max-w-md gap-3 text-start">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-3 border border-border p-4 text-sm">
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            {text}
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href={whatsappLink("Hi BRWAZWNEON, I just placed an order.")}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center gap-2 border border-border px-6 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
        </a>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center bg-primary px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
        >
          {L("Continue shopping", "كمّل تسوق")}
        </Link>
      </div>
    </section>
  );
}
