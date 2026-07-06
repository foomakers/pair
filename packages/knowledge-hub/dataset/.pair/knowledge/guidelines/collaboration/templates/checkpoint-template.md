# Checkpoint: #[story-id] — [Story Title]

**Last updated:** [YYYY-MM-DD HH:MM]
**Written by:** [session/agent identifier — e.g. "implement session", "subagent: publish-pr"]

> Read top to bottom before doing anything else. Written so a session with **zero prior context** can resume exactly where the previous one stopped.

## 1. Story

**ID:** #[story-id]
**Title:** [Story title]
**Epic:** #[epic-id] — [epic title] (if applicable)
**Goal:** [one or two sentences — what this story delivers and why]
**Source:** [link to the issue / PM tool item]

## 2. Branch

**Branch:** `feature/#[story-id]-[short-description]`
**Commit strategy:** [commit-per-task | commit-per-story]
**Commits so far:** [N] — [most recent commit subject, or "none yet"]

## 3. Tasks Done

- [x] T-1 — [title] — [commit ref or brief evidence]
- [x] T-2 — [title]

[If none yet: "None yet."]

## 4. Key Decisions

- [What was decided + why. Link the ADR/ADL if one was recorded: `.pair/adoption/tech/adr/...` or `.pair/adoption/decision-log/...`]

[If none yet: "None yet."]

## 5. Remaining Todos

- [ ] T-3 — [title] — [known blockers, open questions, or notes]
- [ ] T-4 — [title]

**Next immediate action:** [the single next concrete step the resuming session should take]

---

## Template Notes

- **File location:** `.pair/working/checkpoints/<story-id>.md` — one file per story, updated in place, never duplicated.
- **Source of truth:** the file. If an issue-body mirror exists, it must be explicitly marked as a copy and must not diverge in meaning from the file.
- **Resume parsing:** a resuming session reads sections 1–5 top to bottom. It should not need the original conversation to continue safely.
- **Unknown state:** if a value cannot be reconstructed confidently, write `[unknown — needs confirmation]` rather than guessing.
