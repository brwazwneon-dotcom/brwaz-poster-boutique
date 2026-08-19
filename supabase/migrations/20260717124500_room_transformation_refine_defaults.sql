update public.site_settings
set value = value
  || '{
    "headingAr": "من حائط فارغ لمساحة تحكي ذوقك",
    "headingEn": "From an Empty Wall to a Room With Character",
    "subheadingAr": "شاهد كيف يغيّر تصميم واحد شكل الغرفة ويمنحها شخصية مميزة.",
    "subheadingEn": "See how one carefully chosen artwork changes the room and gives it a distinct personality."
  }'::jsonb
where key = 'homepage_room_transformation'
  and coalesce(value->> 'headingAr', '') in ('', 'من حائط عادي… لمساحة تعبّر عنك');
