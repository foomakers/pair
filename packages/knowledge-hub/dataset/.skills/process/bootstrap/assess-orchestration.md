# Phase 2, Step 2.2: Assess-\* Orchestration — Detail

Disclosed from [SKILL.md](SKILL.md) Step 2.2 — only reached when at least one `assess-*` skill is installed.

**Recommended sequence** (respects adoption file dependencies):

1. `/assess-architecture` → proposes `architecture.md` content (needed by stack and infrastructure)
2. `/assess-stack` → proposes core sections of `tech-stack.md` (needed by testing and AI)
3. `/assess-testing` → proposes testing section of `tech-stack.md`
4. `/assess-ai` → proposes AI section of `tech-stack.md`
5. `/assess-infrastructure` → proposes `infrastructure.md` content (needed by observability)
6. `/assess-observability` → proposes observability section of `infrastructure.md`
7. `/assess-methodology` → proposes methodology section of `way-of-working.md`
8. `/assess-pm` → proposes PM section of `way-of-working.md` (delegates to `/setup-pm` when installed)

After each assessment (or after collecting the batch), compose `/record-decision(content, target, decision-metadata)` to persist the proposal and record the ADR/ADL. `/assess-pm` persists via `/setup-pm` when that skill is installed; otherwise `/bootstrap` persists its proposal via `/record-decision` like the others.

**Section ownership** (each assess-\* proposal owns its section; `/record-decision` preserves the rest on write):

| Adoption File        | Section            | Owner Skill            |
| --------------------- | ------------------ | ---------------------- |
| `architecture.md`    | Full file          | `/assess-architecture` |
| `tech-stack.md`      | Core sections      | `/assess-stack`        |
| `tech-stack.md`      | Testing section    | `/assess-testing`      |
| `tech-stack.md`      | AI section         | `/assess-ai`           |
| `infrastructure.md`  | Core sections      | `/assess-infrastructure` |
| `infrastructure.md`  | Observability      | `/assess-observability`|
| `way-of-working.md`  | Methodology        | `/assess-methodology`  |
| `way-of-working.md`  | PM tool            | `/assess-pm`           |
| `way-of-working.md`  | Quality gates      | `/bootstrap` (Step 3.2)|

**Parallel safety**: Because assess-\* skills only produce proposals (no writes), they can run in parallel freely. The actual writes happen serially through `/record-decision` (the sole writer), which preserves sections it does not own. The recommended sequence orders the proposals by adoption-file dependency.

**Partial installation**: If only some assess-\* skills are installed, compose those and skip the rest with a warning. Each assess-\* skill is independent — partial installation is supported.
