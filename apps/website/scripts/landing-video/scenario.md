# Demo Video Scenario

Terminal session screenplay for the pair demo video (~25s total).
Recording settings: 120 columns x 30 rows, dark background (#0a0d14), white text.

---

## Scene 1: /pair-next (0s - 3s)

```text
[PROMPT — typed at 30ms/char]
$ /pair-next

[AGENT OUTPUT — 0.5s pause, then instant block]

PROJECT STATE:
├── PRD: populated
├── Bootstrap: complete
├── PM Tool: GitHub Projects
└── Backlog: 3 stories refined, 1 ready

RECOMMENDATION: /pair-process-refine-story #42
REASON: Story #42 "Add user authentication" is refined and ready for implementation

Shall I run /pair-process-refine-story #42?
```

**Timing**: prompt typed ~0.4s, pause 0.5s, output instant, hold 1.5s

---

## Scene 2: /pair-process-refine-story (3s - 12s)

```text
[PROMPT — typed at 30ms/char]
$ /pair-process-refine-story #42

[AGENT OUTPUT — 0.3s pause, scrolling over 1.5s]

Reading story #42...
Analyzing requirements against adoption files...

Proposed acceptance criteria:

1. Given a user submits the login form
   When credentials are valid
   Then a session token is returned with 24h expiry

2. Given a user submits the login form
   When credentials are invalid
   Then a 401 error with message is returned

3. Given a session token is included in a request
   When the token has expired
   Then a 401 error is returned and the user must re-authenticate

[AGENT QUESTION — 0.5s pause]
Accept these acceptance criteria? (y/n)

[USER INPUT — typed at 30ms/char]
y

[AGENT OUTPUT — 0.8s pause, then instant block]

STORY REFINEMENT COMPLETE:
├── Story:    #42: Add user authentication
├── Status:   Refined
├── Sections: 8/8 complete
├── Sizing:   M(3) — fits sprint: Yes
├── PM Tool:  Issue updated — #42
└── Next:     /pair-process-plan-tasks
```

**Timing**: prompt ~1s, scrolling output 1.5s, question pause 0.5s, "y" typed 0.1s, pause 0.8s, final block instant, hold 1s

---

## Scene 3: /pair-process-implement (12s - 22s)

```text
[PROMPT — typed at 30ms/char]
$ /pair-process-implement #42

[AGENT OUTPUT — 0.3s pause, scrolling over 1s]

ACTIVE TASK:
├── Task: T-1: Create auth middleware
├── Type: Development
├── Mode: TDD
└── Phase: Starting

Writing src/middleware/auth.test.ts...
Writing src/middleware/auth.ts...

[SCROLLING CODE SNIPPET — 1.5s]
  export function verifyToken(token: string): AuthPayload {
    return jwt.verify(token, SECRET) as AuthPayload
  }

Running tests...

 ✓ returns payload for valid token          (2ms)
 ✓ throws on expired token                  (1ms)
 ✓ throws on invalid signature              (1ms)
 ✓ middleware sets req.user on valid token   (3ms)

Tests: 4 passed | 0 failed

[COMMIT OUTPUT — 0.5s pause]
[#42] feat: add JWT auth middleware

Co-Authored-By: Claude <noreply@anthropic.com>

IMPLEMENTATION COMPLETE:
├── Story:    #42: Add user authentication
├── Branch:   feature/#42-user-auth
├── Tasks:    3/3 completed
├── Commits:  3 commits on branch
├── PR:       #58 — ready for review
└── Quality:  All gates passing
```

**Timing**: prompt ~0.8s, task block 1s, code scroll 1.5s, test output 1s, commit 1s, final block instant, hold 1.5s

---

## Scene 4: Closing (22s - 25s)

```text
[PROMPT — typed at 30ms/char]
$ tree .pair/ -L 2

[OUTPUT — instant]
.pair/
├── adoption/
│   ├── product/
│   └── tech/
├── knowledge/
│   ├── guidelines/
│   └── skills/
└── product/
    └── adopted/

[OVERLAY — fade in over terminal at t=23s]
"Code is the easy part."
```

**Timing**: prompt ~0.5s, tree output instant, hold 0.5s, overlay fade-in 1s, hold 1s

---

## Production Notes

- **Total duration**: ~25s
- **Terminal font**: JetBrains Mono 14pt
- **Terminal theme**: dark bg #0a0d14, text #f8fafc, green #00D1FF for success markers
- **ANSI colors**: use pair brand blue (#0062FF) for prompts, teal (#00D1FF) for checkmarks
- **Loop point**: scene 4 closing frame fades to black, loops back to scene 1 prompt
