#!/usr/bin/env bash
set -euo pipefail

# Generates all brand assets (favicons + social preview) from the brand SVG source of truth.
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

# ── Social preview (1280×640, GitHub repo card) ─────────────────────
# Layout: white bg, pair logo (pills offset) centered, "pair" wordmark,
# claim text below. 40px safe border per GitHub template guidelines.
cat > "$PUBLIC_DIR/_social-preview.svg" <<SVG
<svg width="1280" height="640" viewBox="0 0 1280 640" xmlns="http://www.w3.org/2000/svg">
  <rect width="1280" height="640" fill="#FFFFFF" />
  <!-- Pair logo: offset pills (scaled from favicon 32×32 → 160×160, centered) -->
  <g transform="translate(560, 120) scale(5)">
    <rect x="6" y="4" width="8" height="16" rx="4" fill="${BLUE}" />
    <rect x="18" y="12" width="8" height="16" rx="4" fill="${TEAL}" />
  </g>
  <!-- Wordmark -->
  <text x="640" y="370" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="72" font-weight="700" fill="#0A0D14" text-anchor="middle">pair</text>
  <!-- Claim -->
  <text x="640" y="440" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="32" font-weight="400" fill="#4B5563" text-anchor="middle">Code is the easy part.</text>
</svg>
SVG

rsvg-convert -w 1280 -h 640 "$PUBLIC_DIR/_social-preview.svg" -o "$PUBLIC_DIR/social-preview.png"
rm "$PUBLIC_DIR/_social-preview.svg"

echo "Generated:"
ls -la "$PUBLIC_DIR"/favicon.* "$PUBLIC_DIR"/apple-touch-icon.png "$PUBLIC_DIR"/icon-*.png "$PUBLIC_DIR"/social-preview.png
