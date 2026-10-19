---
'@pair/pair-cli': patch
---

Release validation suite aligned with v0.5.0: channel-aware CPs (`$CHANNEL` pre/rc/final), refreshed CLI/KB assertions, new CP11 (release pipeline) and CP12 (plugin marketplace), new smoke scenarios (`update-removes-files`, `inspect-commands`, run flags); release artifact smokes now test the artifact past install (`run-all.sh --binary` no longer replaced by the packaging preflight) (#543). Increment 2: CP1/CP6 cases follow the v0.5.0 landing and docs IA (MT-CP102/105/106, new MT-CP114, MT-CP606, new MT-CP612).
