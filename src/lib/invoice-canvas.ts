/**
 * BRWAZWNEON invoice → PNG, drawn directly with the Canvas 2D API.
 *
 * Why canvas instead of HTML→image: it needs no dependency, the output does
 * not depend on the admin's CSS/theme/viewport, and the browser's own text
 * shaper handles Arabic (RTL, joined letters) when `ctx.direction = "rtl"`.
 * The drawing is a pure function of (invoice data, thumbnails, logo): same
 * input → same pixels. Dates use a fixed locale/time zone (see
 * order-invoice.ts) and the font is the site's own Alexandria (Arabic+Latin).
 *
 * Layout: 1080 logical px wide, rendered at 2× → 2160 px (sharp in WhatsApp,
 * prints well at A4 width). Height grows with the number of items.
 */
import {
  formatEgp,
  formatInvoiceDate,
  type InvoiceData,
  type InvoiceItem,
} from "@/lib/order-invoice";

export const INVOICE_WIDTH = 1080;
export const INVOICE_SCALE = 2;
const FONT = '"Alexandria", "Noto Sans Arabic", Tahoma, "Segoe UI", Arial, sans-serif';

const C = {
  ink: "#111111",
  muted: "#6b6b6b",
  line: "#e4e4e0",
  paper: "#ffffff",
  soft: "#f6f6f2",
  yellow: "#f7d117",
  blue: "#1aa6dc",
  green: "#12805c",
  red: "#c0392b",
};

export type InvoiceAssets = {
  logo: CanvasImageSource | null;
  /** Thumbnails keyed by order row id. Missing/failed → placeholder box. */
  thumbs: Map<string, CanvasImageSource | null>;
};

type Ctx = CanvasRenderingContext2D;

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

/** Direction follows the first strong letter, so "CUSTOMER · العميل" stays LTR. */
function startsArabic(text: string): boolean {
  const m = text.match(/[A-Za-z\u0600-\u06FF\u0750-\u077F]/);
  return !!m && /[\u0600-\u06FF\u0750-\u077F]/.test(m[0]);
}

function setDir(ctx: Ctx, text: string) {
  const rtl = startsArabic(text);
  ctx.direction = rtl ? "rtl" : "ltr";
  return rtl;
}

/** Word-wrap; breaks over-long tokens so nothing can overflow its column. */
export function wrapText(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const pushToken = (tok: string) => {
    // token wider than the column: split by characters
    let part = "";
    for (const ch of Array.from(tok)) {
      if (measure(part + ch) > maxWidth && part) {
        lines.push(part);
        part = ch;
      } else part += ch;
    }
    return part;
  };
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (measure(test) <= maxWidth) {
      cur = test;
      continue;
    }
    if (cur) lines.push(cur);
    cur = measure(w) > maxWidth ? pushToken(w) : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines.length ? lines : [""];
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number; color?: string; align?: "left" | "right" | "center" },
) {
  ctx.font = font(opts.weight ?? 400, opts.size);
  ctx.fillStyle = opts.color ?? C.ink;
  ctx.textBaseline = "alphabetic";
  const rtl = setDir(ctx, text);
  // With direction=rtl, "left"/"right" are still physical for textAlign in
  // canvas ("start"/"end" are logical), so we use physical values throughout.
  ctx.textAlign = opts.align ?? (rtl ? "right" : "left");
  ctx.fillText(text, x, y);
}

function wrapped(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  opts: {
    size: number;
    weight?: number;
    color?: string;
    lineHeight: number;
    align?: "left" | "right";
  },
): number {
  ctx.font = font(opts.weight ?? 400, opts.size);
  const lines = wrapText((s) => ctx.measureText(s).width, text, maxWidth, maxLines);
  lines.forEach((ln, i) => {
    const rtl = startsArabic(ln);
    const align = opts.align ?? (rtl ? "right" : "left");
    drawText(ctx, ln, align === "right" ? x + maxWidth : x, y + i * opts.lineHeight, {
      ...opts,
      align,
    });
  });
  return lines.length;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx: Ctx, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const iw =
    (img as { width?: number }).width ?? (img as { naturalWidth?: number }).naturalWidth ?? 0;
  const ih =
    (img as { height?: number }).height ?? (img as { naturalHeight?: number }).naturalHeight ?? 0;
  if (!iw || !ih) return false;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  return true;
}

