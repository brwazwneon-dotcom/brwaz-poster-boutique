import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [{ title: "You are offline — BRWAZWNEON" }, { name: "robots", content: "noindex" }],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl">
          📡
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">You are offline</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          It looks like you've lost your internet connection. Some pages you've already visited may
          still work.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
