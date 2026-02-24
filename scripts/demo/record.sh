#!/usr/bin/env bash
# Record demo terminal session using asciinema + convert to MP4
#
# Prerequisites:
#   brew install asciinema agg ffmpeg
#
# Usage:
#   bash scripts/demo/record.sh

set -e
cd "$(dirname "$0")"

echo "==> Setting terminal size to 120x30..."
printf '\e[8;30;120t'
sleep 1

echo "==> Recording with asciinema..."
asciinema rec \
  --command="bash replay.sh" \
  --cols=120 \
  --rows=30 \
  --overwrite \
  demo.cast

echo "==> Converting to GIF with agg..."
agg \
  --cols 120 \
  --rows 30 \
  --font-family "JetBrains Mono" \
  --font-size 16 \
  --theme asciinema \
  demo.cast demo.gif

echo "==> Converting GIF to MP4 with FFmpeg..."
ffmpeg -y \
  -i demo.gif \
  -movflags faststart \
  -pix_fmt yuv420p \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#0a0d14" \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  demo-raw.mp4

echo "==> Raw recording saved: demo-raw.mp4"
ls -lh demo-raw.mp4
