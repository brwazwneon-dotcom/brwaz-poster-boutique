// Draws the invoice model onto a canvas and returns a PNG. Plain Canvas 2D on
// purpose (not SVG foreignObject): it renders identically on the phones the
// admin actually uses, shapes Arabic correctly, and never taints the canvas
// because every image is fetched as a CORS blob first (a failed image just
// becomes a labelled placeholder instead of breaking the whole invoice).
import { photoGridColumns, type PhotoSheetModel } from "./photo-order-sheet";
import { formatEgp, type InvoiceItem, type InvoiceModel } from "./order-invoice";

const W = 1080;
const M = 56;
const INK = "#111114";
const MUTED = "#6b6b75";
const LINE = "#e3e3e8";
const PAPER = "#ffffff";
const DARK = "#0b0b0d";
const YELLOW = "#ffd21f";
const BLUE = "#1ba8e0";
const RED = "#d92d20";
const FONT = '"Segoe UI", Tahoma, "Noto Sans Arabic", "Noto Sans", Arial, system-ui, sans-serif';

/** Base direction by the first strong character, like dir="auto". */
function isRtlText(text: string): boolean {
  const m = text.match(/\p{L}/u);
  return !!m && /\p{Script=Arabic}/u.test(m[0]);
}

const font = (size: number, weight: 400 | 600 | 700 = 400) => `${weight} ${size}px ${FONT}`;

type Img = ImageBitmap | HTMLImageElement | null;
export type InvoiceImages = { logo: Img; byUrl: Map<string, Img> };

/** Cloudinary: ask for a small JPEG crop; anything else is used as-is. */
export function invoiceThumbUrl(url: string, w: number, h: number): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1 || !/^https:\/\/res\.cloudinary\.com\//.test(url)) return url;
  return `${url.slice(0, at + marker.length)}c_fill,w_${w},h_${h},f_jpg,q_85/${url.slice(at + marker.length)}`;
}

async function loadImage(url: string): Promise<Img> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
    const obj = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("decode"));
        im.src = obj;
      });
    } finally {
      URL.revokeObjectURL(obj);
    }
  } catch {
    return null;
  }
}

export async function loadInvoiceImages(
  model: InvoiceModel,
  logoUrl: string,
): Promise<InvoiceImages> {
  const wanted = new Map<string, string>(); // thumb url → source key
  for (const it of model.items) {
    if (it.isBundle) {
      for (const p of it.posters)
        if (p.imageUrl) wanted.set(thumbKey(p.imageUrl, true), p.imageUrl);
    } else if (it.imageUrl) wanted.set(thumbKey(it.imageUrl, true), it.imageUrl);
  }
  const byUrl = new Map<string, Img>();
  const logo = await loadImage(logoUrl);
  await Promise.all(
    [...wanted.keys()].map(async (key) => {
      byUrl.set(key, await loadImage(thumbSource(key)));
    }),
  );
  return { logo, byUrl };
}

// Keys encode both the source and the crop size so a bundle thumbnail and a
// full-size item thumbnail of the same poster don't collide.
const BIG = { w: 300, h: 400 };
const SMALL = { w: 168, h: 224 };
function thumbKey(url: string, small: boolean): string {
  return `${small ? "s" : "b"}|${url}`;
}
function thumbSource(key: string): string {
  const small = key.startsWith("s|");
  const url = key.slice(2);
  const size = small ? SMALL : BIG;
  return invoiceThumbUrl(url, size.w, size.h);
}

const FRAME_COLORS: [RegExp, string][] = [
  [/black|اسود|أسود/i, "#17171a"],
  [/white|ابيض|أبيض/i, "#f4f4f1"],
  [/wood|natural|oak|خشب/i, "#b58a58"],
  [/gold|dahab|ذهب/i, "#c9a227"],
  [/silver|فضي/i, "#b8bcc4"],
];
function frameColorHex(label: string): string {
  for (const [re, hex] of FRAME_COLORS) if (re.test(label)) return hex;
  return "#17171a";
}

