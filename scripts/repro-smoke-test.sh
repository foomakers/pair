#!/usr/bin/env bash
# Repro smoke-test for pair-cli artifact
# Usage: ./scripts/repro-smoke-test.sh /absolute/path/to/extracted/artifact
set -eu

ART_DIR=${1:-}
if [ -z "$ART_DIR" ]; then
  echo "Usage: $0 /absolute/path/to/extracted/artifact" >&2
  exit 2
fi

if [ ! -d "$ART_DIR" ]; then
  echo "Artifact dir not found: $ART_DIR" >&2
  exit 2
fi

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
PKG_ROOT="$REPO_ROOT/apps/pair-cli"

echo "Repository root: $REPO_ROOT"
echo "Package root: $PKG_ROOT"
echo "Artifact dir: $ART_DIR"

run_cmd() {
  local wd=$1
  local cmd=$2
  echo "\n--- [WD=$wd] $cmd ---"
  (cd "$wd" && PAIR_DIAG=1 bash -lc "$cmd") || echo "(exit non-zero)"
}

# Workdir list to try
WORKDIRS=(
  "$ART_DIR"
  "$(dirname "$ART_DIR")"
  "$PKG_ROOT"
  "$REPO_ROOT"
)

for wd in "${WORKDIRS[@]}"; do
  echo "\n===== Testing from working dir: $wd ====="
  if [ -d "$wd" ]; then
    echo "ls -la $wd:"; ls -la "$wd" || true
    # Top-level wrapper
    if [ -x "$wd/pair-cli" ]; then
      run_cmd "$wd" "./pair-cli --version 2>&1 || true"
    else
      echo "$wd/pair-cli not executable or not present"
    fi

    # bin wrapper
    if [ -x "$wd/bin/pair-cli" ]; then
      run_cmd "$wd" "./bin/pair-cli --version 2>&1 || true"
    else
      echo "$wd/bin/pair-cli not executable or not present"
    fi

    # node bundle fallback
    if [ -f "$wd/bundle-cli/index.js" ]; then
      run_cmd "$wd" "node bundle-cli/index.js --version 2>&1 || true"
    else
      echo "$wd/bundle-cli/index.js not present"
    fi
  else
    echo "workdir $wd does not exist"
  fi
done

echo "\nDone. Review outputs above. To reproduce CI, run unzip the ZIP using 'unzip -q' and then supply the path to this script."
