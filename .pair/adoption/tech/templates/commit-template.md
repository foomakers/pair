# Commit Message Template

## Format

```text
[#123] type: concise description

Optional body explaining what changed and why.

Refs: #123
```

Use the native GitHub issue number for stories, bugs and tasks: `[#123]`.
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`,
`build`, `ci`. Use imperative wording, lowercase after the colon, no final
period; aim for a subject under 50 characters. Wrap the optional body at 72.
Preserve co-author trailers.

Task commits identify the story and task; inline tasks retain their checklist
identifier in the body. Red, green and refactor commits use the same format.
Work without an issue uses `type: description`, without inventing a reference.

## Squash Merge

One commit per story, summarizing the delivered behavior:

```text
[#123] fix: honor explicit parallelism

Closes #123
```

Keep the same native issue reference on the squash commit. Do not use synthetic
`US-`, `BUG-` or `T-` prefixes. See the
[decision](../../decision-log/2026-11-06-native-issue-commit-references.md).
