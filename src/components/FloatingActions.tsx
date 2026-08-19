import { usePerformanceFlags } from "@/lib/performance-flags";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { MobileFloatingActions } from "@/components/MobileFloatingActions";

export function FloatingActions() {
  const perf = usePerformanceFlags();
  return (
    <>
      <MobileFloatingActions offersEnabled={perf.offers_enabled} />
      {perf.whatsapp_enabled && <WhatsAppButton />}
    </>
  );
}
