import { Skeleton } from "@/components/ui/skeleton";

/** For tabs that render a list of items once loaded (most tabs). */
export function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-sm border border-border p-3">
          <Skeleton className="h-12 w-16 shrink-0 rounded-sm" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** For dashboard-style tabs that render a grid of stat tiles once loaded. */
export function LoadingTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-sm border border-border p-4">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** For tabs that render a grid of image thumbnails once loaded (Media Library). */
export function LoadingGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-sm" />
      ))}
    </div>
  );
}

/** For tabs/sections that render a stack of labeled fields once loaded. */
export function LoadingForm({ count = 4 }: { count?: number }) {
  return (
    <div className="max-w-md space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-32 shrink-0" />
          <Skeleton className="h-8 flex-1" />
        </div>
      ))}
    </div>
  );
}
