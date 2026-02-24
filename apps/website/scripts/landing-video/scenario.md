# Demo Video Scenario

Terminal session screenplay for the pair landing page demo video (~25s total).
Two AI tool sessions (Claude Code + Cursor) with a GitHub issue scroll interlude.

Recording settings: 120 columns x 30 rows, dark background (#0a0d14), white text.

---

## Scene 1: Claude Code — Discover + Refine (0s - 8s)

Simulates a Claude Code terminal session. The developer asks what to do next,
the agent recommends refining a story, and the developer accepts.

```text
[SCENE LABEL — blue badge]
  1 · Discover

[PROMPT — typed at 30ms/char]
$ /pair-next

[AGENT OUTPUT — 0.5s pause, then instant block]

PROJECT STATE:
├── PRD: populated
├── Bootstrap: complete
├── PM Tool: GitHub Projects
└── Backlog: 3 stories refined, 1 ready

RECOMMENDATION: /pair-process-refine-story #42
REASON: Story #42 "Add user authentication" is refined and ready

Shall I run /pair-process-refine-story #42?

[SCENE LABEL — blue badge]
  2 · Refine

[PROMPT — typed at 30ms/char]
$ /pair-process-refine-story #42

[AGENT OUTPUT — scrolling over 1.5s]

Reading story #42...
Analyzing requirements against adoption files...

Proposed acceptance criteria:

1. Given a user submits the login form
   When credentials are valid
   Then a session token is returned with 24h expiry

2. Given a user submits the login form
   When credentials are invalid
   Then a 401 error with message is returned

[AGENT QUESTION]
Accept these acceptance criteria? (y/n)

[USER INPUT]
y

[AGENT OUTPUT — instant block]

STORY REFINEMENT COMPLETE:
├── Story:    #42: Add user authentication
├── Status:   Refined
├── Sections: 8/8 complete
├── PM Tool:  Issue updated — #42 ✓
└── Next:     /pair-process-plan-tasks
```

**Timing**: ~8s total. Prompt typing + output blocks + user "y" confirmation.

---

## Scene 2: GitHub Issue Scroll (8s - 13s)

Recorded via Playwright. Browser navigates to a real GitHub issue and scrolls
through the body to show sections written by the agent (acceptance criteria,
task breakdown, technical analysis).

**Visual**: dark GitHub theme, smooth vertical scroll, ~5s duration.

**Purpose**: proves the agent wrote real, structured content on GitHub — not
just terminal output.

**Recording**: `apps/website/scripts/landing-video/github-scroll.ts` (Playwright script)
outputs `github-scroll.mp4`. Concatenated by `postprod.sh`.

---

## Scene 3: Cursor — Implement (13s - 21s)

Simulates a Cursor-style editor session. The developer implements a task —
the agent writes code and tests, then commits.

```text
[SCENE LABEL — blue badge]
  3 · Implement

[HEADER — simulated Cursor top bar]
  ▸ pair  ›  src/middleware/auth.ts        Cursor

[PROMPT — typed at 30ms/char]
$ /pair-process-implement #42

[AGENT OUTPUT — scrolling]

ACTIVE TASK:
├── Task: T-1: Create auth middleware
├── Type: Development
├── Mode: TDD
└── Phase: Starting

Writing src/middleware/auth.test.ts...
Writing src/middleware/auth.ts...

[CODE SNIPPET — scrolling]
  export function verifyToken(token: string): AuthPayload {
    return jwt.verify(token, SECRET) as AuthPayload
  }

Running tests...

 ✓ returns payload for valid token          (2ms)
 ✓ throws on expired token                  (1ms)
 ✓ throws on invalid signature              (1ms)
 ✓ middleware sets req.user on valid token   (3ms)

Tests: 4 passed | 0 failed

[COMMIT OUTPUT]
[#42] feat: add JWT auth middleware

IMPLEMENTATION COMPLETE:
├── Story:    #42: Add user authentication
├── Tasks:    3/3 completed
├── PR:       #58 — ready for review
└── Quality:  All gates passing
```

**Timing**: ~8s total. Cursor header visible throughout scene.

---

## Scene 4: Closing (21s - 25s)

Full-screen branded closing. Clear screen, centered tagline, then logo.

```text
[CLEAR SCREEN — black #0a0d14]

[CENTERED — fade in, pair blue #0062FF, large text]

             Code is the easy part.

[PAUSE 1.5s]

[CENTERED — below tagline, white, pair logo ASCII art + "pair" text]

               ◆ pair

[HOLD 1.5s — loop point]
```

**Timing**: clear 0.2s, tagline appears, hold 1.5s, logo appears, hold 1.5s.

---

## Production Notes

- **Total duration**: ~25s
- **Terminal font**: JetBrains Mono 14pt
- **Terminal theme**: dark bg #0a0d14, text #f8fafc, teal #00D1FF for checkmarks
- **ANSI colors**: pair blue (#0062FF) for prompts/labels, pair teal (#00D1FF) for success
- **Cursor simulation**: text-based header bar (tab + breadcrumb), same dark terminal below
- **GitHub scroll**: Playwright recording, dark theme, smooth scroll
- **Loop point**: scene 4 end → scene 1 start (black frame transition)
- **Concatenation order**: replay-part1.mp4 + github-scroll.mp4 + replay-part2.mp4 (postprod.sh)
