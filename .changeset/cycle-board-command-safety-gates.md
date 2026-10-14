---
'@pair/pair-cli': patch
---

Delivery cycle: three gaps found driving #543 closed:

- The cycle now moves the card to `In Progress`. `cycle-state.mjs activate-card` writes the board state mapped to `In Progress` in `## State Mapping` through the bound PM adapter and reads it back. Implement-phase calls it first.
- `cycle-state.mjs publish` refuses a red-spec contract that the validator would reject one round later: a witness/control command it refuses as unsafe (for example a leading `bash`), `command-unsafe:<row>`, and a witness/control row with no runnable command, `row-not-runnable:<row>`. The red-spec skill now states the command shape.
- Implement-phase and review-phase run the adopted `worktree-setup-command` (new `way-of-working.md` key) in a fresh worktree before any gate, and never symlink another checkout's `node_modules`/`dist`.
