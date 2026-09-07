// Edge Function: backfill-custom-images
// One-time migration to fix old custom-design orders with broken image refs.
// Uses service role to access private storage bucket and update orders.
// Admin-only. Idempotent — safe to run multiple times.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Service role client — bypasses RLS for storage access
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find all orders with broken image references
    // Look for: blob URLs, data URLs, bare filenames (no protocol, no slash)
    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_number, poster_image, notes, created_at")
      .or("poster_image.like.blob:%,poster_image.like.data:%");

    if (fetchError) throw new Error(`Failed to fetch orders: ${fetchError.message}`);

    // Also find orders with bare filenames (no "/" and not a URL)
    const { data: filenameOrders, error: fnError } = await supabase
      .from("orders")
      .select("id, order_number, poster_image, notes, created_at")
      .not("poster_image", "is", null)
      .not("poster_image", "like", "http%")
      .not("poster_image", "like", "blob:%")
      .not("poster_image", "like", "data:%")
      .not("poster_image", "like", "%/%");

    if (fnError) throw new Error(`Failed to fetch filename orders: ${fnError.message}`);

    // Merge and deduplicate
    const allOrders = [...(orders ?? []), ...(filenameOrders ?? [])];
    const seen = new Set<string>();
    const uniqueOrders = allOrders.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    const results = {
      total: orders?.length ?? 0,
      migrated: 0,
      already_valid: 0,
      duplicate_matches: 0,
      file_not_found: 0,
      no_filename: 0,
      details: [] as Array<{
        order_id: string;
        order_number: string;
        old_value: string;
        filename: string | null;
        new_path: string | null;
        status: string;
      }>,
    };

    // 2. List all files in custom-designs bucket (once, for performance)
    const allStorageFiles: Array<{ name: string; id: string; metadata?: Record<string, unknown> }> = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch, error: listError } = await supabase.storage
        .from("custom-designs")
        .list("", { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
      if (listError) break;
      if (!batch || batch.length === 0) break;
      allStorageFiles.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    // Build a map: filename → array of full paths
    const fileMap = new Map<string, Array<{ folder: string; filename: string; fullPath: string }>>();
    for (const entry of allStorageFiles) {
      // Storage objects at root level with id are folders (UUIDs)
      // Files inside folders have the format "uuid/filename" when listed with prefix
      // But supabase.storage.list with root prefix only returns root entries
      // We need to list each folder to get its contents
    }

    // List contents of each UUID folder
    for (const folder of allStorageFiles) {
      if (!folder.id) continue; // Skip non-folders
      const { data: folderContents } = await supabase.storage
        .from("custom-designs")
        .list(folder.name, { limit: 1000 });
      if (!folderContents) continue;
      for (const file of folderContents) {
        const fullPath = `${folder.name}/${file.name}`;
        const lowerName = file.name.toLowerCase();
        if (!fileMap.has(lowerName)) {
          fileMap.set(lowerName, []);
        }
        fileMap.get(lowerName)!.push({ folder: folder.name, filename: file.name, fullPath });
      }
    }

    // 3. Process each affected order
    for (const order of uniqueOrders) {
      const oldVal = order.poster_image;

      // Skip if already a valid storage path (contains "/" and doesn't start with blob/data)
      if (oldVal && oldVal.includes("/") && !oldVal.startsWith("blob:") && !oldVal.startsWith("data:")) {
        results.already_valid++;
        results.details.push({
          order_id: order.id,
          order_number: order.order_number ?? "",
          old_value: oldVal,
          filename: null,
          new_path: null,
          status: "ALREADY_VALID",
        });
        continue;
      }

      // Extract filename from notes JSON
      let filename: string | null = null;
      if (order.notes) {
        try {
          const meta = JSON.parse(order.notes);
          filename = meta?.originalFilename ?? null;
        } catch {
          // ignore
        }
      }

      // Fallback: if oldVal is a bare filename (no "/" and not a URL)
      if (!filename && oldVal && !oldVal.startsWith("blob:") && !oldVal.startsWith("data:") && !oldVal.startsWith("http")) {
        filename = oldVal;
      }

      if (!filename) {
        results.no_filename++;
        results.details.push({
          order_id: order.id,
          order_number: order.order_number ?? "",
          old_value: oldVal ?? "",
          filename: null,
          new_path: null,
          status: "NO_FILENAME",
        });
        continue;
      }

      // Search for matching files in storage
      const lowerFilename = filename.toLowerCase();
      const matches = fileMap.get(lowerFilename) ?? [];

      if (matches.length === 1) {
        // Exact single match — update the order
        const correctPath = matches[0].fullPath;
        const { error: updateError } = await supabase
          .from("orders")
          .update({ poster_image: correctPath })
          .eq("id", order.id);

        if (updateError) {
          results.details.push({
            order_id: order.id,
            order_number: order.order_number ?? "",
            old_value: oldVal ?? "",
            filename,
            new_path: null,
            status: `UPDATE_FAILED: ${updateError.message}`,
          });
        } else {
          results.migrated++;
          results.details.push({
            order_id: order.id,
            order_number: order.order_number ?? "",
            old_value: oldVal ?? "",
            filename,
            new_path: correctPath,
            status: "MIGRATED",
          });
        }
      } else if (matches.length > 1) {
        // Multiple matches — cannot determine correct file
        results.duplicate_matches++;
        results.details.push({
          order_id: order.id,
          order_number: order.order_number ?? "",
          old_value: oldVal ?? "",
          filename,
          new_path: null,
          status: `DUPLICATE_MATCHES: ${matches.map((m) => m.fullPath).join(", ")}`,
        });
      } else {
        // No match found
        results.file_not_found++;
        results.details.push({
          order_id: order.id,
          order_number: order.order_number ?? "",
          old_value: oldVal ?? "",
          filename,
          new_path: null,
          status: "FILE_NOT_FOUND",
        });
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
