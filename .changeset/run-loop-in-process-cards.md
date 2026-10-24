---
'@pair/pair-cli': patch
---

`pair-cli run --root/--filter`: each card's delivery cycle runs in the loop's own process — no nested `pair-cli run` — and the live terminal shows one row per card plus short notes (the card's lines were printed verbatim); everything else under `--verbose`.
On a live terminal the loop's iteration line is one status row, replaced each iteration; a stage that did not advance prints no note (the next note says what follows).
Live card rows are drawn with auto-wrap off: a row wider than the terminal is clipped, never duplicated by a wrap.
Plain live terminal: a card's notes become its row's detail (never a new line); a card ended on a bare exit code shows its last note as the reason.
Live card rows: one row per card for the whole run — a finished card keeps its row and a re-driven card reuses it; past the terminal height the oldest finished cards scroll away.