const METHOD_LABEL: Record<string, string> = {
  cod: "Cash on delivery · الدفع عند الاستلام",
  instapay: "InstaPay · إنستا باي",
};
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment confirmation · في انتظار تأكيد الدفع",
  paid: "Paid · تم الدفع",
  confirmed: "Paid · تم الدفع",
  rejected: "Payment proof rejected · تم رفض إثبات الدفع",
};

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !cur) {
        cur = next;
        // A single word wider than the box: break it by characters.
        while (ctx.measureText(cur).width > maxWidth && cur.length > 1) {
          let cut = cur.length - 1;
          while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > maxWidth) cut--;
          out.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      } else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur || words.length === 0) out.push(cur);
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth)
      last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return out;
}

class Pen {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly dry: boolean,
  ) {}

  rect(x: number, y: number, w: number, h: number, fill: string) {
    if (this.dry) return;
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x, y, w, h);
  }

  hline(y: number, x1 = M, x2 = W - M, color = LINE) {
    this.rect(x1, y, x2 - x1, 2, color);
  }

  /** Text in a box [x, x+w]; aligned to the side its own script reads from. Returns height used. */
  block(
    text: string,
    x: number,
    y: number,
    w: number,
    size: number,
    opts: {
      weight?: 400 | 600 | 700;
      color?: string;
      maxLines?: number;
      align?: "auto" | "left" | "right" | "center";
      lineHeight?: number;
    } = {},
  ): number {
    const { ctx } = this;
    const weight = opts.weight ?? 400;
    const lh = Math.round(size * (opts.lineHeight ?? 1.35));
    ctx.font = font(size, weight);
    const rtl = isRtlText(text);
    ctx.direction = rtl ? "rtl" : "ltr";
    const lines = wrapLines(ctx, text, w, opts.maxLines ?? 99);
    const align = opts.align && opts.align !== "auto" ? opts.align : "left";
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    const ax = align === "left" ? x : align === "right" ? x + w : x + w / 2;
    if (!this.dry) {
      ctx.fillStyle = opts.color ?? INK;
      lines.forEach((ln, i) => ctx.fillText(ln, ax, y + i * lh));
    }
    return lines.length * lh;
  }

  image(img: Img, x: number, y: number, w: number, h: number) {
    if (this.dry) return;
    const { ctx } = this;
    if (!img) {
      ctx.fillStyle = "#f0f0f3";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = MUTED;
      ctx.font = font(Math.max(12, Math.round(w / 9)), 600);
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No image", x + w / 2, y + h / 2);
      return;
    }
    // object-fit: cover, centred — same as how the storefront shows posters.
    const iw = "width" in img ? img.width : 1;
    const ih = "height" in img ? img.height : 1;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
    ctx.restore();
  }

  framedImage(
    img: Img,
    x: number,
    y: number,
    w: number,
    h: number,
    frameHex: string,
    border: number,
  ) {
    this.rect(x - border, y - border, w + border * 2, h + border * 2, frameHex);
    if (!this.dry && /^#f/i.test(frameHex)) {
      this.ctx.strokeStyle = "#cfcfd6";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x - border + 1, y - border + 1, w + border * 2 - 2, h + border * 2 - 2);
    }
    this.image(img, x, y, w, h);
  }
}

// ---- Compact item layout -------------------------------------------------
// Single posters sit two per row (thumbnail + details + price in one card);
// every bundle is ONE grouped card with its posters side by side; the tape is
// a slim line. This keeps a 7-frame order about a third as tall as one row per
// item.
const COL_GAP = 32;
const COL_W = (W - M * 2 - COL_GAP) / 2;

function priceLine(pen: Pen, it: InvoiceItem, x: number, y: number, w: number): number {
  if (it.lineCents === null) {
    return pen.block("Price unavailable", x, y, w, 20, { color: RED });
  }
  let h = pen.block(`${formatEgp(it.lineCents)} EGP`, x, y, w, 26, { weight: 700 });
  if (it.quantity > 1 && it.unitCents !== null) {
    h += pen.block(`${formatEgp(it.unitCents)} EGP each`, x, y + h, w, 17, { color: MUTED });
  }
  return h;
}

