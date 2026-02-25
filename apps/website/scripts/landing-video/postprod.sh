#!/usr/bin/env bash
# Post-production: concatenate segments, compress, extract poster
#
# Prerequisites:
#   brew install ffmpeg
#   4 segment files from record.sh:
#     replay-part1.mp4, github-scroll.mp4, replay-part2.mp4, login-closing.mp4
#
# Usage:
#   bash apps/website/scripts/landing-video/postprod.sh

set -e
cd "$(dirname "$0")"

OUT="../../public/demo.mp4"
POSTER="../../public/demo-poster.png"
GIF="../../public/demo.gif"

# Verify all segments exist
for seg in replay-part1.mp4 github-scroll.mp4 replay-part2.mp4 login-closing.mp4; do
  if [ ! -f "$seg" ]; then
    echo "Error: $seg not found. Run record.sh first."
    exit 1
  fi
done

echo "==> Concatenating 4 segments..."

# Create concat list
cat > concat-list.txt <<'LIST'
file 'replay-part1.mp4'
file 'github-scroll.mp4'
file 'replay-part2.mp4'
file 'login-closing.mp4'
LIST

ffmpeg -y \
  -f concat \
  -safe 0 \
  -i concat-list.txt \
  -c:v libx264 \
  -preset slow \
  -crf 28 \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -an \
  "$OUT"

rm -f concat-list.txt

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

echo "==> Extracting poster frame from closing scene..."
DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)
POSTER_TIME=$((DURATION - 2))
if [ "$POSTER_TIME" -lt 0 ]; then POSTER_TIME=0; fi

ffmpeg -y -ss "$POSTER_TIME" -i "$OUT" \
  -frames:v 1 \
  -q:v 2 \
  "$POSTER"

echo "==> Poster saved: $POSTER"
ls -lh "$POSTER"

echo "==> Generating GIF for README..."
# Two-pass: generate palette for quality, then apply it
# Scale to 640px width, 10fps for small file size
ffmpeg -y -i "$OUT" \
  -vf "fps=10,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
  "$GIF"

GIF_SIZE=$(stat -f%z "$GIF" 2>/dev/null || stat -c%s "$GIF" 2>/dev/null)
GIF_MAX=$((10 * 1024 * 1024))
if [ "$GIF_SIZE" -gt "$GIF_MAX" ]; then
  echo "Warning: GIF ${GIF_SIZE} exceeds 10MB. Re-encoding at lower fps..."
  ffmpeg -y -i "$OUT" \
    -vf "fps=6,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer" \
    "$GIF"
fi

echo "==> GIF saved: $GIF"
ls -lh "$GIF"

echo "==> Done! Verify:"
echo "    open $OUT"
echo "    open $POSTER"
echo "    open $GIF"
