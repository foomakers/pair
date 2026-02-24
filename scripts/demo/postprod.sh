#!/usr/bin/env bash
# Post-production: add overlay text, compress, extract poster
#
# Prerequisites:
#   brew install ffmpeg
#   scripts/demo/demo-raw.mp4 must exist (from record.sh)
#
# Usage:
#   bash scripts/demo/postprod.sh

set -e
cd "$(dirname "$0")"

RAW="demo-raw.mp4"
OUT="../../apps/website/public/demo.mp4"
POSTER="../../apps/website/public/demo-poster.png"

if [ ! -f "$RAW" ]; then
  echo "Error: $RAW not found. Run record.sh first."
  exit 1
fi

# Use system font (macOS Helvetica) — replace with Plus Jakarta Sans .ttf if available
FONT="/System/Library/Fonts/Helvetica.ttc"

echo "==> Adding overlay text and compressing..."

# Scene timestamps (adjust after reviewing demo-raw.mp4):
#   Scene 1 (/pair-next):     0s  - 3s
#   Scene 2 (Refine):         3s  - 12s
#   Scene 3 (Implement):      12s - 22s
#   Scene 4 (Closing):        22s - 25s

ffmpeg -y -i "$RAW" \
  -vf " \
    drawtext=text='1 · Discover': \
      fontfile=$FONT:fontsize=28:fontcolor=white: \
      borderw=2:bordercolor=black@0.6: \
      x=40:y=h-60: \
      enable='between(t,0.5,2.5)': \
      alpha='if(lt(t,0.8),0,if(lt(t,1.0),(t-0.8)/0.2,if(lt(t,2.2),1,(2.5-t)/0.3)))', \
    drawtext=text='2 · Refine': \
      fontfile=$FONT:fontsize=28:fontcolor=white: \
      borderw=2:bordercolor=black@0.6: \
      x=40:y=h-60: \
      enable='between(t,3.5,11.5)': \
      alpha='if(lt(t,3.8),0,if(lt(t,4.0),(t-3.8)/0.2,if(lt(t,11.2),1,(11.5-t)/0.3)))', \
    drawtext=text='3 · Implement': \
      fontfile=$FONT:fontsize=28:fontcolor=white: \
      borderw=2:bordercolor=black@0.6: \
      x=40:y=h-60: \
      enable='between(t,12.5,21.5)': \
      alpha='if(lt(t,12.8),0,if(lt(t,13.0),(t-12.8)/0.2,if(lt(t,21.2),1,(21.5-t)/0.3)))', \
    drawtext=text='Code is the easy part.': \
      fontfile=$FONT:fontsize=42:fontcolor=white: \
      borderw=2:bordercolor=black@0.6: \
      x=(w-text_w)/2:y=(h-text_h)/2: \
      enable='between(t,22,25)': \
      alpha='if(lt(t,22.3),0,if(lt(t,22.8),(t-22.3)/0.5,1))' \
  " \
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

echo "==> Extracting poster frame at t=22s..."
ffmpeg -y -ss 22 -i "$OUT" \
  -frames:v 1 \
  -q:v 2 \
  "$POSTER"

echo "==> Poster saved: $POSTER"
ls -lh "$POSTER"

echo "==> Done! Verify:"
echo "    open $OUT"
echo "    open $POSTER"