/** One single poster as a card in a column. Returns its height. */
function drawSingleCard(
  pen: Pen,
  it: InvoiceItem,
  x: number,
  y: number,
  images: InvoiceImages,
): number {
  const tw = 84;
  const th = 112;
  const border = 5;
  const frameHex = frameColorHex(it.frameColor);
  const main = it.imageUrl ? (images.byUrl.get(thumbKey(it.imageUrl, true)) ?? null) : null;
  pen.framedImage(main, x + border, y + border, tw, th, frameHex, border);
  const tx = x + tw + border * 2 + 18;
  const w = x + COL_W - tx;
  let ty = y;
  ty += pen.block(it.title, tx, ty, w, 21, { weight: 700, maxLines: 2, lineHeight: 1.25 });
  const meta = [it.size, it.frameType, it.frameColor].filter(Boolean).join(" · ");
  if (meta)
    ty += pen.block(meta, tx, ty + 3, w, 16, { color: MUTED, maxLines: 2, lineHeight: 1.25 });
  ty += pen.block(`Qty ${it.quantity} · الكمية ${it.quantity}`, tx, ty + 4, w, 16, {
    color: MUTED,
  });
  ty += priceLine(pen, it, tx, ty + 6, w) + 6;
  return Math.max(ty - y, th + border * 2);
}

/** A bundle as one card: title/price on a line, then all its posters together. */
function drawBundleCard(pen: Pen, it: InvoiceItem, y: number, images: InvoiceImages): number {
  const frameHex = frameColorHex(it.frameColor);
  const PRICE_W = 230;
  let ty = y;
  const titleW = W - M * 2 - PRICE_W - 20;
  const h1 = pen.block(it.title, M, ty, titleW, 24, { weight: 700 });
  const meta = [it.size, it.frameType, it.frameColor].filter(Boolean).join(" · ");
  const h2 = meta ? pen.block(meta, M, ty + h1 + 2, titleW, 16, { color: MUTED, maxLines: 2 }) : 0;
  const h3 = pen.block(
    `Qty ${it.quantity} · الكمية ${it.quantity}`,
    M,
    ty + h1 + h2 + 4,
    titleW,
    16,
    {
      color: MUTED,
    },
  );
  // price block, right edge
  if (it.lineCents !== null) {
    pen.block(`${formatEgp(it.lineCents)} EGP`, W - M - PRICE_W, ty, PRICE_W, 26, {
      weight: 700,
      align: "right",
    });
  } else {
    pen.block("Price unavailable", W - M - PRICE_W, ty, PRICE_W, 20, {
      color: RED,
      align: "right",
    });
  }
  ty += h1 + h2 + h3 + 14;

  const tw = 108;
  const th = 144;
  const gap = 16;
  const perRow = Math.max(1, Math.floor((W - M * 2 + gap) / (tw + gap)));
  for (let i = 0; i < it.posters.length; i += perRow) {
    const row = it.posters.slice(i, i + perRow);
    row.forEach((p, j) => {
      const px = M + j * (tw + gap);
      const img = p.imageUrl ? (images.byUrl.get(thumbKey(p.imageUrl, true)) ?? null) : null;
      pen.framedImage(img, px + 4, ty + 4, tw - 8, th - 8, frameHex, 4);
      pen.block(`${i + j + 1}. ${p.name}`, px, ty + th + 2, tw, 14, {
        color: MUTED,
        maxLines: 2,
        lineHeight: 1.15,
      });
    });
    ty += th + 2 + 32 + 8;
  }
  return ty - y;
}

function drawTapeLine(pen: Pen, it: InvoiceItem, y: number): number {
  const h = pen.block(`${it.title} × ${it.quantity}`, M, y, W - M * 2 - 240, 21, { weight: 600 });
  if (it.lineCents !== null) {
    pen.block(`${formatEgp(it.lineCents)} EGP`, W - M - 220, y, 220, 22, {
      weight: 700,
      align: "right",
    });
  }
  return Math.max(h, 28);
}

