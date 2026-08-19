insert into public.site_settings (key, value)
values (
  'homepage_room_transformation',
  '{
    "enabled": true,
    "roomPreset": "neutral-studio",
    "posterId": null,
    "frameStyle": "black-pvc",
    "headingAr": "من حائط عادي… لمساحة تعبّر عنك",
    "headingEn": "From an Empty Wall to a Space That Feels Like You",
    "subheadingAr": "اختَر التصميم والخامة، وشاهد كيف يغيّر البرواز شكل مساحتك بالكامل.",
    "subheadingEn": "Choose your artwork and frame style, then see how one piece transforms the entire room.",
    "ctaDestination": "best-sellers",
    "secondaryCtaEnabled": true
  }'::jsonb
)
on conflict (key) do nothing;
