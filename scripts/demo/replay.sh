#!/usr/bin/env bash
# Demo replay script — run inside asciinema rec
# Usage: asciinema rec --command="bash scripts/demo/replay.sh" demo.cast
#
# Simulates a realistic pair skill session for the demo video.
# Total duration: ~25s

set -e

# --- Helpers ---

type_cmd() {
  # Simulate typing at ~30ms per character
  local text="$1"
  printf '\033[1;34m$ \033[0m' # blue prompt
  for ((i = 0; i < ${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep 0.03
  done
  echo
}

pause() { sleep "${1:-0.5}"; }

print_block() {
  # Print a block of text line by line with minimal delay (simulates fast scroll)
  while IFS= read -r line; do
    printf '%s\n' "$line"
    sleep 0.02
  done <<< "$1"
}

green() { printf '\033[38;2;0;209;255m%s\033[0m' "$1"; } # pair teal
blue()  { printf '\033[38;2;0;98;255m%s\033[0m' "$1"; }  # pair blue
bold()  { printf '\033[1m%s\033[0m' "$1"; }
dim()   { printf '\033[2m%s\033[0m' "$1"; }

# --- Scene 1: /pair-next (0s - 3s) ---

clear
pause 0.3

type_cmd "/pair-next"
pause 0.5

echo ""
echo "PROJECT STATE:"
echo "├── PRD: $(green "populated")"
echo "├── Bootstrap: $(green "complete")"
echo "├── PM Tool: GitHub Projects"
echo "└── Backlog: 3 stories refined, 1 ready"
echo ""
echo "RECOMMENDATION: $(bold "/pair-process-refine-story #42")"
echo "REASON: Story #42 \"Add user authentication\" is refined and ready"
echo ""
echo "Shall I run $(bold "/pair-process-refine-story #42")?"
pause 1.5

# --- Scene 2: /pair-process-refine-story (3s - 12s) ---

echo ""
type_cmd "/pair-process-refine-story #42"
pause 0.3

dim "Reading story #42..."
echo ""
dim "Analyzing requirements against adoption files..."
echo ""
pause 0.8

echo ""
echo "Proposed acceptance criteria:"
echo ""
print_block "1. $(bold "Given") a user submits the login form
   $(bold "When") credentials are valid
   $(bold "Then") a session token is returned with 24h expiry

2. $(bold "Given") a user submits the login form
   $(bold "When") credentials are invalid
   $(bold "Then") a 401 error with message is returned

3. $(bold "Given") a session token is included in a request
   $(bold "When") the token has expired
   $(bold "Then") a 401 error is returned and the user must re-authenticate"
pause 0.5

echo ""
echo "Accept these acceptance criteria? (y/n)"
pause 0.3

# User types "y"
printf '\033[1;34m> \033[0m'
sleep 0.03
printf 'y\n'
pause 0.8

echo ""
echo "STORY REFINEMENT COMPLETE:"
echo "├── Story:    #42: Add user authentication"
echo "├── Status:   $(green "Refined")"
echo "├── Sections: 8/8 complete"
echo "├── Sizing:   M(3) — fits sprint: Yes"
echo "├── PM Tool:  Issue updated — #42"
echo "└── Next:     /pair-process-plan-tasks"
pause 1.0

# --- Scene 3: /pair-process-implement (12s - 22s) ---

echo ""
type_cmd "/pair-process-implement #42"
pause 0.3

echo ""
echo "ACTIVE TASK:"
echo "├── Task: T-1: Create auth middleware"
echo "├── Type: Development"
echo "├── Mode: TDD"
echo "└── Phase: Starting"
echo ""
pause 0.5

dim "Writing src/middleware/auth.test.ts..."
echo ""
dim "Writing src/middleware/auth.ts..."
echo ""
pause 0.5

# Code snippet
echo ""
printf '\033[2m  // src/middleware/auth.ts\033[0m\n'
print_block "  export function verifyToken(token: string): AuthPayload {
    return jwt.verify(token, SECRET) as AuthPayload
  }"
pause 0.8

echo ""
dim "Running tests..."
echo ""
pause 0.5

echo " $(green "✓") returns payload for valid token          (2ms)"
echo " $(green "✓") throws on expired token                  (1ms)"
echo " $(green "✓") throws on invalid signature              (1ms)"
echo " $(green "✓") middleware sets req.user on valid token   (3ms)"
echo ""
echo "Tests: $(green "4 passed") | 0 failed"
pause 0.8

echo ""
echo "[#42] feat: add JWT auth middleware"
echo ""
dim "Co-Authored-By: Claude <noreply@anthropic.com>"
echo ""
pause 0.5

echo ""
echo "IMPLEMENTATION COMPLETE:"
echo "├── Story:    #42: Add user authentication"
echo "├── Branch:   feature/#42-user-auth"
echo "├── Tasks:    $(green "3/3 completed")"
echo "├── Commits:  3 commits on branch"
echo "├── PR:       #58 — ready for review"
echo "└── Quality:  $(green "All gates passing")"
pause 1.5

# --- Scene 4: Closing (22s - 25s) ---

echo ""
type_cmd "tree .pair/ -L 2"
pause 0.2

print_block ".pair/
├── adoption/
│   ├── product/
│   └── tech/
├── knowledge/
│   ├── guidelines/
│   └── skills/
└── product/
    └── adopted/"
echo ""

# Hold for overlay (motion graphics added in post-production)
# The closing "Code is the easy part." text is added as FFmpeg overlay
pause 3
