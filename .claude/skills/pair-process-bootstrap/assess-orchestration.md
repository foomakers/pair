# Phase 2, Step 2.2: Assess-\* Orchestration — Detail

Disclosed from [SKILL.md](SKILL.md) Step 2.2 — only reached when at least one `assess-*` skill is installed.

**Recommended sequence** (respects adoption file dependencies):

1. `/pair-capability-assess-architecture` → proposes `architecture.md` content (needed by stack and infrastructure)
2. `/pair-capability-assess-stack` → proposes core sections of `tech-stack.md` (needed by testing and AI)
3. `/pair-capability-assess-testing` → proposes testing section of `tech-stack.md`
4. `/pair-capability-assess-ai` → proposes AI section of `tech-stack.md`
5. `/pair-capability-assess-infrastructure` → proposes `infrastructure.md` content (needed by observability)
6. `/pair-capability-assess-observability` → proposes observability section of `infrastructure.md`
7. `/pair-capability-assess-methodology` → proposes methodology section of `way-of-working.md`
8. `/pair-capability-assess-pm` → proposes PM section of `way-of-working.md` (delegates to `/pair-capability-setup-pm` when installed)

After each assessment (or after collecting the batch), compose `/pair-capability-record-decision(content, target, decision-metadata)` to persist the proposal and record the ADR/ADL. `/pair-capability-assess-pm` persists via `/pair-capability-setup-pm` when that skill is installed; otherwise `/pair-process-bootstrap` persists its proposal via `/pair-capability-record-decision` like the others.

**Section ownership** (each assess-\* proposal owns its section; `/pair-capability-record-decision` preserves the rest on write):

| Adoption File        | Section            | Owner Skill            |
| --------------------- | ------------------ | ---------------------- |
| `architecture.md`    | Full file          | `/pair-capability-assess-architecture` |
| `tech-stack.md`      | Core sections      | `/pair-capability-assess-stack`        |
| `tech-stack.md`      | Testing section    | `/pair-capability-assess-testing`      |
| `tech-stack.md`      | AI section         | `/pair-capability-assess-ai`           |
| `infrastructure.md`  | Core sections      | `/pair-capability-assess-infrastructure` |
| `infrastructure.md`  | Observability      | `/pair-capability-assess-observability`|
| `way-of-working.md`  | Methodology        | `/pair-capability-assess-methodology`  |
| `way-of-working.md`  | PM tool            | `/pair-capability-assess-pm`           |
| `way-of-working.md`  | Quality gates      | `/pair-process-bootstrap` (Step 3.2)|

**Parallel safety**: Because assess-\* skills only produce proposals (no writes), they can run in parallel freely. The actual writes happen serially through `/pair-capability-record-decision` (the sole writer), which preserves sections it does not own. The recommended sequence orders the proposals by adoption-file dependency.

**Partial installation**: If only some assess-\* skills are installed, compose those and skip the rest with a warning. Each assess-\* skill is independent — partial installation is supported.
