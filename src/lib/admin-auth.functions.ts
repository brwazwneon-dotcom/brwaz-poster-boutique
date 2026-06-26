import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BRAND_ADMIN_EMAIL = "brwazwneon@gmail.com";

export const ensureBrandAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String(context.claims.email ?? "").toLowerCase();

    if (email !== BRAND_ADMIN_EMAIL) {
      return { isAdmin: false };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("user_roles").upsert(
      {
        user_id: context.userId,
        role: "admin",
      },
      { onConflict: "user_id,role" },
    );

    if (error) throw new Error(error.message);

    return { isAdmin: true };
  });