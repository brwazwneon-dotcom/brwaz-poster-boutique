import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import {
  labelForColor,
  labelForFrame,
  labelForSize,
} from "@/lib/poster-options";
import { whatsappLink } from "@/lib/whatsapp";
import { Trash2, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart — BRWAZWNEON" },
      { name: "description", content: "Review your framed posters and place your cash-on-delivery order." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, remove, setQty, clear, total } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const buildMessage = () => {
    const lines = items.map(
      (i, idx) =>
        `${idx + 1}. ${i.title} ×${i.qty}\n   ${labelForFrame(i.frameType)} · ${labelForSize(i.size)} · ${labelForColor(i.color)}\n   ${i.price * i.qty} EGP`,
    );
    return [
      "New order from BRWAZWNEON website (Cash on delivery)",
      "",
      `Name: ${name || "—"}`,
      `Phone: ${phone || "—"}`,
      `Address: ${address || "—"}`,
      "",
      "Items:",
      ...lines,
      "",
      `Total: ${total} EGP`,
    ].join("\n");
  };

  const handleOrder = () => {
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (!name || !phone || !address) {
      toast.error("Please fill in name, phone and address");
      return;
    }
    window.open(whatsappLink(buildMessage()), "_blank");
  };

  return (
    <div className="container-page py-16">
      <h1 className="text-display text-5xl sm:text-7xl">Cart</h1>

      {items.length === 0 ? (
        <div className="mt-12 rounded-sm border border-dashed border-border p-16 text-center">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Link to="/" className="mt-4 inline-block underline">
            Browse collections
          </Link>
        </div>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            {items.map((i) => (
              <div
                key={i.id}
                className="flex gap-4 rounded-sm border border-border bg-card p-4"
              >
                <img
                  src={i.image}
                  alt={i.title}
                  className="h-28 w-20 rounded-sm object-cover"
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{i.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                        {labelForFrame(i.frameType)} · {labelForSize(i.size)} ·{" "}
                        {labelForColor(i.color)}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(i.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="inline-flex items-center rounded-sm border border-border">
                      <button
                        className="p-2 hover:bg-accent"
                        onClick={() => setQty(i.id, i.qty - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm">{i.qty}</span>
                      <button
                        className="p-2 hover:bg-accent"
                        onClick={() => setQty(i.id, i.qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-display text-xl">
                      {i.price * i.qty} <span className="text-sm text-muted-foreground">EGP</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={clear}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Clear cart
            </button>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-sm border border-border bg-card p-6">
              <h2 className="text-display text-2xl">Checkout</h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                Cash on delivery
              </p>
              <div className="mt-5 space-y-3">
                <Field label="Full name" value={name} onChange={setName} />
                <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
                <Field label="Address" value={address} onChange={setAddress} textarea />
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-display text-3xl">
                  {total} <span className="text-base text-muted-foreground">EGP</span>
                </span>
              </div>
              <button
                onClick={handleOrder}
                className="mt-5 w-full rounded-sm bg-primary px-4 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                Order via WhatsApp
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                You'll be redirected to WhatsApp to confirm.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  const props = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    className:
      "mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary",
  };
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {textarea ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
    </label>
  );
}