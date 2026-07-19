# Cost Assessment

The single home of the **cost-signal catalog** and the cost-classification heuristics the `assess-cost` skill applies. This is the Cost pillar's guideline in the [quality model](quality-model.md) (§2 Cost pillar, §3.3 Cost class): the model owns the *class scale and the resolution cascade*; this document owns the *signals and heuristics*. Nothing here duplicates the quality model — it fills in the "which signals, at what class" the model forward-references.

**Layering.** The `assess-cost` skill applies these rules; it holds none of them itself (D17/D21). Provider selection is adoption-driven (`tech-stack.md` / `architecture.md` / `infrastructure.md`): the declared provider selects the per-provider section below; a provider not covered in-tree is reached through an **adoption link** the adoption file supplies (fallback/extension — no skill or KB-core change). Deeper cost-optimization strategy for running systems lives in [infrastructure/cloud-providers/cost-optimization.md](../infrastructure/cloud-providers/cost-optimization.md); this document is about *classifying a change at review*, not tuning a bill.

## Class scale

Cost class is chromatic, four levels, matching the quality model's tag token `cost:green|yellow|orange|red` (§3.3):

| Class | Meaning | Typical trigger |
| --- | --- | --- |
| 🟢 `green` | No cost surface touched | no catalog signal detected |
| 🟡 `yellow` | Low, bounded, predictable exposure | a single low-cost signal on a non-critical path |
| 🟠 `orange` | Material or unclear exposure | scaling/usage-driven signal, or an **unknown cost surface** (conservative default) |
| 🔴 `red` | High/open-ended exposure | provisioning that can grow without a ceiling (e.g. always-on compute, per-token LLM at scale, unbounded fan-out) |

**Class = the highest detected signal** across the scanned surface (§3.3). No signal ⇒ `green` ("no cost surface touched"). An **unknown cost surface** (tech whose cost profile the catalog + adoption cannot resolve) is classified `orange` and flagged — conservative and visible, never silently green.

## Cost-signal catalog

