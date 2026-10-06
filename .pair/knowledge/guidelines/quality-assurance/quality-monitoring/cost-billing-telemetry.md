# Cost & Billing Telemetry

## 🎯 **PURPOSE**

Contract for the **deploy-match** dimension of `/pair-capability-assess-cost $mode: report`: resolve a merged PR to its deployment, then to the **observed cost movement** in a declared billing metric. This guideline holds every provider API detail; the skill names no provider and applies only the rules below (R2.13, D17/D21).

**Scope boundary**: [cost-assessment.md](../cost-assessment.md) classifies a change at review, from the code — it is _not_ about tuning a bill. This file is the optional corroboration of that prediction against real spend. Predicted-vs-real **class** monitoring ([quality-model.md](../quality-model.md) §3.3, R6.3/R6.4) is diff-based, needs no bill, and is unaffected.

**Default**: no declaration ⇒ `not available`. This is a supported, permanent outcome — not a missing feature. Report mode is advisory and **never blocks a merge or a release**, whatever fails here.

## 📋 **DECLARATION SHAPE**

Optional section in `.pair/adoption/tech/infrastructure.md`. Fixed heading, fixed keys, parsed deterministically. It is a **pointer** (where to look), never a credential.

```markdown
## Cost & Billing Telemetry

- **Deploy source**: github-deployments
- **Deploy environment**: production
- **Billing source**: aws-cost-explorer
- **Billing metric**: UnblendedCost
- **Service mapping**: `apps/api` → Service `Amazon Elastic Container Service`; `apps/web` → tag `service=web`
- **Window days**: 7
- **Consolidation lag days**: 2
```

| Key                     | Required | Meaning                                                                                              |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| **Deploy source**       | yes      | Kind of source mapping a commit to a deployment; selects a section of the matching "Deploy source API" section |
| **Deploy environment**  | yes      | The one environment whose deployments count as "shipped"                                             |
| **Billing source**      | yes      | Kind of billing API; selects a section of the matching "Billing source API" section                      |
| **Billing metric**      | yes      | Metric name as the billing source defines it                                                         |
| **Service mapping**     | yes      | Per deployable path → the billing dimension value (service or cost-allocation tag) that isolates it  |
| **Window days**         | no       | Length N of each comparison window. Default `7`                                                      |
| **Consolidation lag days** | no    | Days after which billing data is treated as final. Default `2`                                       |

**Complete** = every required key present and non-empty. Anything else (section missing, key missing or empty, unknown source kind) is **incomplete** and degrades to `not available — no deploy telemetry declared`, naming the missing keys. Never fill a gap by inference.

**Credentials**: no key above holds a secret, and none may be added. A token, key, secret or role ARN with embedded secret in an adoption file is a defect. Credentials are supplied to the executor by its environment/secret store, outside the repository; the repository's secret-scanning layer is a backstop, not the design.

## 🔌 **DEPLOY SOURCE API**

### `github-deployments` (code host)

- **Call**: `GET /repos/{owner}/{repo}/deployments?sha={merge_commit_sha}&environment={Deploy environment}` — filters are exact matches; page through all results (`per_page=100`).
- **Fields consumed**:

| Field         | Semantics                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `id`          | Deployment id; tie-break and key for the status call                                            |
| `sha`         | Commit the deployment was created for. **Exact match** with the PR's merge commit — no ancestry inference |
| `environment` | Target environment name; compared with **Deploy environment**                                   |
| `created_at`  | ISO-8601 UTC creation timestamp; the ordering key                                               |

- **Shipped**: a deployment is _shipped_ only if its statuses (`GET /repos/{owner}/{repo}/deployments/{id}/statuses`, newest first) contain `state: success`. The shipped time is the `created_at` of the **earliest** `success` status. Deployments that only reached `queued`, `pending`, `in_progress`, `failure`, `error` or `inactive` did not ship the merge.
- **Merge commit**: the PR's `merge_commit_sha` (the squash or merge commit on the base branch), not a branch-head commit.
- **No deployment**: zero shipped deployments for that sha in that environment ⇒ `not available — no deployment found`. This covers never deployed _and_ deployments not recorded; the two are indistinguishable from here and are not guessed apart.

### Multiple deployments (redeploys, several environments)

Deterministic rule: among deployments with the exact `sha` **and** the declared environment, that are _shipped_, pick the one with the **earliest shipped time** — the first deployment that shipped that merge into the declared environment. Ties break on lowest `id`. Other environments are ignored; later redeploys are ignored.

### Minimum permissions (deploy source)

