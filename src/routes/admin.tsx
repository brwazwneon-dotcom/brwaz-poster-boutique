import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/categories";
import { Trash2, Upload, LogOut } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Poster = { id: string; title: string; image_url: string; category: string };

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].slug);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setUserId(data.session.user.id);
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!roleData);
      setReady(true);
    })();
  }, [navigate]);

  const { data: posters = [] } = useQuery({
    queryKey: ["admin-posters"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Poster[];
    },
  });

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Choose an image");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${category}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("posters")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("posters").getPublicUrl(path);
      const { error: insErr } = await supabase.from("posters").insert({
        title: title || file.name.replace(/\.[^.]+$/, ""),
        category,
        image_url: pub.publicUrl,
      });
      if (insErr) throw insErr;
      toast.success("Poster uploaded");
      setTitle("");
      setFile(null);
      (document.getElementById("poster-file") as HTMLInputElement | null) &&
        ((document.getElementById("poster-file") as HTMLInputElement).value = "");
      qc.invalidateQueries({ queryKey: ["admin-posters"] });
      qc.invalidateQueries({ queryKey: ["posters"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (p: Poster) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await supabase.from("posters").delete().eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-posters"] });
    qc.invalidateQueries({ queryKey: ["posters"] });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (!ready) {
    return <div className="container-page py-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-xl rounded-sm border border-border bg-card p-8 text-center">
          <h1 className="text-display text-3xl">No admin access</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account ({userId?.slice(0, 8)}…) isn't an admin yet. Ask the
            site owner to grant the <code>admin</code> role to your user in the
            <code> user_roles</code> table.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={signOut}
              className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              Sign out
            </button>
            <Link
              to="/"
              className="rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Dashboard</div>
          <h1 className="text-display text-5xl">Posters</h1>
        </div>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      <form
        onSubmit={upload}
        className="mt-8 grid gap-3 rounded-sm border border-border bg-card p-6 md:grid-cols-[1fr_1fr_auto_auto]"
      >
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <input
          id="poster-file"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground"
        />
        <button
          type="submit"
          disabled={uploading}
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {posters.map((p) => (
          <div key={p.id} className="group relative overflow-hidden rounded-sm border border-border bg-card">
            <div className="aspect-[2/3] overflow-hidden">
              <img src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm">{p.title}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{p.category}</div>
              </div>
              <button
                onClick={() => remove(p)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {posters.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
            No posters yet. Upload your first above.
          </div>
        )}
      </div>
    </div>
  );
}