const PAD = 48;
const THUMB_W = 84;
const THUMB_H = 108;

/** Draws the invoice; returns its total height. Pass a throwaway ctx to measure. */
export function drawInvoice(ctx: Ctx, data: InvoiceData, assets: InvoiceAssets): number {
  const W = INVOICE_WIDTH;
  const inner = W - PAD * 2;
  let y = 0;

  // ---------- header ----------
  const headerH = 150;
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = C.yellow;
  ctx.fillRect(0, headerH, W, 6);
  ctx.fillStyle = C.blue;
  ctx.fillRect(0, headerH, W * 0.22, 6);

  if (assets.logo) {
    const lw = (assets.logo as { width?: number }).width || 611;
    const lh = (assets.logo as { height?: number }).height || 512;
    const h = 104;
    const w = (lw / lh) * h;
    ctx.drawImage(assets.logo, PAD, (headerH - h) / 2, w, h);
    drawText(ctx, "BRWAZWNEON", PAD + w + 18, 66, { size: 34, weight: 700, color: "#ffffff" });
    drawText(ctx, "Poster & Frame Boutique", PAD + w + 18, 98, {
      size: 17,
      color: "#cfcfcf",
    });
  } else {
    drawText(ctx, "BRWAZWNEON", PAD, 78, { size: 40, weight: 700, color: "#ffffff" });
  }
  drawText(ctx, "INVOICE  |  فاتورة", W - PAD, 62, {
    size: 30,
    weight: 700,
    color: C.yellow,
    align: "right",
  });
  drawText(ctx, `Order #${data.orderNumber}`, W - PAD, 98, {
    size: 20,
    weight: 600,
    color: "#ffffff",
    align: "right",
  });
  drawText(ctx, formatInvoiceDate(data.createdAt), W - PAD, 126, {
    size: 16,
    color: "#cfcfcf",
    align: "right",
  });
  y = headerH + 6 + 34;

  // ---------- customer ----------
  const c = data.customer;
  const addrText = [c.governorate, c.address].filter(Boolean).join(" — ");
  const colW = (inner - 24) / 2;
  const custTop = y;
  ctx.font = font(400, 19);
  const addrLines = wrapText((s) => ctx.measureText(s).width, addrText, colW - 36, 4);
  const nameLines = wrapText(
    (s) => {
      ctx.font = font(700, 24);
      return ctx.measureText(s).width;
    },
    c.name,
    colW - 36,
    2,
  );
  const leftH = 44 + nameLines.length * 32 + 34;
  const rightH = 44 + addrLines.length * 28 + 8;
  const boxH = Math.max(leftH, rightH, 120);

  ctx.fillStyle = C.soft;
  roundRect(ctx, PAD, custTop, colW, boxH, 14);
  ctx.fill();
  roundRect(ctx, PAD + colW + 24, custTop, colW, boxH, 14);
  ctx.fill();

  drawText(ctx, "CUSTOMER  ·  العميل", PAD + 18, custTop + 30, {
    size: 14,
    weight: 600,
    color: C.muted,
  });
  nameLines.forEach((ln, i) => {
    const rtl = startsArabic(ln);
    drawText(ctx, ln, rtl ? PAD + colW - 18 : PAD + 18, custTop + 64 + i * 32, {
      size: 24,
      weight: 700,
      align: rtl ? "right" : "left",
    });
  });
  // phone is always LTR digits
  ctx.direction = "ltr";
  drawText(ctx, c.phone, PAD + 18, custTop + 64 + nameLines.length * 32 + 6, {
    size: 20,
    color: C.muted,
    align: "left",
  });

  const rx = PAD + colW + 24;
  drawText(ctx, "DELIVERY ADDRESS  ·  عنوان التوصيل", rx + 18, custTop + 30, {
    size: 14,
    weight: 600,
    color: C.muted,
  });
  addrLines.forEach((ln, i) => {
    const rtl = startsArabic(ln);
    drawText(ctx, ln, rtl ? rx + colW - 18 : rx + 18, custTop + 64 + i * 28, {
      size: 19,
      align: rtl ? "right" : "left",
    });
  });
  y = custTop + boxH + 30;

  // ---------- items ----------
  const colQty = PAD + inner - 330;
  const colUnit = PAD + inner - 200;
  const colTot = PAD + inner;
  const nameX = PAD + THUMB_W + 18;
  const nameW = colQty - 40 - nameX;

  ctx.fillStyle = C.ink;
  roundRect(ctx, PAD, y, inner, 40, 8);
  ctx.fill();
  drawText(ctx, "ITEM  ·  المنتج", nameX, y + 26, { size: 14, weight: 600, color: "#ffffff" });
  drawText(ctx, "QTY", colQty, y + 26, {
    size: 14,
    weight: 600,
    color: "#ffffff",
    align: "center",
  });
  drawText(ctx, "UNIT", colUnit, y + 26, {
    size: 14,
    weight: 600,
    color: "#ffffff",
    align: "right",
  });
  drawText(ctx, "TOTAL", colTot - 8, y + 26, {
    size: 14,
    weight: 600,
    color: "#ffffff",
    align: "right",
  });
  y += 40;

  data.items.forEach((it: InvoiceItem, idx) => {
    ctx.font = font(700, 21);
    const nm = wrapText((s) => ctx.measureText(s).width, it.name, nameW, 2);
    const spec = `${it.frameType} · ${it.frameColor} · ${it.size}`;
    ctx.font = font(400, 16);
    const sp = wrapText((s) => ctx.measureText(s).width, spec, nameW, 2);
    const textH = nm.length * 28 + sp.length * 23 + 6;
    const rowH = Math.max(THUMB_H + 24, textH + 24);
    if (idx % 2 === 1) {
      ctx.fillStyle = C.soft;
      ctx.fillRect(PAD, y, inner, rowH);
    }
    // thumbnail
    const tx = PAD + 8;
    const ty = y + (rowH - THUMB_H) / 2;
    ctx.save();
    roundRect(ctx, tx, ty, THUMB_W, THUMB_H, 8);
    ctx.clip();
    ctx.fillStyle = "#e9e9e4";
    ctx.fillRect(tx, ty, THUMB_W, THUMB_H);
    const th = assets.thumbs.get(it.rowId);
    const drew = th ? drawCover(ctx, th, tx, ty, THUMB_W, THUMB_H) : false;
    if (!drew) {
      ctx.strokeStyle = "#c9c9c2";
      ctx.lineWidth = 2;
      ctx.strokeRect(tx + 18, ty + 28, THUMB_W - 36, THUMB_H - 56);
    }
    ctx.restore();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    roundRect(ctx, tx, ty, THUMB_W, THUMB_H, 8);
    ctx.stroke();

    // text
    let ly = y + (rowH - textH) / 2 + 22;
    nm.forEach((ln, i) => {
      const rtl = startsArabic(ln);
      drawText(ctx, ln, rtl ? nameX + nameW : nameX, ly + i * 28, {
        size: 21,
        weight: 700,
        align: rtl ? "right" : "left",
      });
    });
    ly += nm.length * 28 + 2;
    sp.forEach((ln, i) => {
      const rtl = startsArabic(ln);
      drawText(ctx, ln, rtl ? nameX + nameW : nameX, ly + i * 23, {
        size: 16,
        color: C.muted,
        align: rtl ? "right" : "left",
      });
    });

    const midY = y + rowH / 2 + 7;
    drawText(ctx, `× ${it.quantity}`, colQty, midY, { size: 20, weight: 600, align: "center" });
    drawText(ctx, formatEgp(it.unitPrice), colUnit, midY, {
      size: 18,
      color: C.muted,
      align: "right",
    });
    drawText(ctx, formatEgp(it.lineTotal), colTot - 8, midY, {
      size: 20,
      weight: 700,
      align: "right",
    });

    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, y + rowH - 1, inner, 1);
    y += rowH;
  });
  y += 28;

  // ---------- totals ----------
  const boxW = 440;
  const bx = PAD + inner - boxW;
  const lines: { label: string; value: string; color?: string }[] = [
    { label: "Subtotal  ·  المجموع", value: formatEgp(data.subtotal) },
  ];
  if (data.discount > 0)
    lines.push({
      label: "Discount  ·  الخصم",
      value: `− ${formatEgp(data.discount)}`,
      color: C.green,
    });
  if (data.packaging > 0)
    lines.push({ label: "Packaging  ·  التغليف", value: formatEgp(data.packaging) });
  lines.push({
    label: "Shipping  ·  الشحن",
    value: data.shipping > 0 ? formatEgp(data.shipping) : "FREE  ·  مجاني",
    color: data.shipping > 0 ? undefined : C.green,
  });
  if (data.otherFees !== 0)
    lines.push({
      label: "Other fees / adjustments  ·  رسوم أخرى",
      value: formatEgp(data.otherFees),
    });
  const totalsTop = y;
  const totalsH = 24 + lines.length * 38 + 86;
  // left: payment info
  drawText(ctx, "PAYMENT  ·  الدفع", PAD, totalsTop + 26, {
    size: 14,
    weight: 600,
    color: C.muted,
  });
  drawText(ctx, data.paymentLabel, PAD, totalsTop + 58, { size: 20, weight: 600 });

  ctx.fillStyle = C.soft;
  roundRect(ctx, bx, totalsTop, boxW, totalsH, 14);
  ctx.fill();
  lines.forEach((l, i) => {
    const ly = totalsTop + 36 + i * 38;
    drawText(ctx, l.label, bx + 20, ly, { size: 16, color: C.muted, align: "left" });
    ctx.direction = "ltr";
    drawText(ctx, l.value, bx + boxW - 20, ly, {
      size: 18,
      weight: 600,
      color: l.color ?? C.ink,
      align: "right",
    });
  });
  const tY = totalsTop + 24 + lines.length * 38;
  ctx.fillStyle = C.ink;
  roundRect(ctx, bx, tY, boxW, 70, 14);
  ctx.fill();
  drawText(ctx, "TOTAL  ·  الإجمالي", bx + 20, tY + 43, {
    size: 17,
    weight: 600,
    color: C.yellow,
    align: "left",
  });
  ctx.direction = "ltr";
  drawText(ctx, formatEgp(data.total), bx + boxW - 20, tY + 45, {
    size: 30,
    weight: 700,
    color: "#ffffff",
    align: "right",
  });
  y = totalsTop + totalsH + 40;

  // ---------- footer ----------
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y, inner, 1);
  drawText(ctx, "شكرًا لثقتك في برواز ونيون ❤", W / 2, y + 40, {
    size: 20,
    weight: 600,
    align: "center",
  });
  drawText(ctx, "Thank you for choosing BRWAZWNEON  ·  brwazwneon.com", W / 2, y + 70, {
    size: 15,
    color: C.muted,
    align: "center",
  });
  const height = y + 100;

  // ---------- status stamp ----------
  if (data.status === "cancelled" || data.isTest) {
    ctx.save();
    ctx.translate(W / 2, height / 2);
    ctx.rotate(-Math.PI / 9);
    ctx.globalAlpha = 0.14;
    ctx.font = font(700, 150);
    ctx.fillStyle = C.red;
    ctx.textAlign = "center";
    ctx.direction = "ltr";
    ctx.fillText(data.status === "cancelled" ? "CANCELLED" : "TEST", 0, 50);
    ctx.restore();
  }
  return height;
}

