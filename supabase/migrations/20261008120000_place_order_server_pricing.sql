-- Server-side order placement: place_order()
--
-- The browser sends WHAT was ordered; every price, discount, packaging, tape and shipping
-- amount is computed here from site_settings and never read from the request. The order is
-- refused (SQLSTATE PC001 "price_changed", DETAIL server_total=NNN) if the total the customer
-- saw differs from the one computed here.
--
-- ADDITIVE ONLY: new nullable/default columns, helper functions and one RPC. The existing
-- direct INSERT on public.orders keeps working, and checkout falls back to it when this
-- function is not deployed. The step that closes the direct INSERT is deliberately NOT
-- here — see docs/proposed-migrations/revoke_direct_order_insert.sql.
--
-- Verified on a scratch Postgres 16 (tests/db/schema.sql mirrors the production
-- constraints) with a 150-cart parity test against src/lib/order-pricing.ts.
-- NOT verified against the real Supabase project (RLS, triggers, PostgREST permissions).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_group_id uuid,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_order_group_id ON public.orders(order_group_id);

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public._setting_num(p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (value #>> '{}')::numeric END
       FROM public.site_settings WHERE key = p_key),
    p_default)
$$;

-- Largest-remainder split (same tie-break as allocateCents() in order-pricing.ts).
CREATE OR REPLACE FUNCTION public._alloc_cents(p_total bigint, p_weights bigint[])
RETURNS bigint[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n int := COALESCE(array_length(p_weights, 1), 0);
  w bigint[] := ARRAY[]::bigint[]; s bigint := 0; i int; abs_t bigint := abs(p_total);
  base bigint[] := ARRAY[]::bigint[]; rem bigint[] := ARRAY[]::bigint[]; left_over bigint; k int; idx int;
BEGIN
  IF n = 0 THEN RETURN ARRAY[]::bigint[]; END IF;
  FOR i IN 1..n LOOP w := w || GREATEST(0, p_weights[i]); s := s + GREATEST(0, p_weights[i]); END LOOP;
  IF s = 0 THEN w := ARRAY(SELECT 1::bigint FROM generate_series(1, n)); s := n; END IF;
  left_over := abs_t;
  FOR i IN 1..n LOOP
    base := base || ((abs_t * w[i]) / s);
    rem  := rem  || ((abs_t * w[i]) % s);
    left_over := left_over - ((abs_t * w[i]) / s);
  END LOOP;
  FOR k IN 1..left_over LOOP
    idx := (SELECT o FROM generate_series(1, n) o ORDER BY rem[o] DESC, o ASC OFFSET (k - 1) LIMIT 1);
    base[idx] := base[idx] + 1;
  END LOOP;
  IF p_total < 0 THEN FOR i IN 1..n LOOP base[i] := -base[i]; END LOOP; END IF;
  RETURN base;
END $$;

-- text -> uuid, NULL for anything that is not a uuid (custom-design items have none)
CREATE OR REPLACE FUNCTION public._uuid_or_null(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END
$$;

-- ---------- order placement ----------
-- p_customer: {name, phone, governorate, address, guest_session_id}
-- p_items:    [{ poster_id, title, image, frame_type: pvc|wood, color: black|white|wood,
--                size: "30x40", qty, custom_image_path?, custom_meta?,
--                bundle?: { posters: [{poster_id,title,image}] } }]
-- p_payment:  {method: cod|instapay, screenshot_path?, is_test?, tape?: bool}
CREATE OR REPLACE FUNCTION public.place_order(p_customer jsonb, p_items jsonb, p_payment jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group uuid := gen_random_uuid();
  n int; i int; k int; r int;
  it jsonb;
  -- per line
  l_frame text[]; l_size text[]; l_qty int[]; l_bundle bool[]; l_custom bool[]; l_posters int[];
  l_unit bigint[]; l_gross bigint[]; l_disc bigint[]; l_pack bigint[]; l_ship bigint[];
  frame_prices jsonb := jsonb_build_object(
    'pvc',  jsonb_build_object('20x30',190,'30x40',250,'40x50',350),
    'wood', jsonb_build_object('20x30',190,'30x40',270,'40x50',400,'40x60',450,'50x60',500,'50x70',580,'60x90',850,'100x60',950));
  v_unit numeric; v_custom_fee numeric; v_pack numeric; v_tape_price numeric; v_tape_on bool;
  v_fee numeric; v_free numeric;
  v_subtotal bigint := 0; v_disc_total bigint := 0; v_pack_total bigint := 0; v_tape bigint := 0; v_ship bigint := 0;
  v_frames int := 0; v_phone text; v_guest text; v_method text; v_tape_req bool;
  rule record; idxs int[]; qty_sum int; sets int; avg_unit numeric; per_set bigint; rule_c bigint; parts bigint[];
  v_net bigint; v_total_row bigint; v_ids uuid[] := ARRAY[]::uuid[]; v_row uuid; v_title text; v_image text;
  v_frame_label text; v_color_label text; v_size_label text; v_notes jsonb; v_grand bigint;
  v_cents_total bigint;
BEGIN
  -- ---- customer ----
  v_phone := btrim(COALESCE(p_customer->>'phone',''));
  v_guest := btrim(COALESCE(p_customer->>'guest_session_id',''));
  IF length(btrim(COALESCE(p_customer->>'name',''))) = 0
     OR length(btrim(COALESCE(p_customer->>'governorate',''))) = 0
     OR length(btrim(COALESCE(p_customer->>'address',''))) = 0 THEN
    RAISE EXCEPTION 'missing customer information' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^01[0-9]{9}$' THEN RAISE EXCEPTION 'invalid phone' USING ERRCODE = '22023'; END IF;
  IF NOT ((length(v_guest) BETWEEN 8 AND 128) OR auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION 'missing session' USING ERRCODE = '22023';
  END IF;
  v_method := COALESCE(p_payment->>'method','');
  IF v_method NOT IN ('cod','instapay') THEN RAISE EXCEPTION 'invalid payment method' USING ERRCODE = '22023'; END IF;
  IF v_method = 'instapay' AND COALESCE(p_payment->>'screenshot_path','') = '' THEN
    RAISE EXCEPTION 'payment screenshot required' USING ERRCODE = '22023';
  END IF;
  v_tape_req := COALESCE((p_payment->>'tape')::bool, false);

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'invalid items' USING ERRCODE = '22023';
  END IF;
  n := jsonb_array_length(p_items);

  v_custom_fee := public._setting_num('custom_design_fee', 20);
  v_pack       := public._setting_num('packaging_fee', 20);
  v_tape_price := public._setting_num('double_face_tape_price', 20);
  v_tape_on    := public._setting_num('double_face_tape_enabled', 1) <> 0;
  v_fee        := public._setting_num('shipping_fee', 89);
  v_free       := public._setting_num('free_shipping_threshold', 1600);

  -- ---- per-line prices (never from the request) ----
  FOR i IN 1..n LOOP
    it := p_items->(i-1);
    l_frame  := l_frame  || COALESCE(it->>'frame_type','');
    l_size   := l_size   || COALESCE(it->>'size','');
    IF (it->>'qty') !~ '^[0-9]+$' OR (it->>'qty')::int < 1 OR (it->>'qty')::int > 1000 THEN
      RAISE EXCEPTION 'invalid quantity on line %', i USING ERRCODE = '22023';
    END IF;
    l_qty    := l_qty || (it->>'qty')::int;
    l_bundle := l_bundle || (it ? 'bundle' AND jsonb_typeof(it->'bundle') = 'object');
    l_custom := l_custom || (COALESCE(it->>'custom_image_path','') <> '');
    -- PVC: black/white only. Wooden Portrait: no colour ("wood" is the internal no-colour marker).
    IF NOT ((l_frame[i] = 'wood' AND it->>'color' = 'wood')
         OR (l_frame[i] = 'pvc' AND it->>'color' IN ('black','white'))) THEN
      RAISE EXCEPTION 'invalid frame/colour combination on line %', i USING ERRCODE = '22023';
    END IF;
    IF COALESCE(it->>'title','') = '' THEN RAISE EXCEPTION 'missing title on line %', i USING ERRCODE = '22023'; END IF;
    IF COALESCE(it->>'custom_image_path','') LIKE 'blob:%' OR COALESCE(it->>'image','') LIKE 'blob:%' THEN
      RAISE EXCEPTION 'temporary image url on line %', i USING ERRCODE = '22023';
    END IF;

    IF l_bundle[i] THEN
      l_posters := l_posters || jsonb_array_length(COALESCE(it->'bundle'->'posters','[]'::jsonb));
      IF l_posters[i] < 1 THEN RAISE EXCEPTION 'empty bundle on line %', i USING ERRCODE = '22023'; END IF;
      v_unit := CASE l_size[i]
        WHEN '20x30' THEN public._setting_num('offer_6_20x30', 790)
        WHEN '30x40' THEN public._setting_num('offer_4_30x40', 890) END;
      IF v_unit IS NULL THEN RAISE EXCEPTION 'no bundle offer for size % on line %', l_size[i], i USING ERRCODE = '22023'; END IF;
    ELSE
      l_posters := l_posters || 1;
      v_unit := public._setting_num('frame_' || l_frame[i] || '_' || l_size[i],
                                    (frame_prices -> l_frame[i] ->> l_size[i])::numeric);
      IF v_unit IS NULL OR v_unit <= 0 THEN
        RAISE EXCEPTION 'no price for % % on line %', l_frame[i], l_size[i], i USING ERRCODE = '22023';
      END IF;
      IF l_custom[i] THEN v_unit := v_unit + v_custom_fee; END IF;
    END IF;
    l_unit  := l_unit  || round(v_unit * 100)::bigint;
    l_gross := l_gross || (round(v_unit * 100)::bigint * l_qty[i]);
    l_disc  := l_disc  || 0::bigint;
    l_pack  := l_pack  || CASE WHEN l_bundle[i] THEN round(v_pack * 100)::bigint * l_qty[i] ELSE 0::bigint END;
    v_subtotal := v_subtotal + l_gross[i];
    v_frames := v_frames + l_posters[i] * l_qty[i];
  END LOOP;

  -- ---- automatic bundle offers: 6 × 20x30 or 4 × 30x40 for the flat offer price ----
  FOR rule IN SELECT * FROM (VALUES ('20x30', 6, 'offer_6_20x30', 790), ('30x40', 4, 'offer_4_30x40', 890)) AS t(sz, per, key, dflt) LOOP
    idxs := ARRAY(SELECT g FROM generate_series(1, n) g WHERE NOT l_bundle[g] AND l_size[g] = rule.sz ORDER BY g);
    qty_sum := COALESCE((SELECT sum(l_qty[g]) FROM unnest(idxs) g), 0);
    sets := qty_sum / rule.per;
    CONTINUE WHEN sets <= 0;
    avg_unit := (SELECT sum(l_unit[g]::numeric * l_qty[g]) FROM unnest(idxs) g) / qty_sum / 100;
    per_set := GREATEST(0, round(avg_unit * rule.per - public._setting_num(rule.key, rule.dflt)))::bigint;
    rule_c := per_set * sets * 100;
    parts := public._alloc_cents(rule_c, ARRAY(SELECT l_gross[g] FROM unnest(idxs) g));
    FOR k IN 1..array_length(idxs, 1) LOOP l_disc[idxs[k]] := l_disc[idxs[k]] + parts[k]; END LOOP;
    l_pack[idxs[1]] := l_pack[idxs[1]] + round(v_pack * 100)::bigint * sets;
    v_disc_total := v_disc_total + rule_c;
  END LOOP;
  v_disc_total := LEAST(v_disc_total, v_subtotal);

  FOR i IN 1..n LOOP v_pack_total := v_pack_total + l_pack[i]; END LOOP;

  IF v_tape_req THEN
    IF NOT v_tape_on THEN RAISE EXCEPTION 'double face tape is not available' USING ERRCODE = '22023'; END IF;
    v_tape := v_frames * round(v_tape_price * 100)::bigint;
  END IF;

  -- ---- shipping (free when discounted subtotal + tape >= threshold) ----
  IF (v_subtotal - v_disc_total + v_tape) >= round(v_free * 100) THEN v_ship := 0; ELSE v_ship := round(v_fee * 100)::bigint; END IF;
  parts := public._alloc_cents(v_ship, ARRAY(SELECT 1::bigint FROM generate_series(1, n)));
  FOR i IN 1..n LOOP l_ship := l_ship || parts[i]; END LOOP;

  -- ---- the customer must have seen the same total the server just computed ----
  v_grand := v_tape;
  FOR i IN 1..n LOOP v_grand := v_grand + (l_gross[i] - l_disc[i]) + l_pack[i] + l_ship[i]; END LOOP;
  IF p_payment ? 'expected_total' AND jsonb_typeof(p_payment->'expected_total') = 'number'
     AND round((p_payment->>'expected_total')::numeric * 100) <> v_grand THEN
    RAISE EXCEPTION 'price_changed' USING ERRCODE = 'PC001', DETAIL = 'server_total=' || round(v_grand / 100.0, 2);
  END IF;

  -- ---- insert rows ----
  v_grand := 0;
  FOR i IN 1..n LOOP
    it := p_items->(i-1);
    v_net := l_gross[i] - l_disc[i];
    v_total_row := v_net + l_pack[i] + l_ship[i];
    v_grand := v_grand + v_total_row;
    v_frame_label := CASE l_frame[i] WHEN 'wood' THEN 'Wooden Portrait' ELSE 'High Quality PVC' END;
    v_color_label := initcap(it->>'color');
    v_size_label  := replace(l_size[i], 'x', ' x ') || ' cm';
    v_notes := (CASE WHEN jsonb_typeof(it->'custom_meta') = 'object' THEN it->'custom_meta' ELSE '{}'::jsonb END) || jsonb_build_object('pricing', jsonb_build_object(
      'v',1,'unit_price',l_unit[i]/100.0,'gross',l_gross[i]/100.0,'discount',l_disc[i]/100.0,'net',v_net/100.0,
      'packaging',l_pack[i]/100.0,'shipping',l_ship[i]/100.0,'total',v_total_row/100.0));
    IF l_bundle[i] THEN
      v_title := (it->>'title') || ' — ' || COALESCE((SELECT string_agg(p->>'title', ', ') FROM jsonb_array_elements(it->'bundle'->'posters') p), '');
    ELSE v_title := it->>'title'; END IF;
    v_image := COALESCE(NULLIF(it->>'custom_image_path',''), it->>'image', '');
    v_row := gen_random_uuid(); v_ids := v_ids || v_row;
    INSERT INTO public.orders (id, order_group_id, guest_session_id, user_id, customer_name, phone, governorate, address,
        frame_type, frame_color, size, quantity, selected_poster, poster_title, poster_image, notes,
        subtotal, packaging_fee, shipping_cost, total_price, unit_price, discount_amount, status,
        payment_method, payment_status, payment_screenshot, is_test)
    VALUES (v_row, v_group, NULLIF(v_guest,''), auth.uid(), btrim(p_customer->>'name'), v_phone,
        btrim(p_customer->>'governorate'), btrim(p_customer->>'address'),
        v_frame_label, v_color_label, v_size_label, l_qty[i],
        CASE WHEN l_bundle[i] THEN NULL ELSE (SELECT x.id FROM public.posters x WHERE x.id = public._uuid_or_null(it->>'poster_id')) END,
        v_title, v_image, v_notes::text,
        v_net/100.0, l_pack[i]/100.0, l_ship[i]/100.0, v_total_row/100.0, l_unit[i]/100.0, l_disc[i]/100.0, 'new',
        v_method, CASE WHEN v_method='instapay' THEN 'pending' ELSE 'not_required' END,
        NULLIF(p_payment->>'screenshot_path',''), COALESCE((p_payment->>'is_test')::bool, false));
    -- order_posters.poster_id is NOT NULL and references posters: record only posters that
    -- exist (custom designs and deleted posters have none), same as the old client did.
    IF l_bundle[i] THEN
      INSERT INTO public.order_posters (order_id, poster_id, poster_title, poster_image, position)
      SELECT v_row, public._uuid_or_null(p->>'poster_id'), COALESCE(NULLIF(p->>'title',''), 'Poster'),
             COALESCE(p->>'image', ''), (ord - 1)::int
        FROM jsonb_array_elements(it->'bundle'->'posters') WITH ORDINALITY AS t(p, ord)
       WHERE EXISTS (SELECT 1 FROM public.posters x WHERE x.id = public._uuid_or_null(p->>'poster_id'));
    ELSE
      INSERT INTO public.order_posters (order_id, poster_id, poster_title, poster_image, position)
      SELECT v_row, x.id, COALESCE(it->>'title', ''), v_image, 0
        FROM public.posters x WHERE x.id = public._uuid_or_null(it->>'poster_id');
    END IF;
  END LOOP;

  IF v_tape > 0 THEN
    v_grand := v_grand + v_tape;
    v_row := gen_random_uuid(); v_ids := v_ids || v_row;
    INSERT INTO public.orders (id, order_group_id, guest_session_id, user_id, customer_name, phone, governorate, address,
        frame_type, frame_color, size, quantity, poster_title, poster_image, subtotal, packaging_fee, shipping_cost,
        total_price, unit_price, discount_amount, status, payment_method, payment_status, payment_screenshot, is_test)
    VALUES (v_row, v_group, NULLIF(v_guest,''), auth.uid(), btrim(p_customer->>'name'), v_phone,
        btrim(p_customer->>'governorate'), btrim(p_customer->>'address'),
        'High Quality PVC', 'Black', '20 x 30 cm', v_frames, 'Double Face Tape', '', v_tape/100.0, 0, 0,
        v_tape/100.0, round(v_tape_price,2), 0, 'new', v_method,
        CASE WHEN v_method='instapay' THEN 'pending' ELSE 'not_required' END,
        NULLIF(p_payment->>'screenshot_path',''), COALESCE((p_payment->>'is_test')::bool, false));
  END IF;

  RETURN jsonb_build_object('order_group_id', v_group, 'total', round(v_grand / 100.0, 2), 'row_ids', to_jsonb(v_ids));
END $$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, jsonb) TO anon, authenticated;
