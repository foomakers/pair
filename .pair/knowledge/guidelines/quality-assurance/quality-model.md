# Quality Model

The single source of default quality rules for this KB. `classify`, `assess-cost`, `assess-security`, `pair-process-review`, `setup-gates`, and `pair-process-bootstrap` all resolve their behavior from this one document — no criteria live anywhere else. Project deviations are a delta in `tech/risk-matrix.md` (§6); absent, KB defaults apply completely.

**Resolution order** for every rule below: **Argument > Adoption > KB default**. Argument = an explicit override passed to a skill invocation by a human. Adoption = `tech/risk-matrix.md` (§6). KB default = this document. A malformed adoption file is treated as absent: skills warn and fall back to KB defaults.

## 1. Three-Layer Principle

| Layer | Role | Examples |
| --- | --- | --- |
| **Doc** | Rules, written once, human-readable | this document + pillar guidelines (§7) |
| **Skill** | Applies the rules on demand, produces artifacts | `classify`, `assess-cost`, `assess-security`, `pair-process-review` |
| **Automation** | Consumes artifacts deterministically, zero judgment | CI gates, `pair-next --filter` |

**Shift-left** (R1.3): quality is classified in refinement — before code exists — not only at review time (see [Shift-Left Quality](README.md) in the QA framework overview). The matrix is built twice, refinement and review (§3.2); automation never adds its own criteria (D18) — it only reads tags.

## 2. Three Pillars

| Pillar | Covers | Tag family (if exposed) | Primary skill |
| --- | --- | --- | --- |
| **Cost** | Financial exposure of building/running the change | `cost:*` — opt-in, §5 | `assess-cost` (cost-signal catalog) |
| **Security** | Vulnerabilities, compliance, secure-by-design | none dedicated — feeds `risk:*` (§3) + deterministic CI scanning | `assess-security`, [security/](security/README.md) |
| **Delivery** | Everything else: correctness, performance, a11y, observability, docs, planning, architecture, release, AI metrics | `risk:*` (correctness/blast-radius facets) — KB default, §5 | `pair-process-review`, `classify` |

Every theme not directly named here nests under one of these three — see §7. No status pages, no dedicated backlog per theme: a theme gets a card only when there is real work.

The **Security** pillar's rules resolve through their own 5-layer cascade (global KB → per-service → per-web-app → adoption project rules → package-scoped) — see `assess-security`'s Step 1, not duplicated here.

## 3. Classification Model

### 3.1 Risk dimensions

The compiled matrix has one row per dimension below. Each row resolves to `green`/`yellow`/`red`.

