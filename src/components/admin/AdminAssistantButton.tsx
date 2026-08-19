import { useState } from "react";
import { Bot } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminAssistantChat } from "./AdminAssistantChat";
import { useAdminI18n } from "@/lib/admin-i18n";

export function AdminAssistantButton() {
  const [open, setOpen] = useState(false);
  const { lang } = useAdminI18n();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 start-6 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground shadow-lg hover:opacity-90"
        title="مساعد الذكاء الاصطناعي"
      >
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">المساعد الذكي</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={lang === "ar" ? "right" : "left"}
          className="w-full sm:max-w-lg p-0 flex flex-col"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>المساعد الذكي</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0">
            <AdminAssistantChat compact />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
