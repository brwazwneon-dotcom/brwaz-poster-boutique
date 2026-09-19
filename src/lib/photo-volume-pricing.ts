// Volume offers for the per-photo print sizes (10×15 / 13×18 / 15×20): the
// more photos in one order, the lower the price of EVERY photo in it.
//
// Used by both the Photo Printing page (to show and total the price) and
// createPhoto4x6Order (which recomputes the price on the server), so the two
// can never disagree. A tier can only ever lower the price: if the admin sets
// a regular per-photo price at or below a tier's price, the regular price wins.

export type LoosePhotoSize = "10x15" | "13x18" | "15x20";

export type PhotoVolumeTier = { minQty: number; price: number };

export const PHOTO_VOLUME_TIERS: Record<LoosePhotoSize, PhotoVolumeTier[]> = {
  "10x15": [
    { minQty: 50, price: 9 },
    { minQty: 100, price: 8 },
  ],
  "13x18": [
    { minQty: 50, price: 13 },
    { minQty: 100, price: 11 },
  ],
  "15x20": [
    { minQty: 50, price: 18 },
    { minQty: 100, price: 15 },
  ],
};

/** Price of one photo when `qty` photos of `size` are ordered. */
export function photoUnitPrice(size: LoosePhotoSize, qty: number, basePrice: number): number {
  let price = basePrice;
  for (const tier of PHOTO_VOLUME_TIERS[size]) {
    if (qty >= tier.minQty && tier.price < price) price = tier.price;
  }
  return price;
}
