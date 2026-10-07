// Stand-in for "@/integrations/supabase/client" in the browser harness only.
// Records every signing request so the test can assert on how images are fetched.
type Call = {
  bucket: string;
  path: string;
  ttl: number;
  opts: Record<string, unknown> | undefined;
};
const w = window as unknown as { __signCalls: Call[]; __imgs: Record<string, string> };
w.__signCalls = [];
w.__imgs = {};

export const supabase = {
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string, ttl: number, opts?: Record<string, unknown>) => {
        w.__signCalls.push({ bucket, path, ttl, opts });
        if (path.startsWith("denied/")) return { data: null, error: { message: "not authorized" } };
        return { data: { signedUrl: w.__imgs[path] ?? w.__imgs["*"] }, error: null };
      },
    }),
  },
};
