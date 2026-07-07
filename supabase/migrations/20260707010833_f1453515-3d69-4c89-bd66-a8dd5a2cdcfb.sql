-- Roll back manual verification bumps on THE MATRIX (1)
UPDATE public.posters
SET views_count = views_count - 1,
    unique_views_count = unique_views_count - 1,
    cart_adds_count = cart_adds_count - 2,
    sales_count = sales_count - 1,
    total_view_seconds = total_view_seconds - 45
WHERE id = 'be4ac8ad-0218-4094-89f8-85b3dd28d391';