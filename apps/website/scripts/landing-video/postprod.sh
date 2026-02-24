#!/usr/bin/env bash
# Post-production: compress video, extract poster
#
# Prerequisites:
#   brew install ffmpeg
#   demo-raw.mp4 must exist (from record.sh)
#
# Usage:
#   bash apps/website/scripts/landing-video/postprod.sh
#
# Note: overlay text (step labels, closing tagline) is baked into replay.sh
# via ANSI output — no drawtext filter needed.

set -e
cd "$(dirname "$0")"

RAW="demo-raw.mp4"
OUT="../../public/demo.mp4"
POSTER="../../public/demo-poster.png"

if [ ! -f "$RAW" ]; then
  echo "Error: $RAW not found. Run record.sh first."
  exit 1
fi

echo "==> Compressing to H.264 ≤5MB..."

ffmpeg -y -i "$RAW" \
  -c:v libx264 \
  -preset slow \
  -crf 28 \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -an \
  "$OUT"

echo "==> Final video saved: $OUT"
ls -lh "$OUT"

# Check file size (must be <=5MB)
SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null)
MAX=$((5 * 1024 * 1024))
if [ "$SIZE" -gt "$MAX" ]; then
  echo "Warning: file size ${SIZE} exceeds 5MB. Re-compressing with higher CRF..."
  ffmpeg -y -i "$OUT" \
    -c:v libx264 -preset slow -crf 32 \
    -movflags +faststart -pix_fmt yuv420p -an \
    "${OUT}.tmp.mp4"
  mv "${OUT}.tmp.mp4" "$OUT"
  ls -lh "$OUT"
fi

echo "==> Extracting poster frame from last 3 seconds..."
# Get video duration and extract frame near the end (closing scene)
DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)
POSTER_TIME=$((DURATION - 2))
if [ "$POSTER_TIME" -lt 0 ]; then POSTER_TIME=0; fi

ffmpeg -y -ss "$POSTER_TIME" -i "$OUT" \
  -frames:v 1 \
  -q:v 2 \
  "$POSTER"

echo "==> Poster saved: $POSTER"
ls -lh "$POSTER"

echo "==> Done! Verify:"
echo "    open $OUT"
echo "    open $POSTER"
