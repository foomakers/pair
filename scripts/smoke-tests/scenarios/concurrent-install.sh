#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true

TEST_NAME="Concurrent Install Scenarios"
echo "=== Running $TEST_NAME ==="

# US-134: two `pair install` processes against ONE target must leave one run's tree
# end-to-end (last writer wins, no lock, neither aborts) and a clean parent directory.

ensure_tmp_dir
if [ -z "${TEST_BINARY:-}" ]; then ensure_packaged_cli || true; fi

SRC_A=$(setup_workspace "concurrent-src-a")
SRC_B=$(setup_workspace "concurrent-src-b")
for tag in A B; do
  dir="$SRC_A"; [ "$tag" = "B" ] && dir="$SRC_B"
  mkdir -p "$dir/.pair/knowledge/how-to"
  printf -- "# Mock KB %s\n" "$tag" > "$dir/.pair/README.md"
  for i in 1 2 3 4 5 6 7 8; do
    printf -- "run %s file %s\n" "$tag" "$i" > "$dir/.pair/knowledge/how-to/f$i.md"
  done
done

TEST_DIR=$(setup_workspace "concurrent-install")
cd "$TEST_DIR"
unset INIT_CWD

log_info "Test 1: two concurrent installs into one project"
eval "$TEST_BINARY install --source '$SRC_A' --offline" > "$TMP_DIR/concurrent-a.log" 2>&1 &
PID_A=$!
eval "$TEST_BINARY install --source '$SRC_B' --offline" > "$TMP_DIR/concurrent-b.log" 2>&1 &
PID_B=$!
STATUS_A=0; STATUS_B=0
wait $PID_A || STATUS_A=$?
wait $PID_B || STATUS_B=$?

# Never a lock error. The ONLY acceptable non-zero exit is install's pre-existing
# "already installed" precondition, when one run observes the other's finished tree: that
# is the install command's own guard, not a write-time failure. At least one run succeeds.
for f in a b; do
  st=$STATUS_A; [ "$f" = "b" ] && st=$STATUS_B
  if [ "$st" -ne 0 ] && ! grep -q "already installed" "$TMP_DIR/concurrent-$f.log"; then
    cat "$TMP_DIR/concurrent-$f.log"
    log_fail "concurrent install $f aborted ($st) for a reason other than the install precondition"
    exit 1
  fi
done
if [ $STATUS_A -ne 0 ] && [ $STATUS_B -ne 0 ]; then
  log_fail "both concurrent installs failed"
  exit 1
fi
assert_dir ".pair/knowledge/how-to" || exit 1

# One run end-to-end: every file carries the same run tag.
TAGS=$(cat .pair/knowledge/how-to/f*.md | awk '{print $2}' | sort -u)
if [ "$(echo "$TAGS" | wc -l | tr -d ' ')" != "1" ]; then
  log_fail "interleaved tree: files from more than one run ($TAGS)"
  exit 1
fi
[ "$(ls .pair/knowledge/how-to | wc -l | tr -d ' ')" = "8" ] || { log_fail "tree is not complete"; exit 1; }
log_succ "final tree is one run's output, whole"

log_info "Test 2: no stage or aside residue in the parent directories"
RESIDUE=$(find . -name '*.tmp-*' -o -name '*.bak*' | grep -v '^./apps/' || true)
if [ -n "$RESIDUE" ]; then
  log_fail "residue left behind: $RESIDUE"
  exit 1
fi
log_succ "no *.tmp-* / *.bak* residue"
