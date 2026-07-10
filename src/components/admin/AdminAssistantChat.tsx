import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Send, RotateCcw, Loader2, Wrench, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  compact?: boolean;
};

export function AdminAssistantChat({ compact }: Props) {
  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState(0);

  const transport = new DefaultChatTransport({
    api: "/api/admin-assistant",
    fetch: async (input, init) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: `admin-assistant-${sessionKey}`,
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionKey, status === "ready" ? 1 : 0]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  const reset = () => {
    setMessages([]);
    setSessionKey((k) => k + 1);
    setInput("");
  };

  const suggestions = [
    "كم أوردر النهاردة؟",
    "أعلى 5 منتجات مبيعًا",
    "آخر 10 طلبات",
    "التنبيهات اللي لسه مقريتش",
  ];

  return (
    <div className={cn("flex flex-col bg-background", compact ? "h-full" : "h-[70vh] rounded-sm border border-border")}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">مساعد Brwaz</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              مساعد الأدمن الذكي
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
          title="محادثة جديدة"
        >
          <RotateCcw className="h-3 w-3" /> جديد
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md text-center py-8">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-7 w-7" />
            </div>
            <div className="mt-4 text-sm font-medium">اسألني عن أي حاجة في المتجر</div>
            <div className="mt-1 text-xs text-muted-foreground">
              الطلبات، المنتجات، التنبيهات، وأقدر أساعدك أكتب أوصاف ورسائل تسويقية.
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage({ text: s })}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> جاري التفكير...
          </div>
        )}

        {error && (
          <div className="rounded-sm border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            حصل خطأ: {error.message}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="اكتب سؤالك..."
            className="flex-1 resize-none rounded-sm border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary max-h-40"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-primary text-primary-foreground disabled:opacity-40"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageRow({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap rounded-sm px-3 py-2 text-sm leading-relaxed",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {part.text}
              </div>
            );
          }
          if (part.type?.startsWith("tool-") || part.type === "dynamic-tool") {
            const anyPart = part as unknown as {
              type: string;
              state?: string;
              input?: unknown;
              output?: unknown;
              errorText?: string;
            };
            const toolName = anyPart.type.replace(/^tool-/, "");
            const done = anyPart.state === "output-available" || anyPart.state === "output-error";
            return (
              <details
                key={i}
                className="rounded-sm border border-border bg-card/50 px-2 py-1 text-xs"
              >
                <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                  {done ? (
                    <Wrench className="h-3 w-3 text-primary" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span className="font-mono">{toolName}</span>
                  <span className="text-[10px]">{done ? "تم" : "جاري..."}</span>
                </summary>
                {anyPart.errorText && (
                  <div className="mt-1 text-destructive">{anyPart.errorText}</div>
                )}
                {anyPart.output != null && (
                  <pre className="mt-1 max-h-60 overflow-auto rounded bg-background/60 p-2 text-[10px]">
                    {JSON.stringify(anyPart.output, null, 2)}
                  </pre>
                )}
              </details>
            );
          }
          return null;
        })}
      </div>
      {isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <User className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}