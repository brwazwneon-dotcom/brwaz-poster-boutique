import { supabase } from "@/integrations/supabase/client";

export type DetectResult = { created: number; ran_at: string };

export async function runBugDetector(): Promise<DetectResult> {
  const { data, error } = await supabase.rpc("detect_bugs" as never);
  if (error) throw error;
  return (data ?? { created: 0, ran_at: new Date().toISOString() }) as DetectResult;
}