Scanned on the diff (or, at refinement, the story's declared scope). Each signal maps to a **baseline class**; a per-provider heuristic (below) or an adoption override may raise it. Highest hit wins.

| Signal | What to look for | Baseline class |
| --- | --- | --- |
| **paid-SDK imports** | new dependency on a paid/metered provider SDK — payment (Stripe, etc.), LLM (OpenAI/Anthropic/etc.), messaging/email/SMS (Twilio/SendGrid/etc.) | 🟠 orange (per-use billing) |
| **API-key env vars** | new secret/env var naming a paid service (`*_API_KEY`, `*_SECRET`, provider tokens) | 🟡 yellow (paid integration surface) |
| **IaC / provisioning changes** | Terraform/CloudFormation/CDK/Pulumi/SST resources, `*.tf`, serverless configs — anything that stands up billable infrastructure | 🟠 orange (🔴 red if it provisions always-on/unbounded resources) |
| **cron / scheduled jobs** | new scheduled task, cron expression, scheduled workflow | 🟡 yellow (🟠 orange if frequent/heavy) |
| **queues / pipelines** | new queue, stream, pub/sub topic, data pipeline, event bus | 🟠 orange (throughput-driven) |
| **media processing** | image/video/audio transcode, thumbnailing, OCR, large-file processing | 🟠 orange (CPU/egress heavy) |
| **LLM calls** | inference calls, embeddings, per-token/per-request model usage | 🟠 orange (🔴 red at scale / per-request on a hot path) |
| **storage / egress growth** | new bucket/table with unbounded growth, high-egress paths, CDN origins | 🟡 yellow (🟠 orange if unbounded) |
| **always-on compute** | new long-running service, container, or instance that runs 24/7 | 🔴 red (fixed recurring floor) |

The catalog is intentionally provider-neutral: a signal is detected the same way regardless of cloud. The **provider heuristics** below refine a signal's class where a specific provider's pricing shape matters.

## General cost heuristics

- **Fixed vs. usage-driven**: a fixed recurring cost (always-on compute, reserved capacity) is a floor that never goes to zero — treat as at least 🟠 orange, 🔴 red if sizeable. Usage-driven cost (per-request, per-token, per-GB) is bounded by traffic — its class rises with the expected volume and the criticality of the path it sits on.
- **Bounded vs. unbounded**: a ceiling (rate limit, max instances, quota) caps exposure — one class lower than the same signal without a ceiling. Unbounded fan-out, autoscaling with no max, or recursive processing → 🔴 red.
- **Hot-path multiplier**: the same signal on a high-traffic/critical path is one class higher than on a cold/admin path.
- **New vs. reused**: reusing an already-provisioned resource is lower than standing up a new one; only the *incremental* exposure of the change is classified.

## AWS-specific heuristics

Applied when the adoption declares AWS (`infrastructure.md` / `tech-stack.md`). See also [infrastructure/cloud-providers/aws-deployment.md](../infrastructure/cloud-providers/aws-deployment.md) and [cost-optimization.md](../infrastructure/cloud-providers/cost-optimization.md).

| AWS surface | Cost shape | Class guidance |
| --- | --- | --- |
| Lambda | per-request + duration; scales to zero | 🟡 yellow bounded; 🟠 orange on a hot path or with high memory/duration |
| EC2 / ECS on EC2 / RDS instances | always-on hourly floor | 🔴 red (fixed recurring), 🟠 orange only for the smallest/dev tiers |
| Fargate | per-task vCPU/memory-seconds | 🟠 orange; 🔴 red for always-on long-running tasks |
| S3 | cheap storage, **egress + request cost is the trap** | 🟡 yellow storage; 🟠 orange for high-egress/high-request paths |
| DynamoDB | on-demand (usage) vs. provisioned (floor) | 🟡 yellow on-demand bounded; 🟠 orange provisioned or GSIs |
| SQS / SNS / Kinesis / EventBridge | per-message/per-shard throughput | 🟠 orange (throughput-driven); Kinesis shards are a floor → 🔴 red if many |
| NAT Gateway | hourly floor **+ per-GB data processing** | 🔴 red — a classic silent bill (see gotchas) |
| CloudFront / data transfer out | per-GB egress | 🟠 orange, scales with traffic |
| Bedrock / SageMaker | per-token / per-inference / endpoint hours | 🟠 orange per-token; 🔴 red for always-on endpoints |

## Other providers

Provider coverage is **adoption-extensible**: a project on GCP, Azure, Vercel, Cloudflare, etc. supplies an **adoption link** (in `infrastructure.md` / `tech-stack.md`) to the provider's cost model or a project-local cost note; `assess-cost` resolves that link as the per-provider heuristic layer. No change to this KB core or to the skill is needed to add a provider — that is the multi-provider contract (R2.13). The general heuristics above always apply as the provider-neutral floor. Baseline provider evaluation guidance: [infrastructure/cloud-providers/provider-evaluation.md](../infrastructure/cloud-providers/provider-evaluation.md) and [multi-cloud.md](../infrastructure/cloud-providers/multi-cloud.md).

## Cost gotchas

Non-obvious patterns that read as cheap but bill like they are not — classify these conservatively (at least 🟠 orange):

- **NAT Gateway data-processing charges** — the hourly rate is small; the per-GB processing on every byte to the internet is the real bill.
- **S3/CloudFront egress**, not storage — storage is pennies; data transfer out is where the money goes.
- **CloudWatch Logs / high-cardinality metrics** — verbose logging or per-request custom metrics can outgrow the compute they observe.
- **DynamoDB GSIs** — each global secondary index is a full second copy of write throughput and storage.
- **Kinesis / provisioned shards** — a floor cost per shard whether or not data flows.
- **Cross-AZ / cross-region traffic** — inter-AZ data transfer is billed and easy to introduce accidentally.
- **LLM context bloat** — per-token pricing makes large prompts/long context windows scale cost linearly with every call; retries and agent loops multiply it.
- **"Serverless" that never sleeps** — a scheduled job or warmer keeping a function hot removes the scale-to-zero benefit.
- **Free-tier cliffs** — a signal that is free at low volume can jump a class once past the free tier; classify by expected steady-state volume, not the demo.

## Relationship to the quality model

- The **class scale** and the **resolution cascade** (Argument > Adoption > KB default) are owned by [quality-model.md](quality-model.md) §3.3 — not restated here.
- This guideline owns the **catalog** and the **heuristics**; `assess-cost` is the skill that applies them (three-layer principle, §1 of the quality model).
- Cost is its **own class**, never folded into the risk `max` (§3.2); it is projected as the `cost:*` tag only if a project opts in via `tech/risk-matrix.md`'s Tag Projection (§5).
