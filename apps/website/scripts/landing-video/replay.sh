#!/usr/bin/env bash
# Demo replay script — run inside asciinema rec
#
# Produces TWO recordings:
#   Part 1 (Claude Code): /pair-next → /pair-process-refine-story → issue updated
#   Part 2 (Cursor):      /pair-process-implement → code + test → commit → closing
#
# Usage:
#   PART=1 asciinema rec --command="bash replay.sh" --cols=120 --rows=30 replay-part1.cast
#   PART=2 asciinema rec --command="bash replay.sh" --cols=120 --rows=30 replay-part2.cast
#
# The GitHub issue scroll (between parts) is recorded separately via Playwright.

set -e

PART="${PART:-1}"
COLS=120
ROWS=30

# --- Helpers ---

type_text() {
  # Simulate typing at ~30ms per character (no prompt prefix)
  local text="$1"
  for ((i = 0; i < ${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep 0.03
  done
}

pause() { sleep "${1:-0.5}"; }

print_block() {
  while IFS= read -r line; do
    printf '%s\n' "$line"
    sleep 0.02
  done <<< "$1"
}

green() { printf '\033[38;2;0;209;255m%s\033[0m' "$1"; }
blue()  { printf '\033[38;2;0;98;255m%s\033[0m' "$1"; }
bold()  { printf '\033[1m%s\033[0m' "$1"; }
dim()   { printf '\033[2m%s\033[0m' "$1"; }
white() { printf '\033[38;2;230;237;243m%s\033[0m' "$1"; }

scene_label() {
  printf '\n\033[1;48;2;0;98;255;38;2;255;255;255m  %s  \033[0m\n\n' "$1"
}

center_text() {
  local text="$1"
  local len=${#text}
  local pad=$(( (COLS - len) / 2 ))
  printf '%*s%s\n' "$pad" '' "$text"
}

# Draw a horizontal line across the terminal
hline() {
  local char="${1:-─}"
  local color="${2:-\033[38;2;60;60;60m}"
  printf "${color}"
  printf '%*s' "$COLS" '' | tr ' ' "${char}"
  printf '\033[0m\n'
}

# ═══════════════════════════════════════════════════════════════════
# Part 1: Claude Code — Discover + Refine
# ═══════════════════════════════════════════════════════════════════

part1() {
  clear

  # ── Claude Code title bar ──
  # Dark bar with Claude Code branding + project path
  printf '\033[48;2;24;24;27m'  # dark bg
  printf '\033[38;2;204;120;50m ◆ \033[0m'  # orange diamond (Claude branding)
  printf '\033[48;2;24;24;27m'
  printf '\033[1;38;2;230;237;243m Claude Code \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;100;100;110m ~/projects/myapp \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '%*s' $((COLS - 38)) ''
  printf '\033[0m\n'
  hline "─" "\033[38;2;60;60;60m"
  echo ""
  pause 0.3

  # Scene 1: /pair-next
  scene_label "1 · Discover"

  # Claude Code prompt: ❯ with typing
  printf '\033[1;38;2;204;120;50m❯ \033[0m'
  type_text "/pair-next"
  echo ""
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

  # Scene 2: /pair-process-refine-story
  scene_label "2 · Refine"

  printf '\033[1;38;2;204;120;50m❯ \033[0m'
  type_text "/pair-process-refine-story #42"
  echo ""
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
   $(bold "Then") a 401 error with message is returned"
  pause 0.5

  echo ""
  printf '\033[38;2;204;120;50m?\033[0m Accept these acceptance criteria? '
  printf '\033[2m(y/n)\033[0m '
  pause 0.3
  printf '\033[1;38;2;0;209;255my\033[0m\n'
  pause 0.8

  echo ""
  echo "STORY REFINEMENT COMPLETE:"
  echo "├── Story:    #42: Add user authentication"
  echo "├── Status:   $(green "Refined")"
  echo "├── Sections: 8/8 complete"
  echo "├── PM Tool:  $(green "Issue updated — #42 ✓")"
  echo "└── Next:     /pair-process-plan-tasks"
  pause 1.5
}

# ═══════════════════════════════════════════════════════════════════
# Part 2: Cursor — Implement + Closing
# ═══════════════════════════════════════════════════════════════════

part2() {
  clear

  # ── Cursor title bar + tab bar ──
  # Top bar: window controls + Cursor name
  printf '\033[48;2;30;30;30m'
  printf '\033[38;2;255;95;86m ● \033[38;2;255;189;46m● \033[38;2;39;201;63m● \033[0m'
  printf '\033[48;2;30;30;30m'
  printf '\033[1;38;2;200;200;200m  Cursor \033[0m'
  printf '\033[48;2;30;30;30m'
  printf '\033[38;2;100;100;110m — myapp\033[0m'
  printf '\033[48;2;30;30;30m'
  printf '%*s' $((COLS - 30)) ''
  printf '\033[0m\n'

  # Tab bar: active file tab
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;60;60;65m │ \033[0m'
  printf '\033[48;2;36;36;40m'  # active tab bg
  printf '\033[38;2;0;209;255m ⬡ \033[0m'  # TS icon
  printf '\033[48;2;36;36;40m'
  printf '\033[1;38;2;220;220;220mauth.ts\033[0m'
  printf '\033[48;2;36;36;40m \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;80;80;85m  ⬡ auth.test.ts  │  ⬡ login.ts \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '%*s' $((COLS - 55)) ''
  printf '\033[0m\n'

  # Separator between editor and terminal
  hline "─" "\033[38;2;60;60;60m"

  # Terminal panel header
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;100;100;110m  TERMINAL \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;60;60;65m  PROBLEMS  OUTPUT  DEBUG CONSOLE \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '%*s' $((COLS - 52)) ''
  printf '\033[0m\n'

  hline "─" "\033[38;2;60;60;60m"
  echo ""
  pause 0.3

  # Scene 3: /pair-process-implement
  scene_label "3 · Implement"

  # Cursor terminal prompt
  printf '\033[38;2;100;100;110mmyapp \033[38;2;39;201;63m❯ \033[0m'
  type_text "/pair-process-implement #42"
  echo ""
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
  echo "├── Tasks:    $(green "3/3 completed")"
  echo "├── PR:       #58 — ready for review"
  echo "└── Quality:  $(green "All gates passing")"
  pause 1.5

  # ── Scene 4: Closing — centered tagline + logo pills ──
  clear
  pause 0.3

  # Position vertically: ~1/3 down the screen
  for ((i = 0; i < ROWS / 3; i++)); do echo ""; done

  # Tagline — centered, pair blue, bold
  printf '\033[1;38;2;0;98;255m'
  center_text "Code is the easy part."
  printf '\033[0m'

  pause 1.5

  echo ""
  echo ""

  # Logo pills (blue ██ + teal ██) + wordmark
  local logo="\033[38;2;0;98;255m██\033[0m \033[38;2;0;209;255m██\033[0m  \033[1;38;2;255;255;255mpair\033[0m"
  local logo_plain="██ ██  pair"
  local logo_len=${#logo_plain}
  local logo_pad=$(( (COLS - logo_len) / 2 ))
  printf '%*s' "$logo_pad" ''
  printf "${logo}\n"

  pause 2.0
}

# --- Main ---

case "$PART" in
  1) part1 ;;
  2) part2 ;;
  *) echo "Usage: PART=1|2 bash replay.sh"; exit 1 ;;
esac