/** Lays out every item; returns the y below the last one. */
function drawItems(pen: Pen, model: InvoiceModel, y: number, images: InvoiceImages): number {
  const singles = model.items.filter((i) => !i.isBundle && !i.isTape);
  const bundles = model.items.filter((i) => i.isBundle);
  const tapes = model.items.filter((i) => i.isTape);

  for (let i = 0; i < singles.length; i += 2) {
    const left = drawSingleCard(pen, singles[i], M, y, images);
    const right = singles[i + 1]
      ? drawSingleCard(pen, singles[i + 1], M + COL_W + COL_GAP, y, images)
      : 0;
    y += Math.max(left, right) + 14;
    pen.hline(y - 7);
    y += 7;
  }
  for (const b of bundles) {
    y += drawBundleCard(pen, b, y, images) + 6;
    pen.hline(y);
    y += 14;
  }
  for (const t of tapes) {
    y += drawTapeLine(pen, t, y) + 10;
    pen.hline(y - 4);
    y += 8;
  }
  return y;
}

function paint(
  ctx: CanvasRenderingContext2D,
  model: InvoiceModel,
  images: InvoiceImages,
  dry: boolean,
): number {
  const pen = new Pen(ctx, dry);

  // ---- Header ----
  const HEAD_H = 200;
  pen.rect(0, 0, W, HEAD_H, DARK);
  pen.rect(0, HEAD_H, W / 2, 8, YELLOW);
  pen.rect(W / 2, HEAD_H, W / 2, 8, BLUE);
  if (!dry && images.logo) {
    const lh = 150;
    const lw = Math.round(lh * (611 / 512));
    ctx.drawImage(images.logo, M, (HEAD_H - lh) / 2, lw, lh);
  } else {
    pen.block("BRWAZWNEON", M, 78, 420, 40, { weight: 700, color: "#ffffff" });
  }
  const rx = W - M - 520;
  pen.block("ORDER CONFIRMATION", rx, 46, 520, 34, {
    weight: 700,
    color: "#ffffff",
    align: "right",
  });
  pen.block("تأكيد الطلب", rx, 86, 520, 30, { weight: 600, color: YELLOW, align: "right" });
  pen.block(`${model.orderLabel}`, rx, 126, 520, 24, { color: "#d6d6dc", align: "right" });
  const dateStr = isNaN(model.createdAt.getTime())
    ? ""
    : model.createdAt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  pen.block(dateStr, rx, 154, 520, 22, { color: "#a8a8b2", align: "right" });

  let y = HEAD_H + 8 + 40;

  // ---- Customer ----
  pen.block("CUSTOMER · العميل", M, y, 600, 20, { weight: 700, color: MUTED });
  y += 34;
  y += pen.block(model.customer.name, M, y, W - M * 2, 32, { weight: 700 });
  y += 6;
  const contact = [model.customer.phone, model.customer.governorate]
    .filter(Boolean)
    .join("   ·   ");
  y += pen.block(contact, M, y, W - M * 2, 24, { color: MUTED });
  y += 4;
  y += pen.block(model.customer.address, M, y, W - M * 2, 24, { color: MUTED, maxLines: 4 });
  y += 28;
  pen.hline(y);
  y += 30;

  // ---- Items ----
  pen.block("ITEMS · المنتجات", M, y, 600, 20, { weight: 700, color: MUTED });
  y += 40;
  const itemsTop = y;
  y = drawItems(pen, model, y, images);
  for (const p of model.photoLines) {
    pen.block(p.label, M, y, W - M * 2 - 224, 26, { weight: 600 });
    pen.block(`${formatEgp(p.cents)} EGP`, W - M - 200, y, 200, 28, {
      weight: 700,
      align: "right",
    });
    y += 46;
    pen.hline(y - 12);
    y += 12;
  }

  // ---- Totals ----
  y += 6;
  const boxW = 470;
  const bx = W - M - boxW;
  const row = (label: string, value: string, strong = false) => {
    const size = strong ? 32 : 24;
    pen.block(label, bx, y, boxW - 190, size, {
      weight: strong ? 700 : 400,
      color: strong ? INK : MUTED,
    });
    pen.block(value, bx + boxW - 190, y, 190, size, { weight: strong ? 700 : 600, align: "right" });
    y += strong ? 50 : 40;
  };
  const totalsTop = y;
  row("Subtotal · المجموع الفرعي", `${formatEgp(model.subtotalCents)} EGP`);
  if (model.packagingCents > 0)
    row("Packaging · التغليف", `${formatEgp(model.packagingCents)} EGP`);
  row(
    "Shipping · الشحن",
    model.shippingCents > 0 ? `${formatEgp(model.shippingCents)} EGP` : "Free · مجاني",
  );
  pen.hline(y, bx, W - M, INK);
  y += 16;
  row(
    model.totalIncomplete ? "Total (incomplete) · الإجمالي" : "Total · الإجمالي",
    `${formatEgp(model.totalCents)} EGP`,
    true,
  );

  // Payment info, left of the totals.
  let ly = totalsTop;
  const method = METHOD_LABEL[model.paymentMethod.toLowerCase()] ?? model.paymentMethod;
  ly += pen.block("PAYMENT · الدفع", M, ly, bx - M - 30, 20, { weight: 700, color: MUTED });
  ly += pen.block(method, M, ly + 8, bx - M - 30, 24, { weight: 600, maxLines: 2 });
  const ps = (model.paymentStatus ?? "").toLowerCase();
  if (PAYMENT_STATUS_LABEL[ps]) {
    ly += pen.block(PAYMENT_STATUS_LABEL[ps], M, ly + 10, bx - M - 30, 22, {
      color: MUTED,
      maxLines: 3,
    });
  }
  y = Math.max(y, ly) + 30;

  // ---- Footer ----
  pen.rect(0, y, W, 8, YELLOW);
  pen.rect(W / 2, y, W / 2, 8, BLUE);
  y += 8 + 34;
  y += pen.block("Please reply to confirm your order and the details above.", M, y, W - M * 2, 26, {
    weight: 600,
    align: "center",
  });
  y += pen.block("برجاء الرد لتأكيد الطلب والتفاصيل الموضحة أعلاه.", M, y + 4, W - M * 2, 26, {
    weight: 600,
    align: "center",
  });
  y += pen.block("brwazwneon.com", M, y + 12, W - M * 2, 22, { color: MUTED, align: "center" });
  y += 44;

  // ---- Cancelled / returned stamp ----
  if (!dry && model.voided) {
    ctx.save();
    ctx.translate(W / 2, (itemsTop + totalsTop) / 2);
    ctx.rotate(-0.35);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = RED;
    ctx.font = font(150, 700);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(/return|refund/i.test(model.status) ? "RETURNED" : "CANCELLED", 0, 0);
    ctx.restore();
  }
  return y;
}

