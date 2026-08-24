---
'@pair/pair-cli': minor
---

Add `pair coverage-ratchet`: the opt-in coverage-baseline commit-back, now reachable by adopters instead of only from pair's own monorepo. It proposes a raised `baseline.<type>` as a bot pull request on a base-branch push, and only when the project's `way-of-working.md` declares both `Coverage guardrail: enabled` and `Coverage baseline commit-back: enabled` (both off by default, so no existing project changes behaviour). A malformed invocation exits non-zero; every refused write is a warning and exit 0, leaving the coverage gate's verdict untouched.
