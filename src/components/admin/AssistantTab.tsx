import { AdminAssistantChat } from "./AdminAssistantChat";

export function AssistantTab() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold">المساعد الذكي</h2>
        <p className="text-sm text-muted-foreground mt-1">
          اسأل عن بيانات المتجر، ولّد أوصاف منتجات ورسائل تسويقية. المحادثات لا تُحفظ.
        </p>
      </div>
      <AdminAssistantChat />
    </div>
  );
}
