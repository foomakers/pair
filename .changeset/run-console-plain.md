---
'@pair/pair-cli': patch
---

`pair-cli run` on a terminal is quieter and says what it is doing in plain words: the card line shows the current step (`writing tests · try 2`, `coding · <task>`, `reviewing · round 2`, `waiting for CI`…), each finished step leaves one short note, and the driver's technical lines move to the audit and the new `--verbose` flag.
