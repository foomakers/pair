---
"@pair/pair-cli": patch
---

run: `--engine codex` reads the stage final result and `PAIR-ROOT-CANDIDATES` from codex's last agent message (stages advance, root selection no longer 0); failure detail carries the message tail; `xhigh`/`max` effort passed through to codex; codex stdin notice no longer relayed
