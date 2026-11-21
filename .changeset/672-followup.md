---
"@pair/pair-cli": patch
"@pair/knowledge-hub": patch
---

The card state set by a workflow step only moves forward (a card in Review stays in Review through `fix`). Base configuration `claude` judges on Sonnet medium; `claude-cheap` and `codex-cheap` build and fix on the lightest model.
