---
"@pair/knowledge-hub": minor
---

Reclassify `map-subdomains` and `map-contexts` from process skills to capabilities (`.skills/process/` → `.skills/capability/`, installed command `/pair-process-map-*` → `/pair-capability-map-*`). `$scope` is now required — set to the caller's touched items, full-catalog `$scope: all` is bootstrap-only. Added graceful "system areas" fallback when no DDD artifacts exist, a `Volatility` field on subdomains, and a per-relationship integration-strength/socio-technical-distance/volatility assessment on bounded contexts with an approval gate on unbalanced+volatile relationships.
