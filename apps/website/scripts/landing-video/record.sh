#!/usr/bin/env bash
# Record all demo video segments
#
# Prerequisites:
#   brew install asciinema agg ffmpeg
#   npx playwright install chromium
#
# Usage:
#   bash apps/website/scripts/landing-video/record.sh
#
# Produces 3 segments (concatenated by postprod.sh):
#   replay-part1.mp4  — Claude Code session (Discover + Refine)
#   github-scroll.mp4 — GitHub issue scroll
#   replay-part2.mp4  — Cursor session (Implement + Closing)

set -e
cd "$(dirname "$0")"

record_terminal() {
  local part="$1"
  local cast="replay-part${part}.cast"
  local gif="replay-part${part}.gif"
  local mp4="replay-part${part}.mp4"

  echo "==> Recording Part ${part} with asciinema..."
  PART="$part" asciinema rec \
    --command="bash replay.sh" \
    --cols=120 \
    --rows=30 \
    --overwrite \
    "$cast"

  echo "==> Converting to GIF with agg..."
  agg \
    --cols 120 \
    --rows 30 \
    --font-family "JetBrains Mono" \
    --font-size 16 \
    --theme asciinema \
    "$cast" "$gif"

  echo "==> Converting to MP4..."
  ffmpeg -y \
    -i "$gif" \
    -movflags faststart \
    -pix_fmt yuv420p \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0a0d14" \
    -c:v libx264 \
    -preset slow \
    -crf 23 \
    "$mp4"

  echo "==> Part ${part} saved: $mp4"
  ls -lh "$mp4"
}

record_github() {
  echo "==> Recording GitHub issue scroll (fetches via gh CLI, renders locally)..."
  node github-scroll.mjs

  echo "==> Converting webm to mp4..."
  ffmpeg -y \
    -i github-scroll.webm \
    -movflags faststart \
    -pix_fmt yuv420p \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0a0d14" \
    -c:v libx264 \
    -preset slow \
    -crf 23 \
    github-scroll.mp4

  echo "==> GitHub scroll saved: github-scroll.mp4"
  ls -lh github-scroll.mp4
}

# --- Main ---

echo "=== Step 1/3: Claude Code session ==="
record_terminal 1

echo ""
echo "=== Step 2/3: GitHub issue scroll ==="
record_github

echo ""
echo "=== Step 3/3: Cursor session ==="
record_terminal 2

echo ""
echo "==> All segments recorded. Run postprod.sh to concatenate and compress."
ls -lh replay-part1.mp4 github-scroll.mp4 replay-part2.mp4
