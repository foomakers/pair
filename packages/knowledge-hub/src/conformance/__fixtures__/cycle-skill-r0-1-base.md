<!-- Frozen excerpt of packages/knowledge-hub/dataset/.skills/workflow/cycle/SKILL.md at 15c99bc4 (r0-1 as shipped):
     the Step 1 autonomy block and the Step 5 Merge paragraph. Consumed by cycle-autonomy-active.test.ts
     (rows G2-X*) to prove the extractor on mutated copies; never edited to follow the live SKILL. -->

**Autonomy policy (US-521).** Resolve the effective autonomy policy ONCE, before the first `resolve`, by the ONE shared script (the same one `pair-cli run` spawns; this skill holds no autonomy rule):

```bash
node "$SKILL_DIR/scripts/autonomy-policy.mjs" resolve --adoption "$MAIN/.pair/adoption/tech/automation.md" \
  --args '{"until":"<$until>","prepare":"<$prepare>","merge":"<$merge>"}'   # only the arguments actually passed
```

Print its `lines` verbatim (every key, its effective value and its source: `argument` | `adoption` | `adoption (translated from ## Auto-Advance)` | `default`), then its `warnings`. `ok: false` ⇒ HALT `automation-policy-malformed` naming each `errors[].key` and reason, before any card is touched. A project that declares nothing and passes nothing resolves to `until: pr`, gates `always`: nothing below changes. Hand `resolve` the result as `--policy '{…,"autonomy":<policy>}'` (the script's `policy` object), and — only when `policy.until` is `merged` and the merge gate is `when` — the card's CURRENT labels as `--labels '<JSON array>'`, re-read from the PM tool before EVERY `resolve` (labels are live at each boundary). With no `## Autonomy` but a legacy `## Auto-Advance` tier, keep passing `--policy '{…,"autoAdvance":{"tiers":[…]}}'` and `--tier` exactly as before.

The workflow profile is resolved ONCE, here, right after the binding and before the first `resolve` — by the ONE shared resolver `pair-cli run --card` calls too, never by hand-reading `pair.config.json`:

**Merge (`next.step: merge`).** The stage is a script, never a subagent, and this skill still decides nothing: run `node "$SKILL_DIR/scripts/cycle-merge.mjs" check --dir <run dir> --story $card --pr <next.pr> --reviewedHead <next.reviewedHead> --cardTier <next.tier> (--autoAdvance '<the tiers JSON array>' | --mergeGate '<the merge gate JSON {mode,has,lacks}>')`. It re-reads the tier, the remote head and the `pair-review` / `pair-explicit-approval` conclusions live; on `mergeAllowed: false` it has already parked the card with a comment naming the failed condition — report its `reason`. On `true`, run `/pair-capability-verify-quality` for the tier, then `cycle-merge.mjs run` with the same flags plus `--gate green|red`, `--message '<squash message per the commit template>'` and `--branch <card branch>` (run from the main checkout), and report its `merged` / `cascaded` / `reason` verbatim. `merged: true, cascaded: false` names the closure step left for a human.
