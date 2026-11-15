# Workflow profile host gaps

Before an in-session skill or batch dispatches work, resolve its workflow profile and check the selected stage against the current host. Use the shared resolver, not a skill-local model table:

```bash
node .claude/skills/pair-workflow-cycle/scripts/workflow-profile.mjs gaps --root "$PWD" --host "$HOST" --card "$CARD"
```

`HOST` is the detected harness engine (`claude`, `codex`, `pi`, or `opencode`); an unknown host is a gap. The result names each stage, requested engine and model, host, and a `pair run` route. A gap is shown before dispatch, then the skill waits for the operator's choice. It never switches engines or models silently. A batch that only spawns Claude treats every non-Claude stage as a gap.

The cycle already resolves once for its run. Pass `--host` and `--card` to that existing `resolve` call and use its `gaps` field; do not resolve a second time. A direct skill uses `gaps` before starting. A model candidate is suggested only when the resolver has an actual same-class host model; otherwise show the `pair run` route and the conflicting field.
