-- Post-order success message setting for the customer.
-- ON (default): the post-order success toast is shown to the customer after order completion.
-- OFF: the toast is hidden; the customer still completes the order exactly as before.
INSERT INTO public.site_settings (key, value) VALUES
  ('post_order_success_message_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