| Dimension | Req. | Source (refinement → review) | green | yellow | red |
| --- | --- | --- | --- | --- | --- |
| Service/domain criticality | R5.1 | `tech/risk-matrix.md` criticality table | Low | Medium (default when the file is absent) | High (default for a service/domain **not listed** in an existing table — conservative) |
| Change/diff risk | R5.2 | story scope → diff footprint | isolated, localized change | touches multiple modules or shared code | schema/migration, contract-breaking change, or infra provisioning change |
| Business impact | R4.3 | subdomain classification of what the story/diff touches | `generic` subdomain — **or any subdomain**, when the change is trivial and the project opted in (`business-impact.trivial-diff`, §6) | `supporting` subdomain (unless the trivial-diff override applies, §6) | `core` subdomain (unless the trivial-diff override applies, §6) |
| Security relevance | — | heuristic over touched paths | no security-sensitive surface | security-adjacent (new external dependency, input validation on a non-critical path) | authn/authz, secrets/credentials, cryptography, PII, untrusted-input parsing |
| Coupling balance | — | story context (touched subdomains' volatility + cross-context integrations) → diff (`assess-coupling` verdict) | balanced | unbalanced + stable | unbalanced + volatile |

**Business impact** reads *where* a change lands, not *what* it does — deliberately, since the subdomain map is the only such signal available before any code exists. A project that finds this too coarse for objectively trivial work may declare the opt-in `business-impact.trivial-diff` override (§6); absent that declaration this dimension resolves from the subdomain class alone, exactly as the row above states. **Precedence, when the key is declared:** the override outranks this row's yellow and red cells — resolve triviality (§6) first, and fall back to the subdomain class only when the override does not apply. It is the one cell alternation in this table that is not decided by the Source column alone.

Coupling sources absent (no subdomain/bounded-context artifacts, no `assess-coupling` available) ⇒ reported **not assessed**, excluded from the max below, never blocks (D21). See `architecture/design-patterns/coupling-balance.md` (nested taxonomy entry, §7, not yet published) — the single home for the coupling model itself; this document never duplicates that content, only the classification rule above.

### 3.2 Tier resolution

**Risk tier = max(assessed dimensions above)**, projected as `risk:green|yellow|red`.

- Built **twice** per story (D17): in refinement from the **story context** (declared/estimated), in review from the **code/diff** (observed). The review value is a floor: it may raise the tier, **never lower it**.
- A PR with no classification present is treated as `red` (fail-safe).
- Cost (§3.3) is not part of this max — it is its own class, computed independently and carried in the same compiled matrix; it gets its own tag format, `cost:green|yellow|orange|red`, only if a project chooses to expose it as a tag (§5) — it is never a KB default.

### 3.3 Cost class (R6.2)

Cost class = **highest detected signal**. The signal catalog (paid-SDK imports, API-key env vars, IaC/provisioning changes, cron/queues, media processing, LLM calls) is maintained in the [cost-assessment guideline](cost-assessment.md), applied by `assess-cost`; no signal detected ⇒ `green`. General + provider-specific heuristics (AWS first, other providers via adoption links) live there too; deeper running-cost optimization is in [infrastructure/cloud-providers/cost-optimization.md](../infrastructure/cloud-providers/cost-optimization.md). This value is always computed and written to the story/PR body's matrix (§1); it is projected as the `cost:green|yellow|orange|red` tag only if a project adds `cost` to its Tag Projection declaration (§5) — the KB does not do this by default.

**Cost monitoring (R6.3/R6.4) → `assess-cost` report mode.** The class above is computed twice per change (refinement, review); comparing the refinement-time *prediction* against the *real* class of the merged diff (R6.3) and surfacing systematic drift **periodically rather than per-PR** (R6.4) is `assess-cost`'s report mode, rendered as a period-keyed panel per the [report-panel convention](../collaboration/working-area.md#report-panels--period-key-and-idempotent-update). Drift is measured against the catalog current at run time — a catalog change inside the monitored window is a confounder, not a prediction error.

## 4. Per-Tier Requirements

| Tier | Merge | Reviewers | SLA | Checklist | Approval |
| --- | --- | --- | --- | --- | --- |
| 🟢 Green | Self-merge once gate checks are green | 0 (AI review informational, ≤4h) | — | standard | none |
| 🟡 Yellow | Blocked until reviewed | 1 reviewer | 1 working day | standard | reviewer approval |
| 🔴 Red | Blocked until reviewed and approved | 1 reviewer | 2 working days | extended | explicit approval required |

**Checklist depth** is that table's third column and means exactly this — there is no separate "extended checklist" artifact anywhere, and none is needed:

| Depth | Meaning |
| --- | --- |
| `standard` (🟢/🟡) | The [code-review template](../collaboration/templates/code-review-template.md) — resolved per [template resolution](../technical-standards/ai-development/skill-conventions/template-resolution.md) — as designed: verdict first, the Assessments block, and the Details sections that the change actually touches. Sections with nothing to say are collapsed/omitted. |
| `extended` (🔴) | The **same** template with **no section skipped**: every Assessments subsection (all Security dimensions, Cost, Architecture) and every Details section is answered explicitly — "not applicable" is written out rather than omitted — and the Definition-of-Done check is run in full. Depth, not a different document. |

Reviewer counts and SLAs are **KB defaults** (D10), resolved through the same **Argument > Adoption > KB default** cascade as every other rule in this document — not fixed forever. A project may override either per tier in `tech/risk-matrix.md`'s Overrides section (§6), e.g. requiring 2 reviewers at 🔴 Red for a larger team:

```markdown
## Overrides

- tier.red.reviewers: 2
- tier.red.sla_days: 3
```

Review always runs and tests are always green, at every tier (R5.3 + D10) — **that** part is not overridable. Everything else in the table above is: the reviewer count, the SLA, the checklist depth and whether 🔴 requires explicit approval are read through the `Argument > Adoption > KB default` cascade, so a project redefines them in its own `way-of-working.md`.

**And whether any of it BLOCKS is opt-in.** The table states requirements; making them enforceable is the `Review enforcement` flag in `way-of-working.md`, **`disabled` by default**. Disabled, the review still runs and publishes its verdict, `pr-state:*` is still synthesized, and nothing is a required check — the verdict is information, not a gate. Enabled, `pair-review` and `pair-explicit-approval` become required and the 🔴 rule binds. The default is deliberate: a review that blocks on a fresh install produces a repository nobody can merge into, and on a single-maintainer repo the 🔴 non-author approval cannot be obtained at all. `/pair-process-bootstrap` asks for the flag when no decision exists rather than assuming one. Gate (mechanical) and review (judgment) are distinct enforcers — gate blocks first, review starts only once gates are green. **Refinement** (the merge-side companion below, [pr-states.md](../collaboration/project-management-tool/pr-states.md)): a review *may* run at a red gate to report findings early, but it produces **no merge-enabling verdict** — a red gate never yields `ready-to-merge`, whatever the judgment says. "Starts only once gates are green" is about the *merge-enabling* review, not about a prohibition on reading a red-gated diff.

| Tier | Gate checks |
| --- | --- |
| 🟢 | lint + type + build |
| 🟡 | + unit |
| 🔴 | + integration/E2E |

Install runs at every tier (implicit in each row). Deterministic secret scanning also runs at **every** tier, unconditionally — it is not tier-scoped (security/[secret-scanning.md](security/secret-scanning.md)). How this matrix becomes an actual pipeline that reads the `risk:*` tag only (fail-safe 🔴 when untagged, explicit failure on a missing suite, build+deploy-only post-merge staging) is the delivery-side companion [tier-aware-pipeline.md](../infrastructure/cicd-strategy/tier-aware-pipeline.md) — this table stays the single source of the criteria; that document owns the wiring.

How the two enforcers combine into a merge decision — the PR states (`to-be-reviewed` → `ready-to-merge` / `not-approved`), the synthesis of gates × verdict × tier × explicit approval, and the required checks that make the review unskippable — is the review-side companion [pr-states.md](../collaboration/project-management-tool/pr-states.md). It **reads** the requirements above (including the 🔴 explicit-approval row) and declares none of its own.

## 5. Tag Projection

Chromatic, no semantic tag beyond color. **`risk:green|yellow|red` (§3.2) is the only tag family the KB names and proposes by default.**

**Tag emission is declared, not implicit.** `classify` only creates tags once a `## Tag Projection` declaration exists in `tech/risk-matrix.md` (§6) — but that declaration is not something a project has to remember to write from scratch:

- **Only `risk` is a KB default.** Every other parameter this model computes — cost class (§3.3), security relevance, business impact, coupling balance, or any dimension added later — is available to expose as its own tag, but the KB does not pre-select which, if any: that choice belongs entirely to the project. Adding a parameter to the declaration (e.g. `Active: risk, cost`) is what exposes it; nothing beyond `risk` is projected until a project explicitly says so.
- **`classify` proposes only the `risk` default on its own first run**, the same propose-then-write-if-confirmed pattern already used elsewhere in this KB (e.g. `pair-capability-verify-quality`'s first-time Custom Gate Registry setup):
  1. **Check**: does `tech/risk-matrix.md` have a `## Tag Projection` section?
  2. **Skip**: if yes, use it exactly as written — including an explicit opt-out (see below) — and never propose again.
  3. **Act**: if no, ask before creating any tag:

     > No Tag Projection declared yet. Activate `risk:green|yellow|red` on stories and PRs? (recommended — other model parameters can be exposed as tags later, if you decide you want them)
     > 1. Yes, activate `risk` (writes the declaration below)
     > 2. No, don't tag anything (records the opt-out so this isn't asked again)

  4. **Verify**: the compiled matrix is written to the story/PR body **regardless of the answer** — §3.2/§3.3's body output never depends on tag projection; only tag *emission* is gated by it.
- Until the proposal is answered, or if it's explicitly declined, the matrix still exists in the story/PR body — it is simply not projected onto tags.

```markdown
## Tag Projection

Active: risk
```

A project decides which other model parameters, if any, to expose by adding them to the `Active` list — e.g. `Active: risk, cost` if it also wants the cost class (§3.3) projected as a tag; the choice, and the resulting tag's color scheme, follows whichever parameter was added. Write `Active: none` to explicitly opt out of all tag emission (`classify` reads this as a durable "don't ask again," not as "not yet configured"). A project may also rename `risk` itself here (e.g. `risk` → `priority`) — the color values and their meaning stay the same, only the label changes.

**No dedicated eligibility tag**: automation eligibility is an **adoption-declared filter over classification tags** (e.g. `risk:green`), not a special tag of its own. The declaration is a **single literal label** in the optional `tech/automation.md` — schema in [automation-policy.md](../collaboration/automation/automation-policy.md) — matched by exactly the plain string-equality label query `pair-next --filter` performs, with no AND/OR/NOT grammar; a tag *combination* is not expressible and must not be promised here. `pair-next` consumes the label generically, like any other tag filter, re-evaluated on every run and every step, never cached (tags can change between runs, e.g. review raising the tier).

## 6. `tech/risk-matrix.md` — Adoption Delta

Optional file holding up to three independent sections — a project may have none, one, or all three; the presence of one never implies the others:

- **`## Tag Projection`** (§5) — which classification tags get emitted. In practice the section most projects end up with first, since `classify` proactively proposes it the first time it runs (§5) — a project doesn't have to know this file exists to get a sensible default.
- **`## Criticality Table`** — per-service/domain criticality overrides (§3.1). Offered by `/pair-process-bootstrap` Phase 3.6, which proposes the candidate rows from the project's domain model and writes only the ones confirmed; hand-authoring from the example asset stays equally valid.
- **`## Overrides`** — **threshold overrides** for other dimensions (a path that always classifies at least yellow, say), **dimension-resolution overrides** that change how a dimension *resolves* rather than where its threshold sits (today `business-impact.trivial-diff`, below, is the only one), plus optional per-tier reviewer-count/SLA overrides (§4). The **threshold** and **reviewer/SLA** families are offered by the same `/pair-process-bootstrap` Phase 3.6; the dimension-resolution family is **hand-authored** today — Phase 3.6 does not ask about it, and its offer is one-shot (an existing `## Overrides` is reported `already authored` and never re-proposed), so a project that answered the other two questions reaches this key from the example asset, not from a re-run.

Absent entirely ⇒ KB defaults (§3.1) apply completely to the matrix, and no tags are emitted (§5) — nothing fails (D21). This is the state before `classify` has ever run, or before its Tag Projection proposal has been answered.

```markdown
## Tag Projection

Active: risk

## Criticality Table

| Service/Domain | Criticality |
| --- | --- |
| payments | High |
| marketing-site | Low |

## Overrides

- change-risk.shared-paths: ["packages/billing/**"]
- business-impact.trivial-diff: green
```

- **Key namespace** (what the read side queries): a story or diff resolves to the **deployable that owns the touched files** — the workspace package, app, or top-level path scope (`apps/website`, `packages/billing`; a single-deployable repository resolves to that one scope). That identifier is the key looked up in the criticality table, so **rows are keyed by it**. Bounded contexts and subdomains name *business* boundaries and often carry different names: they are good sources of candidate rows and of the criticality *value*, but a row keyed by a name no diff ever resolves to is never read, while the deployable it meant to cover stays unlisted and falls to the conservative High below.
  - **More than one deployable touched** (the normal shape in a monorepo, not an edge case): the dimension resolves to the **highest** criticality among them — never to one of them picked by the reader, or the tier would flip between runs on identical code, since tier is the max over dimensions (§3.2). A touched deployable **not listed** in the table contributes the conservative High of the unknown-service rule below, so one unlisted deployable decides the max on its own.
  - **At refinement time** (`classify` builds the matrix twice, §3.2 — once from story context, before any code exists): same key, resolved from the deployable(s) the **story's declared scope** names, and the same highest-of rule across them. A story that names none resolves this dimension to the **file-absent default** (Medium) rather than to the unlisted-conservative-High branch — nothing was queried and missed, there was nothing to query yet. Review re-resolves it from the real diff (confirm-or-raise), which is where an unlisted deployable does turn it red.
- **Choosing a value** (how a row gets High/Medium/Low, whichever authoring route writes it): judged on **blast radius**, user-facing exposure, **data sensitivity** and uptime expectation — deliberately *not* on the subdomain class, since §3.1 already spends that signal on the **Business impact** dimension and two dimensions echoing one input add no discriminating information. Default mapping: **High** — handles money, credentials or personal data, or an outage is visible to every user; **Low** — internal-only or static surface, no sensitive data, downtime tolerable; **Medium** — everything else, including anything genuinely uncertain.
- **Malformed file** (unparseable table, unknown keys): skills warn and fall back to KB defaults entirely (D21) — including no tag emission, exactly as if the whole file were absent.
- **Unknown service/domain** (queried but not in the criticality table): treated as unclassified ⇒ conservative High for that dimension.
- A filled-in example (also usable as adoption starting point) is at [risk-matrix-example.md](../../assets/risk-matrix-example.md).

### `business-impact.trivial-diff` — the opt-in trivial-change override

```markdown
## Overrides

- business-impact.trivial-diff: green
```

Declared, this key lets the **Business impact** dimension (§3.1) resolve `green` for an objectively trivial change **regardless of the subdomain** the touched files belong to, so a doc typo fix or a comment tidy inside a `core` subdomain no longer inherits that subdomain's floor. **It is opt-in: absent the declaration — and it is absent in the KB default — Business impact resolves from the subdomain class exactly as §3.1 states, for every project that has not asked for it.**

- **What counts as trivial** — objective and checkable from `git diff`, never a judgment about how important the prose or the file is. A change is trivial when **either**:
  - **(a) every** changed file is **non-executable** documentation — extension `.md`/`.mdx` (this includes guarded markdown mirrors, so a doc plus its mirrors is still all-documentation), *excluding executable markdown* per the next bullet; **or**
  - **(b) no** changed hunk in **any** changed file **alters an executable or declarative statement** — comment-only, whitespace-only, formatter-output-only and, in executable markdown, prose-only changes all qualify; a hunk that changes an instruction, a rule, a value or anything else the file is acted on for does not. The statement test is the gate, those categories are examples of passing it.
- **Executable markdown is out of branch (a).** Markdown that *is* the procedure rather than describing it — an agent skill or workflow file (`**/SKILL.md`, `.claude/skills/**`, `.claude/workflows/**`, `.claude/agents/**`, and the dataset sources they are generated from), an asset script embedded in markdown — carries instructions, not prose, however `.md` its extension is. It never satisfies branch (a): **branch (b) then decides**, so a hunk altering an instruction (a merge rule, a gate, a step) is **not** trivial, while a typo fix in that same file's surrounding prose still is. Branch (a) is the first arm of an OR and short-circuits, so this exclusion has to be read on branch (a) itself, not after it.
- **What is *not* trivial, however cosmetic it looks**: an identifier or file rename, a string-literal change, a dependency or version change, a value change in a config/data file (`json`/`yaml`/`toml`/`env`), a test expectation change, and a regenerated build artifact. A rename is excluded on purpose — behaviour preservation is a judgment, not a diff-visible fact.
- **All-or-nothing per item.** Tier is per story/PR, not per file (§3.2), so **one non-trivial file or hunk** disables the override for the whole item and Business impact falls back to the subdomain class. There is no per-file granularity to fall back to.
- **Raises green, never lowers anything.** The override may only move Business impact from yellow/red to green. It never touches another dimension, and the tier stays `max()` of the assessed dimensions — a red anywhere else still decides the tier. At review it is subject to the ordinary confirm-or-raise rule: it never lowers a value below the refinement floor (§3.2, D17).
- **At refinement time** (no code yet): applies only when the story's declared scope is unambiguously trivial (docs/comment/cosmetic only). Ambiguous scope, or any named behaviour change ⇒ it does **not** apply (fail-safe toward the subdomain rule); review re-resolves the dimension from the real diff.
- **Triviality unverifiable** (diff unreadable — binary, truncated, or too large) ⇒ the override does **not** apply, and `classify` reports `Confidence: low`. An empty diff has nothing to classify as trivial: the dimension resolves from the subdomain class.
- **`green` is the only accepted value** — the key is a boolean in disguise. The **value is the first token after the colon**; an inline rationale may follow it on the same line — the form every key in this section is written in — and that prose is not part of the value. Any other value, or a malformed key form, is treated as absent: skills warn and fall back to the KB default for this dimension (the malformed-file rule above, D21) — never a HALT.
- **It is a rule for the classifying agent, not a config key parsed by code.** `classify` resolves `## Overrides` qualitatively, like every other key in this section; nothing here implies a parser or a schema, and no threshold from this section is ever copied into a skill (D18).

### Resolution-cascade walkthrough

| Scenario | `tech/risk-matrix.md` | Resolution |
| --- | --- | --- |
| No file, or Tag Projection proposal not yet answered | absent, or missing `## Tag Projection` | Matrix computed and written to the story/PR body per §3.1 defaults; no tags emitted — `classify` proposes the Tag Projection declaration on its next run |
| Tag Projection declared, `risk` active | `## Tag Projection` → `Active: risk` | `risk:*` tag applied to the story/PR alongside the body matrix; `classify` never re-proposes |
| Tag Projection explicitly opted out | `## Tag Projection` → `Active: none` | Matrix written to the body; no tags applied; `classify` never re-proposes |
| File present, service listed | `payments: High` | `payments` resolves to red for that dimension, overriding the Medium default |
| File present, service **not** listed | table has other entries only | Conservative High (red) for that dimension, not the absent-file Medium default |
| File present but malformed | unparseable | Warn, fall back to KB defaults as if absent (including no tag emission) |
| Trivial diff, override **not** declared | no `business-impact.trivial-diff` key | Business impact resolves from the subdomain class (§3.1) — the KB default is untouched by this key existing |
| Trivial diff, override declared | `business-impact.trivial-diff: green` | Business impact resolves **green** even in a `core` subdomain; the body matrix names `Overrides: business-impact.trivial-diff` as the source instead of the subdomain class |
| Mixed diff (one non-trivial file or hunk), override declared | `business-impact.trivial-diff: green` | Override does not apply at all — Business impact resolves from the subdomain class, as if undeclared |
| Trivial diff, override declared with a value other than `green` | `business-impact.trivial-diff: sometimes` | Warn, treat the key as absent, resolve from the subdomain class — never a HALT |

### Worked examples — the trivial-diff override

Hand-traced matrices for a project that has declared `business-impact.trivial-diff: green`. All three touch a **`core`** subdomain (Business impact would otherwise be red) inside a deployable listed `Low`. They pin the three behaviours the key must have: it fires on a genuinely trivial diff, it disappears the moment one hunk is not, and it never buys down another dimension's red.

| Ex | Service/domain criticality | Change/diff risk | Business impact | Security relevance | Coupling balance | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| A — a typo fix in a `.md` guideline's prose plus its guarded markdown mirror — no rule changed | green | green | green (Overrides: business-impact.trivial-diff) | green | not assessed | risk:green |
| B — that same `.md` edit plus one changed line in a request handler | green | yellow (two modules) | red (core subdomain — one non-trivial hunk disables the override) | green | not assessed | risk:red |
| C — a `.md`-only runbook edit that lives **inside** a security-sensitive path the §3.1 heuristic flags (`services/auth/docs/credential-rotation.md`) | green | green | green (Overrides: business-impact.trivial-diff) | red (§3.1 path heuristic: an authn/secrets path) | not assessed | risk:red |

A is the case the key exists for: `.md`-only, so branch (a) holds and the `core` floor is lifted. Its Change/diff risk is green because the row is a **non-normative** prose fix; a `.md` edit that changes a *rule* is equally trivial by this definition but reads **yellow** on Change/diff risk (a shared rule surface every consumer resolves from), and `max()` keeps that off green — the override never buys a normative change a green tier on its own. B is all-or-nothing (§6, *All-or-nothing per item*) — the handler hunk alters a statement, so the whole item falls back to the subdomain class. C is the never-lowers guarantee: Business impact is greened, Security relevance still reads red on its own heuristic, and `max()` keeps the tier at `risk:red`. C's Security red comes from **where the file lives** — §3.1's Security row is a heuristic over *touched paths*, so it fires because the path is inside an authn/secrets surface, **not** because the prose mentions credentials. Vocabulary is not the trigger: the same runbook under `docs/` reads Security green, and C would then resolve `risk:green` — which is why the row names its path.

## 7. Nested Taxonomy

Every quality theme not covered by §1–§6 lives under one of the three pillars, pointing at its existing guideline — no new status page, no dedicated backlog structure per theme (D13).

| Theme | Pillar | Guideline |
| --- | --- | --- |
| Performance | Delivery | [performance/README.md](performance/README.md) |
| Accessibility | Delivery | [accessibility/README.md](accessibility/README.md) |
| Observability | Delivery | [../observability/README.md](../observability/README.md) |
| Documentation | Delivery | [../technical-standards/ai-development/documentation-standards.md](../technical-standards/ai-development/documentation-standards.md) |
| Planning | Delivery | [../collaboration/methodology/README.md](../collaboration/methodology/README.md) |
| Code design / code quality | Delivery | [../code-design/README.md](../code-design/README.md) |
| Architecture / modularity | Delivery | `architecture/design-patterns/coupling-balance.md` (not yet published — single home for the coupling model, see §3.1) |
| Release | Delivery | [../technical-standards/deployment-workflow/release-management.md](../technical-standards/deployment-workflow/release-management.md) |
| AI metrics / retro | Delivery | [delivery-metrics.md](delivery-metrics.md) — the R9.5 metric set (bug resolution time, PR lead time, adoption), its aggregation rules and per-tool query mapping; applied by `analyze-delivery-metrics`, which writes one period panel under `.pair/working/reports/metrics/` |
| Vulnerabilities / compliance | Security | [security/vulnerability-prevention.md](security/vulnerability-prevention.md), [security/compliance.md](security/compliance.md) |
| Cost signals | Cost | [cost-assessment.md](cost-assessment.md) (see §3.3) |
