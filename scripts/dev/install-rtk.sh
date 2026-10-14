#!/usr/bin/env bash
# Installs the pinned rtk release into .tools/bin (repo-local, gitignored). No global changes.
set -euo pipefail
[ -n "${CI:-}" ] || [ -n "${RTK_SKIP:-}" ] && { echo "rtk: skipped (CI or RTK_SKIP set)"; exit 0; }
VERSION="0.52.0"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="$ROOT/.tools/bin"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  ASSET="rtk-aarch64-apple-darwin.tar.gz";      SHA="49ac56bc5edd58ce0c03bf7cc137f8cf2a6253e7707b8236e07321ad66cdc043" ;;
  Darwin-x86_64) ASSET="rtk-x86_64-apple-darwin.tar.gz";       SHA="81748ec5557b21965097531653fc5198bf734cdf240484816f6d9cfa9e816034" ;;
  Linux-aarch64) ASSET="rtk-aarch64-unknown-linux-gnu.tar.gz"; SHA="b1de881a0381f1f059ce9dbb0cfb97e0f94f22460965f39aaff77b2956024fa9" ;;
  Linux-x86_64)  ASSET="rtk-x86_64-unknown-linux-musl.tar.gz"; SHA="46765d4e570ccb3d759e95bcec11feb42fceed5ab2453eac8d787f81d4a0cdab" ;;
  *) echo "rtk: unsupported platform $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

if [ -x "$DEST/rtk" ] && "$DEST/rtk" --version 2>/dev/null | grep -q "$VERSION"; then
  echo "rtk $VERSION already installed at $DEST/rtk"; exit 0
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/rtk-ai/rtk/releases/download/v$VERSION/$ASSET" -o "$TMP/$ASSET"
ACTUAL="$(shasum -a 256 "$TMP/$ASSET" | cut -d' ' -f1)"
[ "$ACTUAL" = "$SHA" ] || { echo "rtk: checksum mismatch for $ASSET" >&2; exit 1; }
tar -xzf "$TMP/$ASSET" -C "$TMP"
mkdir -p "$DEST"
install -m 0755 "$(find "$TMP" -type f -name rtk | head -1)" "$DEST/rtk"
echo "rtk $("$DEST/rtk" --version) installed at $DEST/rtk"
