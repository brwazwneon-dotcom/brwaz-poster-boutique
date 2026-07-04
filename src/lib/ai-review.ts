import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const AI_THRESHOLD_KEY = "ai_auto_approve_threshold";
export const AI_THRESHOLD_DEFAULT = 0.75;
export const AI_THRESHOLD_MIN = 0.5;
export const AI_THRESHOLD_MAX = 0.95;

export function useAiAutoApproveThreshold(): number {
  const q = useQuery({
    queryKey: ["ai-auto-approve-threshold"],
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", AI_THRESHOLD_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = data?.value as unknown;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return AI_THRESHOLD_DEFAULT;
      return Math.max(AI_THRESHOLD_MIN, Math.min(AI_THRESHOLD_MAX, n));
    },
  });
  return q.data ?? AI_THRESHOLD_DEFAULT;
}

export type ReviewReason =
  | "low_confidence"
  | "category_unclear"
  | "missing_subcategory"
  | "multiple_possible_categories"
  | "text_not_readable"
  | "similar_duplicate"
  | "ai_failed";

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  low_confidence: "Low confidence",
  category_unclear: "Category unclear",
  missing_subcategory: "Missing subcategory",
  multiple_possible_categories: "Multiple possible categories",
  text_not_readable: "Text not readable",
  similar_duplicate: "Similar image duplicate",
  ai_failed: "AI failed",
};

export type ReasonInput = {
  confidence: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  suggested_category_name: string | null;
  suggested_subcategory_name: string | null;
  hasSubsUnderParent: boolean;
  aiFailed?: boolean;
};

export function computeReviewReasons(input: ReasonInput, threshold: number): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (input.aiFailed) reasons.push("ai_failed");
  if (input.confidence != null && input.confidence < threshold) reasons.push("low_confidence");
  if (!input.category_id) {
    if (input.suggested_category_name) reasons.push("category_unclear");
    else reasons.push("category_unclear");
  }
  if (
    input.category_id &&
    !input.subcategory_id &&
    (input.suggested_subcategory_name || input.hasSubsUnderParent)
  ) {
    reasons.push("missing_subcategory");
  }
  return reasons;
}