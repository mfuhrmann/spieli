## Tasks

- [x] Widen `for_wheelchair` in `get_playground_stats` (`importer/api.sql:232`): accept `IN ('yes','limited','designated')` on the device branch (`e.tags->'wheelchair'`), keeping the `playground != 'sandpit'` guard.
- [x] Add an OR branch matching the playground polygon's own tag: `pl.tags->'wheelchair' IN ('yes','limited','designated')`.
- [x] `make db-apply`; verify a polygon-only `wheelchair=yes` playground returns `for_wheelchair: true` from `get_playgrounds_bbox` / `get_playground`. (pg 172183786: area `wheelchair=yes`, 0 wheelchair devices → `for_wheelchair:true`. Regional impact 8→84 flagged.)
- [x] Verify the `wheelchair` filter chip now surfaces that playground on the map (frontend, no code change). (Both boundaries: polygon-tier RPC emits `for_wheelchair:true`; cluster-tier `filter_wheelchair:=true` narrows 11→2 playgrounds in test bbox.)
- [x] Fresh-volume import sanity check (`make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`) — clean bootstrap, no ordering errors; 923 playgrounds, 84 `for_wheelchair`, 57 area-only wins; RPC end-to-end verified.
- [ ] PR: label `requires-schema-update`; note the `missing`→`partial` completeness ripple in the description.
