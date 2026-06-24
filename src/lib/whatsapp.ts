// Update this number to your WhatsApp business line (international format, digits only).
export const WHATSAPP_NUMBER = "201000000000";

export function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}