export async function renderInvoiceBlob(model: InvoiceModel, images: InvoiceImages): Promise<Blob> {
  const probe = document.createElement("canvas");
  probe.width = W;
  probe.height = 10;
  const pctx = probe.getContext("2d");
  if (!pctx) throw new Error("Canvas is not available in this browser");
  const height = Math.ceil(paint(pctx, model, images, true));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);
  paint(ctx, model, images, false);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not create the image"))),
      "image/png",
    ),
  );
}

// ---- Photo-printing order sheet ------------------------------------------
// One image with the order details and EVERY photo the customer sent, laid out
// in a grid — the photo-order counterpart of the poster invoice.
export type PhotoSheetImages = { logo: Img; photos: Img[] };

function photoThumbUrl(url: string): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1 || !/^https:\/\/res\.cloudinary\.com\//.test(url)) return url;
  return `${url.slice(0, at + marker.length)}c_limit,w_480,h_480,f_jpg,q_85/${url.slice(at + marker.length)}`;
}

export async function loadPhotoSheetImages(
  model: PhotoSheetModel,
  logoUrl: string,
): Promise<PhotoSheetImages> {
  const logo = await loadImage(logoUrl);
  const photos: Img[] = new Array(model.photos.length).fill(null);
  // A few at a time: an order can hold dozens of photos.
  let next = 0;
  const worker = async () => {
    while (next < model.photos.length) {
      const i = next++;
      photos[i] = await loadImage(photoThumbUrl(model.photos[i]));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, model.photos.length) }, worker));
  return { logo, photos };
}

