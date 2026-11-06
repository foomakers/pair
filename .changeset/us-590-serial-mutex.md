---
"@pair/pair-cli": patch
---

run --root: at effective parallelism 1 every dependency-allowed card runs serially (mutex applies only to concurrent scheduling); batch audit line adds `excludedReasons=` (percent-encoded JSON, `excluded=` ids unchanged)
