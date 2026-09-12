import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search as SearchIcon, Clock, TrendingUp, X } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchPostersPublic, getTrendingSearchesPublic } from "@/lib/db-public.functions";
import { FramedArtwork } from "@/components/FramedArtwork";

const RECENT_KEY = "brw_recent_searches_v1";
const MAX_RECENT = 6;

export type SearchHit = {
  id: string;
  title: string;
  image_url: string;
  category_slug: string | null;
  category_name: string | null;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string) {
  if (typeof window === "undefined") return;
  const term = q.trim();
  if (term.length < 2) return;
  const cur = readRecent().filter((x) => x.toLowerCase() !== term.toLowerCase());
  const next = [term, ...cur].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function SearchBox({
  variant = "header",
  autoFocus = false,
  initialValue = "",
  onSubmitNavigate = true,
  onChange,
  onNavigate,
  placeholder,
}: {
  variant?: "header" | "page";
  autoFocus?: boolean;
  initialValue?: string;
  onSubmitNavigate?: boolean;
  onChange?: (q: string) => void;
  onNavigate?: () => void;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith("ar");
  const text = (key: string, en: string, ar: string, values?: Record<string, string>) =>
    t(key, { defaultValue: isArabic ? ar : en, ...values });
  const [value, setValue] = useState(initialValue);
  const [debounced, setDebounced] = useState(normalize(initialValue));
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(readRecent());
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(normalize(value)), 120);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    onChange?.(value);
  }, [value, onChange]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["search-suggest", debounced],
    enabled: debounced.length >= 1,
    staleTime: 60_000,
    queryFn: async () => {
      return searchPostersPublic({ data: { q: debounced, limit: 8 } }) as Promise<SearchHit[]>;
    },
  });

  const { data: trending = [] } = useQuery({
    queryKey: ["trending-searches"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      return getTrendingSearchesPublic({ data: { limit: 8 } });
    },
  });

  const go = useCallback(
    (term: string) => {
      const q = term.trim();
      if (!q) return;
      pushRecentSearch(q);
      setOpen(false);
      onNavigate?.();
      if (onSubmitNavigate) navigate({ to: "/search", search: { q } });
    },
    [navigate, onNavigate, onSubmitNavigate],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(value);
  };

  const removeRecent = (term: string) => {
    const next = readRecent().filter((x) => x.toLowerCase() !== term.toLowerCase());
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
    setRecent(next);
  };

  const inputCls =
    variant === "header"
      ? "w-full rounded-sm border border-border bg-card py-2 ps-9 pe-3 text-sm outline-none focus:border-primary"
      : "w-full rounded-sm border border-border bg-card py-4 ps-11 pe-4 text-base outline-none focus:border-primary";
  const iconCls =
    variant === "header"
      ? "pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      : "pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground";

  const showResults = open && debounced.length >= 1;
  const showEmpty = open && debounced.length < 1;

  return (
    <div ref={wrapRef} className="relative w-full">
      <form onSubmit={submit} className="relative">
        <SearchIcon className={iconCls} />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? t("header.searchPlaceholder")}
          className={inputCls}
          aria-label={t("header.search")}
          autoComplete="off"
          spellCheck={false}
        />
      </form>

      {(showResults || showEmpty) && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-sm border border-border bg-background shadow-2xl">
          {showEmpty && (
            <div className="p-3 text-xs">
              {recent.length > 0 && (
                <div className="mb-3">
                  <div className="mb-2 flex items-center gap-2 px-2 uppercase tracking-widest text-muted-foreground">
                    <Clock className="h-3 w-3" /> {t("header.recentSearches")}
                  </div>
                  <ul>
                    {recent.map((r) => (
                      <li
                        key={r}
                        className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                      >
                        <button
                          className="flex-1 text-left text-sm"
                          onClick={() => {
                            setValue(r);
                            go(r);
                          }}
                        >
                          {r}
                        </button>
                        <button
                          aria-label={t("common.remove")}
                          onClick={() => removeRecent(r)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {trending.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 px-2 uppercase tracking-widest text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> {t("header.trendingSearches")}
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                    {trending.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setValue(t);
                          go(t);
                        }}
                        className="rounded-sm border border-border bg-card px-2 py-1 text-xs hover:border-primary"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recent.length === 0 && trending.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {text(
                    "header.startTyping",
                    "Start typing to search 10,000+ posters",
                    "ابدأ الكتابة للبحث في آلاف البوسترات",
                  )}
                </div>
              )}
            </div>
          )}

          {showResults && (
            <div>
              {isFetching && hits.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  {text("header.searching", "Searching...", "جارٍ البحث...")}
                </div>
              )}
              {!isFetching && hits.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  {text(
                    "header.noMatches",
                    `No matches for "${debounced}".`,
                    `لا توجد نتائج عن "${debounced}".`,
                    {
                      term: debounced,
                    },
                  )}
                </div>
              )}
              {hits.length > 0 && (
                <ul className="divide-y divide-border">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <Link
                        to="/category/$slug"
                        params={{ slug: h.category_slug ?? "" }}
                        onClick={() => {
                          pushRecentSearch(debounced);
                          setOpen(false);
                        }}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-accent"
                      >
                        <FramedArtwork
                          posterUrl={h.image_url}
                          loading="lazy"
                          aspectClassName="h-12 w-9"
                          className="flex-none"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{h.title}</div>
                          <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                            {h.category_name ?? "—"}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => go(value)}
                className="block w-full border-t border-border bg-card px-3 py-2 text-center text-xs uppercase tracking-widest hover:bg-accent"
              >
                {text(
                  "header.seeAllResults",
                  `See all results for "${debounced}"`,
                  `عرض كل النتائج عن "${debounced}"`,
                  { term: debounced },
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
