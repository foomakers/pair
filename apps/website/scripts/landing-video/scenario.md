# Demo Video Scenario

Terminal session screenplay for the pair landing page demo video (~25s total).
Two AI tool sessions (Claude Code + Cursor), a GitHub issue scroll interlude,
and a browser login closing.

Recording settings: 120 columns x 30 rows, dark background (#0a0d14), white text.

---

## Scene 1: Claude Code — Discover + Refine (0s - 8s)

Simulates a Claude Code terminal session with fixed header. The developer asks
what to do next, the agent recommends refining a story, and the developer accepts.

```text
[FIXED HEADER — rows 1-2, stays pinned while content scrolls]
  ◆ Claude Code  ~/projects/myapp
  ────────────────────────────────

[SCENE LABEL — blue badge]
  1 · Discover

[PROMPT — typed at 30ms/char]
❯ /pair-next

[AGENT OUTPUT]

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
❯ /pair-process-refine-story #42

Reading story #42...
Analyzing requirements against adoption files...

Proposed acceptance criteria:

1. Given a user submits the login form
   When credentials are valid
   Then a session token is returned with 24h expiry

2. Given a user submits the login form
   When credentials are invalid
   Then a 401 error with message is returned

? Accept these acceptance criteria? (y/n) y

STORY REFINEMENT COMPLETE:
├── Story:    #42: Add user authentication
├── Status:   Refined
├── Sections: 8/8 complete
├── PM Tool:  Issue updated — #42 ✓
└── Next:     /pair-process-plan-tasks
```

**Timing**: ~8s total. Header pinned, content scrolls below.

---

## Scene 2: GitHub Issue Scroll (8s - 13s)

Recorded via Playwright. Static HTML page styled like GitHub dark theme showing
issue #42 "Add user authentication" with sections written by the agent
(acceptance criteria, task breakdown, technical analysis).

**Visual**: dark GitHub theme, smooth vertical scroll, ~5s duration.

**Purpose**: proves the agent wrote real, structured content — not just terminal output.

**Recording**: `github-scroll.mjs` (Playwright) outputs `github-scroll.webm`.

---

## Scene 3: Cursor — Implement (13s - 19s)

Simulates a Cursor IDE session with left sidebar (file tree) and AI Chat panel.
The developer asks to implement a task, the agent streams code and runs tests.

```text
[TITLE BAR]
  ● ● ●  Cursor — myapp

[LAYOUT — sidebar left | chat right]

  EXPLORER          │ AI Chat
                    │ ──────────────────────────────────
  ▼ myapp           │
    ▼ src           │ You
      ▼ middleware  │ /pair-process-implement #42
        auth.ts     │
        auth.test.ts│ ⬡ Cursor
      ▼ routes      │ Implementing T-1: Create auth middleware (TDD)
        login.ts    │
      ▼ services    │   src/middleware/auth.ts
        password.ts │   export function verifyToken(
    package.json    │     token: string
    tsconfig.json   │   ): AuthPayload {
                    │     const payload = jwt.verify(token, SECRET)
                    │     return payload as AuthPayload
                    │   }
                    │
                    │   Running tests...
                    │   ✓ returns payload for valid token
                    │   ✓ throws on expired token
                    │   ✓ throws on invalid signature
                    │   ✓ middleware sets req.user on valid token
                    │
                    │   ✓ PR #58 created — all gates passing

[STATUS BAR]
  main ✓  Ln 1  Col 1  UTF-8  TypeScript
```

**Timing**: ~6s. Code streams char-by-char (12ms/char), test results appear one by one.

---

## Scene 4: Login → Closing (19s - 25s)

Recorded via Playwright. Browser shows the login page of the app built by pair.
User fills credentials, submits, page transitions to branded closing.

```text
[BROWSER CHROME — fake bar]
  ● ● ●  localhost:3000/login

[LOGIN FORM — dark card, centered]
  Sign in
  Welcome to myapp

  Email:    dev@myapp.io     ← typed by Playwright
  Password: ••••••••         ← typed by Playwright

  [Sign in] → click

[TRANSITION — 0.8s delay, fade out login, fade in closing]

[CLOSING — centered on dark background]

         Code is the easy part.

              ■ ■  pair
         (blue)(teal)
```

**Timing**: ~6s. Type credentials, click, transition, hold closing.

**Recording**: `login-closing.mjs` (Playwright) outputs `login-closing.webm`.

---

## Production Notes

- **Total duration**: ~25s
- **4 segments**: replay-part1 + github-scroll + replay-part2 + login-closing
- **Terminal font**: JetBrains Mono 14pt
- **Terminal theme**: dark bg #0a0d14, text #f8fafc, teal #00D1FF for checkmarks
- **ANSI colors**: pair blue (#0062FF) for prompts/labels, pair teal (#00D1FF) for success
- **Claude Code**: fixed header (ANSI scroll region), orange diamond branding
- **Cursor**: sidebar file tree + AI Chat panel, traffic light buttons, status bar
- **GitHub scroll**: Playwright, static HTML, dark theme, smooth scroll
- **Login closing**: Playwright, dark login form, CSS fade transition to claim + logo
- **Loop point**: scene 4 end → scene 1 start (black frame transition)
- **Concatenation order**: postprod.sh joins all 4 mp4 files
