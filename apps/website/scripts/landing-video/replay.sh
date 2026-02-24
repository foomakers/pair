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
  local text="$1"
  local speed="${2:-0.03}"
  for ((i = 0; i < ${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep "$speed"
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

hline() {
  local char="${1:-─}"
  local color="${2:-\033[38;2;60;60;60m}"
  printf "${color}"
  printf '%*s' "$COLS" '' | tr ' ' "${char}"
  printf '\033[0m\n'
}

# Cursor positioning
cursor_to() { printf '\033[%d;%dH' "$1" "$2"; }

# ═══════════════════════════════════════════════════════════════════
# Part 1: Claude Code — Discover + Refine (fixed header)
# ═══════════════════════════════════════════════════════════════════

part1() {
  clear

  # ── Draw header on rows 1–2 (stays fixed) ──
  cursor_to 1 1
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;204;120;50m ◆ \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '\033[1;38;2;230;237;243m Claude Code \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '\033[38;2;100;100;110m ~/projects/myapp \033[0m'
  printf '\033[48;2;24;24;27m'
  printf '%*s' $((COLS - 38)) ''
  printf '\033[0m'

  cursor_to 2 1
  printf '\033[38;2;60;60;60m'
  printf '%*s' "$COLS" '' | tr ' ' '─'
  printf '\033[0m'

  # Lock header: scroll region = rows 3–30
  printf '\033[3;%dr' "$ROWS"
  printf '\033[3;1H'
  pause 0.3

  # Scene 1: /pair-next
  scene_label "1 · Discover"

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

  # Reset scroll region
  printf '\033[r'
}

# ═══════════════════════════════════════════════════════════════════
# Part 2: Cursor — Sidebar + AI Chat + Closing
# ═══════════════════════════════════════════════════════════════════

SIDEBAR_W=24
SEP_COL=25
CHAT_COL=27

draw_cursor_chrome() {
  # Row 1: Title bar with traffic lights
  cursor_to 1 1
  printf '\033[48;2;30;30;30m'
  printf '\033[38;2;255;95;86m ● \033[38;2;255;189;46m● \033[38;2;39;201;63m● \033[0m'
  printf '\033[48;2;30;30;30m'
  printf '\033[1;38;2;200;200;200m  Cursor \033[0m'
  printf '\033[48;2;30;30;30m'
  printf '\033[38;2;100;100;110m— myapp\033[0m'
  printf '\033[48;2;30;30;30m'
  printf '%*s' $((COLS - 28)) ''
  printf '\033[0m'

  # Row 2: Separator
  cursor_to 2 1
  printf '\033[38;2;60;60;60m'
  printf '%*s' "$COLS" '' | tr ' ' '─'
  printf '\033[0m'

  # Sidebar: file tree (rows 3–29, cols 1–24)
  local -a tree=(
    "\033[1;38;2;140;140;150mEXPLORER\033[0m"
    ""
    "\033[38;2;200;200;210m▼ myapp\033[0m"
    "\033[38;2;140;140;150m  ▼ src\033[0m"
    "\033[38;2;140;140;150m    ▼ middleware\033[0m"
    "\033[1;38;2;0;209;255m      auth.ts\033[0m"
    "\033[38;2;140;140;150m      auth.test.ts\033[0m"
    "\033[38;2;140;140;150m    ▼ routes\033[0m"
    "\033[38;2;140;140;150m      login.ts\033[0m"
    "\033[38;2;140;140;150m    ▼ services\033[0m"
    "\033[38;2;140;140;150m      password.ts\033[0m"
    "\033[38;2;140;140;150m  package.json\033[0m"
    "\033[38;2;140;140;150m  tsconfig.json\033[0m"
  )
  for i in "${!tree[@]}"; do
    cursor_to $((3 + i)) 1
    printf " ${tree[$i]}"
  done

  # Vertical separator (col 25, rows 3–29)
  for ((r = 3; r <= ROWS - 1; r++)); do
    cursor_to "$r" "$SEP_COL"
    printf '\033[38;2;60;60;60m│\033[0m'
  done

  # Chat panel header
  cursor_to 3 "$CHAT_COL"
  printf '\033[1;38;2;180;180;190mAI Chat\033[0m'
  cursor_to 4 "$CHAT_COL"
  printf '\033[38;2;60;60;60m'
  printf '%*s' $((COLS - CHAT_COL)) '' | tr ' ' '─'
  printf '\033[0m'

  # Status bar (row 30)
  cursor_to "$ROWS" 1
  printf '\033[48;2;30;30;30m'
  printf '\033[38;2;100;100;110m main \033[38;2;39;201;63m✓\033[0m'
  printf '\033[48;2;30;30;30m'
  printf '\033[38;2;80;80;85m  Ln 1  Col 1  UTF-8  TypeScript\033[0m'
  printf '\033[48;2;30;30;30m'
  printf '%*s' $((COLS - 45)) ''
  printf '\033[0m'
}

part2() {
  clear
  draw_cursor_chrome
  pause 0.5

  local r=6  # first content row in chat area

  # ── User message ──
  cursor_to $r "$CHAT_COL"
  printf '\033[2;38;2;140;140;150mYou\033[0m'
  r=$((r + 1))
  cursor_to $r "$CHAT_COL"
  type_text "/pair-process-implement #42"
  r=$((r + 2))
  pause 0.5

  # ── AI response ──
  cursor_to $r "$CHAT_COL"
  printf '\033[1;38;2;180;130;255m⬡ Cursor\033[0m'
  r=$((r + 1))
  cursor_to $r "$CHAT_COL"
  type_text "Implementing T-1: Create auth middleware (TDD)" 0.015
  r=$((r + 2))
  pause 0.3

  # ── Code generation — file label ──
  cursor_to $r "$CHAT_COL"
  printf '\033[2;38;2;0;209;255m  src/middleware/auth.ts\033[0m'
  r=$((r + 1))
  pause 0.2

  # ── Streaming code block ──
  local -a code=(
    "export function verifyToken("
    "  token: string"
    "): AuthPayload {"
    "  const payload = jwt.verify(token, SECRET)"
    "  return payload as AuthPayload"
    "}"
  )
  for line in "${code[@]}"; do
    cursor_to $r $((CHAT_COL + 2))
    printf '\033[38;2;180;220;255m'
    type_text "$line" 0.012
    printf '\033[0m'
    r=$((r + 1))
  done
  r=$((r + 1))
  pause 0.5

  # ── Test results ──
  cursor_to $r "$CHAT_COL"
  printf '\033[2mRunning tests...\033[0m'
  r=$((r + 1))
  pause 0.4

  local -a tests=(
    "returns payload for valid token"
    "throws on expired token"
    "throws on invalid signature"
    "middleware sets req.user on valid token"
  )
  for t in "${tests[@]}"; do
    cursor_to $r "$CHAT_COL"
    printf " $(green "✓") %s" "$t"
    r=$((r + 1))
    sleep 0.2
  done
  r=$((r + 1))
  pause 0.3

  # ── Summary ──
  cursor_to $r "$CHAT_COL"
  printf "$(green "✓") $(bold "PR #58 created — all gates passing")"
  pause 1.5

  # ── Scene 4: Closing — centered tagline + logo pills ──
  clear
  pause 0.3

  for ((i = 0; i < ROWS / 3; i++)); do echo ""; done

  printf '\033[1;38;2;0;98;255m'
  center_text "Code is the easy part."
  printf '\033[0m'
  pause 1.5

  echo ""
  echo ""

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
