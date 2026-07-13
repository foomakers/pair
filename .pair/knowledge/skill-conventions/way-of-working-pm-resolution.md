# Way-of-Working / PM-Tool Resolution

How any skill that needs the project's PM tool (to read or write a story/PR/epic) determines **which tool it is and how to reach it**, and how it translates board-specific state into the canonical vocabulary the corpus uses.

## PM tool discovery

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and identify the adopted PM tool (GitHub Projects, Jira, Linear, etc.) and its access method.
2. **Skip**: If found, proceed with that tool.
3. **Act**: If no PM tool is configured, **HALT**:

   > No PM tool configured in `way-of-working.md`. Configure via `/pair-capability-setup-pm`, or manually set the PM tool in way-of-working.md.

4. **Verify**: PM tool identified and reachable (or the HALT above has been surfaced).

## State resolution (macrostates)

Skills refer to **canonical macrostates** (`Draft`, `Ready`, `In Progress`, `Review`, `Done`) — never board-specific column/label names. Resolve an item's actual board state to a macrostate via the `## State Mapping` section in way-of-working.md; if that section is omitted, canonical names are assumed (zero-configuration default, not a degradation). See [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full resolution rule, including the **Readiness Fallback**: when a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), evaluate Definition-of-Ready criteria against the item instead of guessing from the board-state name.

## What stays in the skill (the delta)

Most skills only need a short pointer where they read/write the PM tool — e.g. "Read the story from the PM tool (resolution: see [way-of-working-pm-resolution.md](way-of-working-pm-resolution.md))" — because `/pair-capability-write-issue` is the actual PM-tool writer for creation/update flows and already implements the discovery+HALT logic above in full. A skill only needs to **restate** the full discovery+HALT block (Steps 1-4 above) if it talks to the PM tool directly rather than delegating to `/pair-capability-write-issue` — keep that as the delta; everything else points here.