Read-only access to deployments of the one repository: fine-grained token with repository permission **Deployments: read** (plus the metadata read every token has). No write, no admin, no organization scope. A broader credential is a defect even if it works.

## 💶 **BILLING SOURCE API**

### `aws-cost-explorer`

- **Call**: `GetCostAndUsage` (Cost Explorer API).
  - `TimePeriod`: `Start` inclusive, `End` **exclusive**, `YYYY-MM-DD` (UTC days).
  - `Granularity`: `DAILY`.
  - `Metrics`: the declared **Billing metric** (e.g. `UnblendedCost`). Mixing metrics between the two windows is invalid.
  - `Filter`: the **Service mapping** value for the deployed service — a `SERVICE` dimension value or an activated cost-allocation tag. Follow `NextPageToken` to the end.
- **Fields consumed**: `ResultsByTime[].TimePeriod`, `ResultsByTime[].Total.<metric>.Amount` and `.Unit`, `ResultsByTime[].Estimated`.
- **Consolidation signal**: `Estimated: true` on a day means the provider may still revise it. Data also lags the calendar by up to a day or more.
- **Cost of the call**: the API is billed per request; a period runs only the calls its matched PRs need (two per PR-service), never a sweep.
- **Not attributable**: when the filter value also covers other workloads (a service or tag shared by more than the deployed change), the delta cannot be attributed ⇒ `not available — not attributable (shared service)`. A merge touching several mapped services yields one row per attributable service.

### Minimum permissions (billing source)

Read-only: the single action `ce:GetCostAndUsage`, on all resources (the API supports no resource-level scoping). No `ce:Create*`, `ce:Update*`, `ce:Delete*`, no `budgets:*`, no wildcard `ce:*`. Use a role separate from the deploy-source credential — the two integrations are never combined into one broad credential.

## 📐 **OBSERVED COST MOVEMENT**

Let `D` be the UTC calendar day of the matched deployment's shipped time and `N` = **Window days**.

| Window   | Days (UTC)           | Length |
| -------- | -------------------- | ------ |
| **Pre**  | `D−N … D−1`          | N days |
| **Post** | `D+1 … D+N`          | N days |

`D` itself is excluded: it mixes old and new code. Both windows have **equal length**; windows of different length are never compared.

**Observed cost movement** = `sum(metric over Post) − sum(metric over Pre)`, in the metric's unit, plus the relative change `movement / sum(Pre)` when `sum(Pre) > 0`. Sign: positive = cost rose after the deployment.

**Consolidated** = the post window's last day is at least **Consolidation lag days** before today **and** no day in either window has `Estimated: true`. If not consolidated ⇒ `not available — billing window not yet consolidated`. A partial or provisional delta is **never** shown as the movement — not even labelled provisional.

## 🧾 **PANEL ROW OUTCOMES**

| Situation                                           | Row reads                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Declaration complete, deployment matched, window consolidated | Deployment (environment, shipped time, id) + observed cost movement |
| Declaration absent or incomplete                    | `not available — no deploy telemetry declared` (+ missing keys)            |
| No shipped deployment for the merge commit          | `not available — no deployment found`                                      |
| Post window not consolidated                        | `not available — billing window not yet consolidated`                      |
| Shared service / unattributable metric              | `not available — not attributable (shared service)`                        |
| Deploy source or billing source unreachable         | `not available — <deploy source\|billing source> unreachable`, naming which half resolved |

A half-resolved match (deployment found, billing unreachable — or the reverse) is `not available`, never a partial claim. No inferred or fabricated match, ever: a plausible number is worse than an honest absence in a report about money.

**Confounder**: a provider price change inside either window is not a prediction error. The panel states it as a confounder, the same treatment §3.3 gives a catalogue change inside a monitored window.

## 🔁 **ADDING A PROVIDER**

A second billing provider or deploy source = a new `### <kind>` section in this file (call, fields, semantics, minimum permissions, consolidation signal) + a declaration naming that kind. The skill does not change.

## 🧪 **VERIFICATION**

CI never calls a live deploy or billing API. The matched path is covered by static fixtures (complete / partial / absent declaration, no deployment, unconsolidated tail, several deployments, shared service) and verified once, manually, on a project that really declares telemetry — recorded in the panel output.

## 🔗 **RELATED**

- [cost-assessment.md](../cost-assessment.md) — classification at review; scope boundary
- [quality-model.md](../quality-model.md) §3.3 — cost class, cost monitoring (R6.3/R6.4)
- [README.md](README.md) — quality-monitoring index
