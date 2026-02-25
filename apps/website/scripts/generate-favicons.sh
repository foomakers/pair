#!/usr/bin/env bash
set -euo pipefail

# Generates all favicon assets from the brand SVG source of truth.
# Requires: rsvg-convert (librsvg), magick (ImageMagick 7+)
#
# Usage: bash apps/website/scripts/generate-favicons.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"
BRAND_COLORS="$SCRIPT_DIR/../../../packages/brand/src/tokens/colors.ts"

# ── Extract brand colors from tokens ────────────────────────────────
BLUE=$(grep 'PAIR_BLUE' "$BRAND_COLORS" | grep -oE "'#[0-9A-Fa-f]{6}'" | tr -d "'")
TEAL=$(grep 'PAIR_TEAL' "$BRAND_COLORS" | grep -oE "'#[0-9A-Fa-f]{6}'" | tr -d "'")

echo "Brand colors: blue=$BLUE teal=$TEAL"

# ── Generate favicon SVG (initial state: pills offset by 4px each) ──
# Matches Logo.tsx favicon variant coords (y=8) with animation offset:
#   blue  translateY(-4px) → y = 8 - 4 = 4
#   teal  translateY(+4px) → y = 8 + 4 = 12
cat > "$PUBLIC_DIR/favicon.svg" <<SVG
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="4" width="8" height="16" rx="4" fill="${BLUE}" />
  <rect x="18" y="12" width="8" height="16" rx="4" fill="${TEAL}" />
</svg>
SVG

# ── Rasterize ───────────────────────────────────────────────────────
rsvg-convert -w 16  -h 16  "$PUBLIC_DIR/favicon.svg" -o "$PUBLIC_DIR/_tmp-16.png"
rsvg-convert -w 32  -h 32  "$PUBLIC_DIR/favicon.svg" -o "$PUBLIC_DIR/_tmp-32.png"
rsvg-convert -w 180 -h 180 "$PUBLIC_DIR/favicon.svg" -o "$PUBLIC_DIR/apple-touch-icon.png"
rsvg-convert -w 192 -h 192 "$PUBLIC_DIR/favicon.svg" -o "$PUBLIC_DIR/icon-192.png"
rsvg-convert -w 512 -h 512 "$PUBLIC_DIR/favicon.svg" -o "$PUBLIC_DIR/icon-512.png"

# ── ICO (multi-size) ───────────────────────────────────────────────
magick "$PUBLIC_DIR/_tmp-32.png" "$PUBLIC_DIR/_tmp-16.png" "$PUBLIC_DIR/favicon.ico"
rm "$PUBLIC_DIR/_tmp-16.png" "$PUBLIC_DIR/_tmp-32.png"

echo "Generated:"
ls -la "$PUBLIC_DIR"/favicon.* "$PUBLIC_DIR"/apple-touch-icon.png "$PUBLIC_DIR"/icon-*.png
