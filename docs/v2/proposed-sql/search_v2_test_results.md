# Search V2 — local test results (scratch PostgreSQL 16, NOT production)

Method: scratch DB with the real `search_posters` (v1) from the repo migration, the `ar_norm` + `search_posters_v2` from
`01_…sql`, then the indexed version from `03_…sql`. 8 sample posters (English/Arabic, one hidden), then +10,000 synthetic rows for timing.

## Findings that changed the SQL
1. First draft of v2 lost v1's typo tolerance (`spidermn`, `batmn` returned nothing) and did not match `spiderman` to `Spider-Man`. Fixed: punctuation→space in `ar_norm`, spacing-insensitive match, trigram `similarity`/`word_similarity`.
2. First draft was ~4× slower than v1 (540–680 ms vs ~130 ms at 10k rows) because it normalized every row per query. `03_search_v2_indexed.sql` precomputes normalized text (trigger + trigram GIN index): ~90–105 ms at 10k rows, faster than v1.

## Behaviour (indexed v2, 8-row dataset)
| Query | Result |
|---|---|
| spider | Spider Man No Way Home; Spider-Man: Across…; Amazing Spiderman Classic (hidden "Hidden Spider Poster" excluded) |
| spider man / spider-man | Spider titles first |
| spiderman | Spider-Man: Across the Spider-Verse first |
| spidermn (typo) | the three Spider-Man posters |
| batmn / mesi (typos) | Batman Dark Knight / Messi Barcelona |
| ناروتو, اوزوماكي | ناروتو أوزوماكي |
| ايتاشى (v1: nothing) | إيتاشي أوتشيها (hamza/ya folding) |
| marvel | category/tag matches |
| x | no results (min 2 chars) |
Trigger verified: a newly inserted poster is searchable immediately, a title update re-indexes, and hiding it removes it.

## Not verified
Real catalog data, Supabase's own role/grant setup and `auth` schema, load under concurrency, Arabic dialect spellings beyond hamza/ya/ta-marbuta folding. Apply to a Supabase branch first.
