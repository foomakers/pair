---
"@pair/knowledge-hub": minor
---

`/pair-capability-assess-debt` gains `$mode: scan` (grep TODO/FIXME/HACK/WORKAROUND + code-design do/don't violations, idempotent via `<file>:<line>:<pattern>` key, grouped by file/module, creates `tech-debt` items via `/pair-capability-write-issue`). `write-issue` gains `$content.labels` for extra labels. `/pair-process-review` creates a `tech-debt` item for debt introduced by a PR and never blocks on it (R7.2) — fixes a prior inconsistency where critical debt could inform CHANGES-REQUESTED.
