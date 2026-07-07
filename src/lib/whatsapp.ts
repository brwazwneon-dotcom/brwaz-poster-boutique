// BRWAZWNEON WhatsApp business line (international format, digits only).
// 01148370194 (EG) -> +20 1148370194
export const WHATSAPP_NUMBER = "201148370194";

export function whatsappLink(message: string) {
  return `https://web.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
}