import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Search as SearchIcon, X, Heart, MessageCircle, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWishlist } from "@/lib/wishlist";
import { whatsappLink } from "@/lib/whatsapp";
import { sessionId } from "@/lib/analytics";
import { trackEvent } from "@/lib/meta-pixel";
import { FramePreview } from "@/components/FramePreview";
import {
  CATEGORY_CHIPS,
  matchSuggestions,
  SUGGESTIONS,
  type AssistantCategory,
  type Suggestion,
} from "@/lib/assistant-suggestions";

type PosterHit = {
  id: string;
  title: string;
  image_url: string;
  category_slug: string | null;
  category_name: string | null;
};

const CATEGORY_TO_SLUG: Partial<Record<AssistantCategory, string>> = {
  football: "football",
  movies: "movies",
  "tv-series": "tv-series",
  anime: "anime",
  cars: "cars",
};

function logRequest(payload: {
  keyword: string;
  category?: string | null;
  selected_title?: string | null;
  selected_poster_id?: string | null;
  action: "search" | "select" | "wishlist" | "whatsapp" | "chip";
  meta?: Record<string, unknown>;
}) {
  try {
    void supabase.from("assistant_requests").insert({
      keyword: payload.keyword,
      category: payload.category ?? null,
      selected_title: payload.selected_title ?? null,
      selected_poster_id: payload.selected_poster_id ?? null,
      action: payload.action,
      session_id: sessionId(),
      meta: (payload.meta ?? null) as never,
    });
  } catch {
    /* noop */
  }
}

