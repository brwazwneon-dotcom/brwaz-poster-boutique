-- =========================================================
-- H1 (2026-09-12 audit): visitor_profiles IDOR + admin_notifications
-- open anon INSERT
-- =========================================================

-- -----------------------------------------------------------------
-- 1) visitor_profiles: anon can currently UPDATE the `phone` column on
--    ANY row via a direct PostgREST call (vp_anon_update is USING(true),
--    and anon has table-wide UPDATE grant), completely bypassing the
--    merge_visitor_to_phone() RPC and its (weak) validation. This lets
--    anyone attach an arbitrary phone number to an arbitrary visitor_id
--    they don't own, corrupting admin_customer_profile() lookups.
--
--    Fix: anon/authenticated can only UPDATE the behavioral columns they
--    legitimately need (device/city/governorate/country/interests/
--    visits_count/last_seen/updated_at) directly. `phone` and `visitor_id`
--    are excluded from the column grant, so they can only ever be set
--    through the SECURITY DEFINER merge_visitor_to_phone() RPC below,
--    which now validates the phone format server-side.
--
--    This does not change any legitimate app behavior: the app never
--    updates `phone` via a raw .update() call on this table (grep
--    confirms only merge_visitor_to_phone() writes it), and never
--    updates visitor_id (it's the primary key).
-- -----------------------------------------------------------------
REVOKE UPDATE ON public.visitor_profiles FROM anon, authenticated;
GRANT UPDATE (device, city, governorate, country, interests, visits_count, last_seen, updated_at)
  ON public.visitor_profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.merge_visitor_to_phone(
  _visitor_id text,
  _phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _visitor_id IS NULL OR length(_visitor_id) < 8 THEN
    RETURN;
  END IF;
  -- Egyptian mobile format, same rule enforced client-side at checkout
  -- (01 + 9 digits). Anything else is silently ignored rather than
  -- stored, so a malformed/spoofed value can't corrupt the profile.
  IF _phone IS NULL OR _phone !~ '^01[0-9]{9}$' THEN
    RETURN;
  END IF;
  UPDATE public.visitor_profiles
     SET phone = _phone, updated_at = now()
   WHERE visitor_id = _visitor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_visitor_to_phone(text, text) TO anon, authenticated;

-- -----------------------------------------------------------------
-- 2) admin_notifications: anon has a direct table-level INSERT grant and
--    an "Anyone can insert notifications" WITH CHECK(true) policy, but no
--    client code ever calls .from("admin_notifications").insert(...) —
--    the only real inserts come from server-side trigger functions
--    (e.g. the new-order/new-custom-order notifier), which run
--    SECURITY DEFINER and don't need this grant at all. Anyone with the
--    public anon key can currently inject a fake "notification" (spoofed
--    title/body/link) straight into the admin's live notification feed.
--
--    Fix: remove the anon insert path entirely. Trigger-driven inserts
--    are unaffected (SECURITY DEFINER functions run as their owner,
--    independent of the calling role's grants).
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;
REVOKE INSERT ON public.admin_notifications FROM anon;
