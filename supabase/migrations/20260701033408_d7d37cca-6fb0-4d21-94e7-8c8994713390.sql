-- Harden helper function search_path (immutable helper used in search)
CREATE OR REPLACE FUNCTION public.posters_tags_text(p_tags text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_to_string(p_tags, ' '), '');
$function$;