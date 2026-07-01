import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  sort_order: number;
  parent_id: string | null;
  description?: string | null;
  icon?: string | null;
  hidden?: boolean;
};

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,slug,image,sort_order,parent_id,description,icon,hidden")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

/** Returns only top-level categories (no parent). */
export function useRootCategories() {
  const q = useCategories();
  return {
    ...q,
    data: (q.data ?? []).filter((c) => !c.parent_id),
  };
}

/** Build a quick map of children for any given category id. */
export function buildCategoryTree(categories: Category[]) {
  const childrenOf = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parent_id ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(c);
  }
  return childrenOf;
}

/** All descendant category ids (including the root itself). */
export function descendantIds(categories: Category[], rootId: string): string[] {
  const ids: string[] = [rootId];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of categories) {
      if (c.parent_id === cur) {
        ids.push(c.id);
        stack.push(c.id);
      }
    }
  }
  return ids;
}