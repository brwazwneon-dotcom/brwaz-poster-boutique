# Inline Category Management in Product Upload

Add "➕ Add New" at the bottom of the Main Category and Sub Category dropdowns on the AI Product Upload page (`AiPosterUpload.tsx`), plus quick Edit/Delete for existing categories — all without page refresh.

## New component

`src/components/admin/CategoryEditorDialog.tsx` — one dialog reused for Create + Edit, both Main and Sub.

Fields:
- Name (required)
- Slug (auto-generated from name via existing `slugify`, editable)
- Image (optional; upload to `categories` storage bucket like existing Categories tab does)
- Display order (number, defaults to `max(sort_order)+1` among siblings)
- Active / Hidden toggle (writes `hidden` boolean + `status`)
- Parent (hidden field, pre-filled from context; only shown as read-only chip for sub)

Buttons: Save · Cancel. Uses existing Dialog/Input/Switch shadcn primitives so the dark BRWAZWNEON style stays intact.

On Save: insert (or update) via supabase client → returns the row → parent invalidates the categories query and auto-selects the new id.

## Dropdown changes in `AiPosterUpload.tsx`

Both selects (per-row and bulk) currently render `<select>` populated from `mains` / `subsOf(catId)`. Extend each with:

1. Optgroup at the bottom containing a single "➕ Add New" option with `value="__new__"`. Green plus icon via a `<span>` prefix (native selects don't accept icons, so we use the emoji already requested).
2. On change === `"__new__"`, revert the selected value and open `CategoryEditorDialog` in create mode with `parentId` = null (main) or current row's `category_id` (sub).
3. After save: refetch categories, then set the row's `category_id` / `subcategory_id` to the returned id.
4. Sub "➕ Add New" is disabled (rendered but with `disabled` attribute) when no main is selected.

Small "✎" and "🗑" buttons render next to each dropdown when a value is selected, opening the editor or a delete confirmation.

## Delete flow

`deleteCategory(id)`:
1. Confirm dialog.
2. Query `posters` count where `category_id = id`. If > 0, block deletion and show a follow-up "Move products to…" select of sibling categories; on confirm, `UPDATE posters SET category_id = <new> WHERE category_id = <old>`, then delete.
3. For a main category, also block if it has sub-categories with assigned posters (recursively count).
4. Delete row, refetch, clear any row using it.

## Data refresh

Reuse the existing `categoriesRef` + `useQuery(['admin-categories'])` pattern already in the file. After every create/edit/delete call `queryClient.invalidateQueries({ queryKey: ['admin-categories'] })` and await refetch before selecting the new id.

## What stays unchanged

- All existing AI upload, bulk apply, auto-categorize, subcategory suggestion, and publish flows.
- Categories tab and SubCategoriesManagerTab keep working — they read the same table.
- Dark theme, spacing, existing dropdown positions — only additions.

## Technical details

- Files edited: `src/components/admin/AiPosterUpload.tsx`.
- Files added: `src/components/admin/CategoryEditorDialog.tsx`, `src/components/admin/CategoryDeleteDialog.tsx`.
- No DB migration needed — schema already supports `parent_id`, `image`, `sort_order`, `hidden`, `status`.
- Image upload uses existing `categories` bucket path `${crypto.randomUUID()}-${filename}`.
- Slug uniqueness enforced client-side by appending `-2`, `-3`, … on conflict (existing pattern in the file).
- No changes to `BulkPosterUploader.tsx` in this pass unless you want the same treatment there — say the word and I'll mirror it.

Approve and I'll implement.