export async function ensureInvoiceFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const loads = [
    document.fonts.load('400 20px "Alexandria"', "Aa أب"),
    document.fonts.load('600 20px "Alexandria"', "Aa أب"),
    document.fonts.load('700 20px "Alexandria"', "Aa أب"),
  ];
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 4000))]);
}

export async function loadBitmap(
  url: string,
  maxSide = 320,
  timeoutMs = 12_000,
): Promise<ImageBitmap | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const blob = await res.blob();
    const probe = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(probe.width, probe.height));
    if (scale >= 1) return probe;
    const small = await createImageBitmap(blob, {
      resizeWidth: Math.round(probe.width * scale),
      resizeHeight: Math.round(probe.height * scale),
      resizeQuality: "high",
    });
    probe.close();
    return small;
  } catch {
    return null;
  }
}

export async function renderInvoiceBlob(
  data: InvoiceData,
  assets: InvoiceAssets,
): Promise<{ blob: Blob; width: number; height: number }> {
  await ensureInvoiceFonts();
  const scratch = document.createElement("canvas");
  scratch.width = 4;
  scratch.height = 4;
  const sctx = scratch.getContext("2d")!;
  const height = Math.ceil(drawInvoice(sctx, data, assets));

  const canvas = document.createElement("canvas");
  canvas.width = INVOICE_WIDTH * INVOICE_SCALE;
  canvas.height = height * INVOICE_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(INVOICE_SCALE, INVOICE_SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, INVOICE_WIDTH, height);
  drawInvoice(ctx, data, assets);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
  return { blob, width: canvas.width, height: canvas.height };
}
