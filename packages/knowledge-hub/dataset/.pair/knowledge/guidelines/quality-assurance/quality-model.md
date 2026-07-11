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

| Pillar | Covers | Tag family | Primary skill |
| --- | --- | --- | --- |
| **Cost** | Financial exposure of building/running the change | `cost:*` | `assess-cost` (cost-signal catalog, forthcoming) |
| **Security** | Vulnerabilities, compliance, secure-by-design | none dedicated — feeds `risk:*` (§3) + deterministic CI scanning | `assess-security`, [security/](security/README.md) |
| **Delivery** | Everything else: correctness, performance, a11y, observability, docs, planning, architecture, release, AI metrics | `risk:*` (correctness/blast-radius facets) | `pair-process-review`, `classify` |

Every theme not directly named here nests under one of these three — see §7. No status pages, no dedicated backlog per theme: a theme gets a card only when there is real work.

## 3. Classification Model

### 3.1 Risk dimensions

The compiled matrix has one row per dimension below. Each row resolves to `green`/`yellow`/`red`.

| Dimension | Req. | Source (refinement → review) | green | yellow | red |
| --- | --- | --- | --- | --- | --- |
| Service/domain criticality | R5.1 | `tech/risk-matrix.md` criticality table | Low | Medium (default when the file is absent) | High (default for a service/domain **not listed** in an existing table — conservative) |
| Change/diff risk | R5.2 | story scope → diff footprint | isolated, localized change | touches multiple modules or shared code | schema/migration, contract-breaking change, or infra provisioning change |
| Business impact | R4.3 | subdomain classification of what the story/diff touches | `generic` subdomain | `supporting` subdomain | `core` subdomain |
| Security relevance | — | heuristic over touched paths | no security-sensitive surface | security-adjacent (new external dependency, input validation on a non-critical path) | authn/authz, secrets/credentials, cryptography, PII, untrusted-input parsing |
| Coupling balance | — | story context (touched subdomains' volatility + cross-context integrations) → diff (`assess-coupling` verdict) | balanced | unbalanced + stable | unbalanced + volatile |

Coupling sources absent (no subdomain/bounded-context artifacts, no `assess-coupling` available) ⇒ reported **not assessed**, excluded from the max below, never blocks (D21). See `architecture/design-patterns/coupling-balance.md` (nested taxonomy entry, §7, not yet published) — the single home for the coupling model itself; this document never duplicates that content, only the classification rule above.

### 3.2 Tier resolution

**Risk tier = max(assessed dimensions above)**, projected as `risk:green|yellow|red`.

- Built **twice** per story (D17): in refinement from the **story context** (declared/estimated), in review from the **code/diff** (observed). The review value is a floor: it may raise the tier, **never lower it**.
- A PR with no classification present is treated as `red` (fail-safe).
- Cost (§3.3) is not part of this max — it is its own class with its own tag family, computed independently, and carried in the same compiled matrix.

### 3.3 Cost class (R6.2)

Cost class = **highest detected signal**, projected as `cost:green|yellow|orange|red`. The signal catalog (paid-SDK imports, API-key env vars, IaC/provisioning changes, cron/queues, media processing, LLM calls) is maintained in the cost-assessment guideline (forthcoming, `assess-cost`); no signal detected ⇒ `green`. General + provider-specific heuristics: [infrastructure/cloud-providers/cost-optimization.md](../infrastructure/cloud-providers/cost-optimization.md).

## 4. Per-Tier Requirements

| Tier | Merge | Reviewers | SLA | Checklist | Approval |
| --- | --- | --- | --- | --- | --- |
| 🟢 Green | Self-merge once gate checks are green | 0 (AI review informational, ≤4h) | — | standard | none |
| 🟡 Yellow | Blocked until reviewed | 1 reviewer | 1 working day | standard | reviewer approval |
| 🔴 Red | Blocked until reviewed and approved | 1 reviewer (not 2) | 2 working days | extended | explicit approval required |

Review always runs, tests are always green, at every tier (R5.3 + D10). Gate (mechanical) and review (judgment) are distinct enforcers — gate blocks first, review starts only once gates are green:

| Tier | Gate checks |
| --- | --- |
| 🟢 | lint + type + build |
| 🟡 | + unit |
| 🔴 | + integration/E2E |

## 5. Tag Projection

Chromatic scheme only — no semantic tag beyond color:

- `risk:green|yellow|red` — §3.2
- `cost:green|yellow|orange|red` — §3.3

**Tag emission is declared, not implicit.** `classify` only creates tags once a `## Tag Projection` declaration exists in `tech/risk-matrix.md` (§6) — but that declaration is not something a project has to remember to write from scratch:

- **`risk` is the only tag family the KB proposes by default.** `cost` (and any future tag family this model might grow — e.g. if a dedicated security-relevance tag is ever introduced) is **opt-in**: it is projected only once a project explicitly adds it to the declaration.
- **`classify` proposes the declaration on its own first run**, the same propose-then-write-if-confirmed pattern already used elsewhere in this KB (e.g. `pair-capability-verify-quality`'s first-time Custom Gate Registry setup):
  1. **Check**: does `tech/risk-matrix.md` have a `## Tag Projection` section?
  2. **Skip**: if yes, use it exactly as written — including an explicit opt-out (see below) — and never propose again.
  3. **Act**: if no, ask before creating any tag:

     > No Tag Projection declared yet. Activate `risk:green|yellow|red` on stories and PRs? (recommended — `cost` and other families can be added later)
     > 1. Yes, activate `risk` (writes the declaration below)
     > 2. No, don't tag anything (records the opt-out so this isn't asked again)

  4. **Verify**: the compiled matrix is written to the story/PR body **regardless of the answer** — §3.2/§3.3's body output never depends on tag projection; only tag *emission* is gated by it.
- Until the proposal is answered, or if it's explicitly declined, the matrix still exists in the story/PR body — it is simply not projected onto tags.

```markdown
## Tag Projection

Active: risk
```

Add `cost` to the `Active` list to turn it on (`Active: risk, cost`); write `Active: none` to explicitly opt out of all tag emission (`classify` reads this as a durable "don't ask again," not as "not yet configured"). A project may also rename either tag family's prefix here (e.g. `risk` → `priority`) — the color values and their meaning stay the same, only the label changes.

**No dedicated eligibility tag**: automation eligibility is an **adoption-declared filter over classification tags** (e.g. `risk:green`, optionally combined with project tags), not a special tag of its own. `pair-next` consumes it generically, like any other tag filter, re-evaluated on every run (tags can change between runs, e.g. review raising the tier).

## 6. `tech/risk-matrix.md` — Adoption Delta

Optional file holding up to three independent sections — a project may have none, one, or all three; the presence of one never implies the others:

- **`## Tag Projection`** (§5) — which classification tags get emitted. In practice the section most projects end up with first, since `classify` proactively proposes it the first time it runs (§5) — a project doesn't have to know this file exists to get a sensible default.
- **`## Criticality Table`** — per-service/domain criticality overrides (§3.1).
- **`## Overrides`** — threshold overrides for other dimensions.

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
```

- **Malformed file** (unparseable table, unknown keys): skills warn and fall back to KB defaults entirely (D21) — including no tag emission, exactly as if the whole file were absent.
- **Unknown service/domain** (queried but not in the criticality table): treated as unclassified ⇒ conservative High for that dimension.
- A filled-in example (also usable as adoption starting point) is at [risk-matrix-example.md](../../assets/risk-matrix-example.md).

### Resolution-cascade walkthrough

| Scenario | `tech/risk-matrix.md` | Resolution |
| --- | --- | --- |
| No file, or Tag Projection proposal not yet answered | absent, or missing `## Tag Projection` | Matrix computed and written to the story/PR body per §3.1 defaults; no tags emitted — `classify` proposes the Tag Projection declaration on its next run |
| Tag Projection declared, `risk` active | `## Tag Projection` → `Active: risk` | `risk:*` tag applied to the story/PR alongside the body matrix; `classify` never re-proposes |
| Tag Projection explicitly opted out | `## Tag Projection` → `Active: none` | Matrix written to the body; no tags applied; `classify` never re-proposes |
| File present, service listed | `payments: High` | `payments` resolves to red for that dimension, overriding the Medium default (AC3) |
| File present, service **not** listed | table has other entries only | Conservative High (red) for that dimension, not the absent-file Medium default |
| File present but malformed | unparseable | Warn, fall back to KB defaults as if absent (including no tag emission) |

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
| AI metrics / retro | Delivery | [../collaboration/project-tracking/README.md](../collaboration/project-tracking/README.md) (reports land in `.pair/working/reports/`, once available) |
| Vulnerabilities / compliance | Security | [security/vulnerability-prevention.md](security/vulnerability-prevention.md), [security/compliance.md](security/compliance.md) |
| Cost signals | Cost | cost-assessment guideline (not yet published, see §3.3) |