export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<AssistantCategory | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { has, toggle } = useWishlist();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const term = query.trim();
  const suggestions = useMemo(() => matchSuggestions(term, 8), [term]);

  // Debounced search log
  useEffect(() => {
    if (term.length < 2) return;
    const t = setTimeout(() => {
      logRequest({ keyword: term, action: "search" });
      try { trackEvent("Search", { search_string: term, source: "assistant" }); } catch { /* noop */ }
    }, 700);
    return () => clearTimeout(t);
  }, [term]);

  const { data: posters = [], isFetching } = useQuery({
    queryKey: ["assistant-search", term],
    enabled: open && term.length >= 1,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_posters", { q: term, lim: 24 });
      if (error) throw error;
      return (data ?? []) as PosterHit[];
    },
  });

  // When a category chip is active but no query, show suggestions from that category
  const chipSuggestions = useMemo(() => {
    if (!activeChip) return [] as Suggestion[];
    return SUGGESTIONS.filter((s) => s.category === activeChip).slice(0, 12);
  }, [activeChip]);

  const chooseSuggestion = (s: Suggestion) => {
    setQuery(s.q);
    setActiveChip(s.category);
    logRequest({ keyword: s.q, category: s.category, action: "select", meta: { source: "suggestion" } });
  };

  const clickChip = (cat: AssistantCategory) => {
    setActiveChip(cat);
    logRequest({ keyword: cat, category: cat, action: "chip" });
    if (cat === "custom") {
      setOpen(false);
      return;
    }
  };

  const chipToLink = (cat: AssistantCategory) => {
    if (cat === "custom") return "/custom-design";
    if (cat === "family") return "/photo-printing";
    const slug = CATEGORY_TO_SLUG[cat];
    return slug ? `/category/${slug}` : null;
  };

  return (
    <>
      {/* Floating trigger — sits above WhatsApp button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="مساعد اختيار الصور"
        style={{ bottom: "calc(6rem + var(--mobile-bar-h, 0px))" }}
        className="fixed right-5 z-50 flex items-center gap-2 rounded-full border border-primary/40 bg-gradient-to-br from-neutral-900 to-black px-4 py-3 text-xs font-medium text-primary-foreground shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur transition hover:scale-[1.03] hover:shadow-[0_14px_36px_rgba(255,255,255,0.15)] sm:!bottom-28 sm:right-8"
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
        </span>
        <span className="hidden text-[11px] uppercase tracking-widest sm:inline">مساعد اختيار الصور</span>
        <span className="sm:hidden text-[11px]">مساعد الصور</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Poster assistant"
        >
          <div
            className="relative flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border bg-card/40 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Assistant</div>
                  <div className="text-sm font-semibold sm:text-base">مساعد اختيار الصور</div>
                </div>
              </div>
              <button
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {/* Greeting */}
              <p className="text-sm leading-relaxed text-foreground/90" dir="rtl">
                تحب صور لمين؟ لاعب، فيلم، مسلسل، أنمي، عربية، مغني، أو أي حاجة في بالك؟
              </p>

              {/* Search */}
              <div className="relative mt-3">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="اكتب اسم لاعب، فيلم، أنمي… / Cristiano, Batman, Naruto…"
                  className="w-full rounded-sm border border-border bg-card py-3 pl-9 pr-3 text-sm outline-none focus:border-primary"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    aria-label="Clear"
                    onClick={() => { setQuery(""); setActiveChip(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Autocomplete */}
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.q + s.label}
                      onClick={() => chooseSuggestion(s)}
                      className="rounded-sm border border-border bg-card px-2.5 py-1 text-xs hover:border-primary"
                    >
                      {s.labelAr ? `${s.label} · ${s.labelAr}` : s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Category chips */}
              <div className="mt-4">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  اختصارات · Suggested
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_CHIPS.map((c) => {
                    const active = activeChip === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => clickChip(c.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:border-primary"
                        }`}
                      >
                        <span aria-hidden>{c.emoji}</span>
                        <span>{c.labelAr}</span>
                        <span className="text-[10px] opacity-60">· {c.label}</span>
                      </button>
                    );
                  })}
                </div>

                {activeChip && chipToLink(activeChip) && (
                  <div className="mt-2">
                    <Link
                      to={chipToLink(activeChip)!}
                      onClick={() => setOpen(false)}
                      className="text-[11px] uppercase tracking-widest text-primary underline-offset-4 hover:underline"
                    >
                      Browse full "{activeChip}" collection →
                    </Link>
                  </div>
                )}
              </div>

              {/* Suggestions from chip when no query */}
              {!term && chipSuggestions.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Popular in category</div>
                  <div className="flex flex-wrap gap-1.5">
                    {chipSuggestions.map((s) => (
                      <button
                        key={s.q}
                        onClick={() => chooseSuggestion(s)}
                        className="rounded-sm border border-border bg-card px-2.5 py-1 text-xs hover:border-primary"
                      >
                        {s.labelAr ? `${s.label} · ${s.labelAr}` : s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results grid */}
              {term && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {isFetching ? "Searching…" : `${posters.length} result${posters.length === 1 ? "" : "s"} for "${term}"`}
                    </div>
                  </div>

                  {posters.length === 0 && !isFetching ? (
                    <div className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      لسه ماعندناش نتيجة مباشرة لـ "{term}". ابعتلنا لينك الصورة اللي عايزها على واتساب ونجهزها لك.
                      <div className="mt-3">
                        <a
                          href={whatsappLink(`Hello, I want a poster of: ${term}. I want to print it as a frame.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => logRequest({ keyword: term, action: "whatsapp", meta: { empty: true } })}
                          className="inline-flex items-center gap-2 rounded-sm bg-[#25D366] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                        >
                          <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {posters.map((p) => (
                        <ResultCard
                          key={p.id}
                          poster={p}
                          keyword={term}
                          wished={has(p.id)}
                          onWish={() => {
                            void toggle(p.id);
                            logRequest({
                              keyword: term,
                              category: p.category_slug,
                              selected_title: p.title,
                              selected_poster_id: p.id,
                              action: "wishlist",
                            });
                          }}
                          onSelect={() => {
                            logRequest({
                              keyword: term,
                              category: p.category_slug,
                              selected_title: p.title,
                              selected_poster_id: p.id,
                              action: "select",
                            });
                            setOpen(false);
                          }}
                          onWhats={() => {
                            logRequest({
                              keyword: term,
                              category: p.category_slug,
                              selected_title: p.title,
                              selected_poster_id: p.id,
                              action: "whatsapp",
                            });
                          }}
                        />
                      ))}
                    </div>
                  )}

                  <p className="mt-4 rounded-sm border border-border bg-card/50 p-3 text-[11px] leading-relaxed text-muted-foreground" dir="rtl">
                    اختار الصورة أو ابعتلنا لينك الصورة اللي عجبتك، واحنا هنجهزها للطباعة بأعلى جودة.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultCard({
  poster,
  keyword,
  wished,
  onSelect,
  onWish,
  onWhats,
}: {
  poster: PosterHit;
  keyword: string;
  wished: boolean;
  onSelect: () => void;
  onWish: () => void;
  onWhats: () => void;
}) {
  const slug = poster.category_slug ?? "";
  const msg = `Hello, I want this design: ${poster.title} (search: ${keyword}). I want to print it as a frame.`;
  return (
    <div className="group overflow-hidden rounded-sm border border-border bg-card transition hover:border-primary">
      <div className="relative aspect-[3/4] overflow-hidden">
        <FramePreview
          posterUrl={poster.image_url}
          title={poster.title}
          aspectClassName="aspect-[3/4]"
          bare
          loading="lazy"
          className="h-full w-full"
        />
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-medium">{poster.title}</div>
        <div className="mt-0.5 truncate text-[10px] uppercase tracking-widest text-muted-foreground">
          {poster.category_name ?? "—"}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {slug ? (
            <Link
              to="/category/$slug"
              params={{ slug }}
              onClick={onSelect}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-sm bg-primary px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              <Check className="h-3 w-3" /> Select
            </Link>
          ) : (
            <button
              onClick={onSelect}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-sm bg-primary px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-primary-foreground"
            >
              <Check className="h-3 w-3" /> Select
            </button>
          )}
          <button
            onClick={onWish}
            aria-label="Wishlist"
            className={`inline-flex items-center justify-center rounded-sm border p-1.5 text-xs ${wished ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Heart className={`h-3.5 w-3.5 ${wished ? "fill-current" : ""}`} />
          </button>
          <a
            href={whatsappLink(msg)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWhats}
            aria-label="Send on WhatsApp"
            className="inline-flex items-center justify-center rounded-sm border border-border p-1.5 text-[#25D366] hover:bg-accent"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}