function drawContain(pen: Pen, img: Img, x: number, y: number, w: number, h: number) {
  pen.rect(x, y, w, h, "#f1f1f4");
  if (pen.dry) return;
  const { ctx } = pen;
  if (!img) {
    ctx.fillStyle = MUTED;
    ctx.font = font(Math.max(12, Math.round(w / 12)), 600);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No image", x + w / 2, y + h / 2);
    return;
  }
  const iw = "width" in img ? img.width : 1;
  const ih = "height" in img ? img.height : 1;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function paintPhotoSheet(
  ctx: CanvasRenderingContext2D,
  model: PhotoSheetModel,
  images: PhotoSheetImages,
  dry: boolean,
): number {
  const pen = new Pen(ctx, dry);
  const HEAD_H = 200;
  pen.rect(0, 0, W, HEAD_H, DARK);
  pen.rect(0, HEAD_H, W / 2, 8, YELLOW);
  pen.rect(W / 2, HEAD_H, W / 2, 8, BLUE);
  if (!dry && images.logo) {
    const lh = 150;
    ctx.drawImage(images.logo, M, (HEAD_H - lh) / 2, Math.round(lh * (611 / 512)), lh);
  } else {
    pen.block("BRWAZWNEON", M, 78, 420, 40, { weight: 700, color: "#ffffff" });
  }
  const rx = W - M - 520;
  pen.block("PHOTO PRINTING ORDER", rx, 46, 520, 34, {
    weight: 700,
    color: "#ffffff",
    align: "right",
  });
  pen.block("طلب طباعة صور", rx, 86, 520, 30, { weight: 600, color: YELLOW, align: "right" });
  pen.block(model.orderLabel, rx, 126, 520, 24, { color: "#d6d6dc", align: "right" });
  const dateStr = Number.isNaN(model.createdAt.getTime())
    ? ""
    : model.createdAt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  pen.block(dateStr, rx, 154, 520, 22, { color: "#a8a8b2", align: "right" });

  let y = HEAD_H + 8 + 40;
  pen.block("CUSTOMER · العميل", M, y, 600, 20, { weight: 700, color: MUTED });
  y += 34;
  y += pen.block(model.customer.name, M, y, W - M * 2, 32, { weight: 700 });
  y += 6;
  y += pen.block(
    [model.customer.phone, model.customer.governorate].filter(Boolean).join("   ·   "),
    M,
    y,
    W - M * 2,
    24,
    { color: MUTED },
  );
  y += 4;
  y += pen.block(model.customer.address, M, y, W - M * 2, 24, { color: MUTED, maxLines: 4 });
  y += 28;
  pen.hline(y);
  y += 30;

  // Order summary: label/value pairs in two columns.
  pen.block("ORDER · الطلب", M, y, 600, 20, { weight: 700, color: MUTED });
  y += 36;
  const facts: Array<[string, string]> = [
    ["Type · النوع", model.kindLabel],
    [model.detailTitle, model.detail],
    ["Photos · عدد الصور", String(model.count)],
    ["Payment · الدفع", model.paymentLabel],
  ];
  if (model.albums.length > 0) facts.push(["Albums · ألبومات", model.albums.join(", ")]);
  const colW = (W - M * 2 - COL_GAP) / 2;
  for (let i = 0; i < facts.length; i += 2) {
    let rowH = 0;
    for (let j = 0; j < 2 && i + j < facts.length; j++) {
      const [label, value] = facts[i + j];
      const x = M + j * (colW + COL_GAP);
      const h1 = pen.block(label, x, y, colW, 16, { color: MUTED });
      const h2 = pen.block(value, x, y + h1 + 2, colW, 22, { weight: 600, maxLines: 2 });
      rowH = Math.max(rowH, h1 + h2 + 2);
    }
    y += rowH + 14;
  }
  y += 6;
  pen.hline(y);
  y += 30;

  // Photos
  pen.block(`PHOTOS · الصور (${model.photos.length})`, M, y, 600, 20, {
    weight: 700,
    color: MUTED,
  });
  y += 36;
  const photosTop = y;
  if (model.photos.length === 0) {
    y += pen.block("No photos were stored with this order.", M, y, W - M * 2, 22, {
      color: MUTED,
    });
    y += 10;
  } else {
    const cols = photoGridColumns(model.photos.length);
    const gap = 14;
    const tile = Math.floor((W - M * 2 - gap * (cols - 1)) / cols);
    model.photos.forEach((_, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = M + c * (tile + gap);
      const ty = y + r * (tile + gap);
      drawContain(pen, images.photos[i] ?? null, x, ty, tile, tile);
      // Small index badge so the customer can refer to "photo 7".
      pen.rect(x, ty, 34, 24, "rgba(11,11,13,0.78)");
      pen.block(String(i + 1), x, ty + 2, 34, 17, {
        weight: 700,
        color: "#ffffff",
        align: "center",
      });
    });
    const rows = Math.ceil(model.photos.length / cols);
    y += rows * (tile + gap);
  }
  y += 16;
  pen.hline(y);
  y += 26;

  // Price breakdown (only the parts the order really knows), then the total.
  const sumRow = (label: string, value: string) => {
    pen.block(label, W - M - 470, y, 280, 24, { color: MUTED });
    pen.block(value, W - M - 190, y, 190, 24, { weight: 600, align: "right" });
    y += 38;
  };
  if (model.subtotalCents !== null)
    sumRow("Subtotal · المجموع الفرعي", `${formatEgp(model.subtotalCents)} EGP`);
  if (model.albumsCents > 0) sumRow("Albums · الألبومات", `${formatEgp(model.albumsCents)} EGP`);
  if (model.shippingCents !== null) {
    sumRow(
      "Shipping · الشحن",
      model.shippingCents > 0 ? `${formatEgp(model.shippingCents)} EGP` : "Free · مجاني",
    );
  }
  if (model.subtotalCents !== null || model.albumsCents > 0 || model.shippingCents !== null) {
    pen.hline(y - 6, W - M - 470, W - M, INK);
    y += 8;
  }
  const total = formatEgp(model.totalCents);
  pen.block("Total · الإجمالي", W - M - 470, y, 280, 32, { weight: 700 });
  pen.block(`${total} EGP`, W - M - 190, y, 190, 32, { weight: 700, align: "right" });
  y += 60;

  pen.rect(0, y, W, 8, YELLOW);
  pen.rect(W / 2, y, W / 2, 8, BLUE);
  y += 8 + 34;
  y += pen.block("Please reply to confirm your order and the details above.", M, y, W - M * 2, 26, {
    weight: 600,
    align: "center",
  });
  y += pen.block("برجاء الرد لتأكيد الطلب والتفاصيل الموضحة أعلاه.", M, y + 4, W - M * 2, 26, {
    weight: 600,
    align: "center",
  });
  y += pen.block("brwazwneon.com", M, y + 12, W - M * 2, 22, { color: MUTED, align: "center" });
  y += 44;

  if (!dry && model.voided) {
    ctx.save();
    ctx.translate(W / 2, (photosTop + y) / 2);
    ctx.rotate(-0.35);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = RED;
    ctx.font = font(150, 700);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(/return|refund/i.test(model.status) ? "RETURNED" : "CANCELLED", 0, 0);
    ctx.restore();
  }
  return y;
}

export async function renderPhotoSheetBlob(
  model: PhotoSheetModel,
  images: PhotoSheetImages,
): Promise<Blob> {
  const probe = document.createElement("canvas");
  probe.width = W;
  probe.height = 10;
  const pctx = probe.getContext("2d");
  if (!pctx) throw new Error("Canvas is not available in this browser");
  const height = Math.ceil(paintPhotoSheet(pctx, model, images, true));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);
  paintPhotoSheet(ctx, model, images, false);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not create the image"))),
      "image/png",
    ),
  );
}
