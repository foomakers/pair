#!/usr/bin/env bash
set -euo pipefail

# Smoke test: end-to-end coverage of `pair install|update --source <https-url>` —
# the remote-URL path (download, progress, error handling, retry budget) has no
# real-CLI coverage otherwise. `source-resolution.sh` (OFFLINE_SAFE=true) covers
# only local directories; `auto-download-*.sh` cover only the no-`--source`
# release-asset path. Story #136, deferred follow-up from PR #133 / story #92.
#
# Requires network access for the happy path (AC2-AC4) — real HTTPS download
# against a pinned release asset of this repo. The error-path tests (AC5-AC7) are
# fully offline-deterministic: local fixtures only, per the story's Business Rule
# that error paths must never depend on a third-party endpoint.
#
# `set -e` is active (AC1), so every block below whose `pair` invocation is
# EXPECTED TO FAIL brackets it in `set +e` / `set -e` and captures the exit code
# explicitly — a bare failing call under `set -e` would abort the scenario before
# the assertions that prove it failed FOR THE RIGHT REASON ever ran.

OFFLINE_SAFE=false

source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Remote Source Resolution"
echo "=== Running $TEST_NAME ==="

FIXTURES_DIR="$(cd "$(dirname "$0")/../fixtures" && pwd)"
# Resolved ONCE, before any `cd "$TEST_DIR"` below makes a relative `$0` unusable.
README="$(cd "$(dirname "$0")/.." && pwd)/README.md"

# Pinned to a KNOWN-PUBLISHED release asset of this repo (Assumption 5, story
# #136) rather than "latest": a moving target would make a red here ambiguous
# between "the code broke" and "the pin rotted". If this asset ever goes stale,
# the happy-path block fails for a non-code reason — acceptable because this
# scenario is CI_EXCLUDED (mirrors the `auto-download-*.sh` posture).
RELEASE_TAG="v0.4.3"
RELEASE_URL="https://github.com/foomakers/pair/releases/download/${RELEASE_TAG}/knowledge-base-0.4.3.zip"

# -------------------------------------------------------------------
# AC2 / AC3 / AC4 — happy path: install, update, non-TTY progress evidence
# -------------------------------------------------------------------
log_info "Test 1: Install from a real HTTPS release-asset URL (AC2)"
TEST_DIR=$(setup_workspace "remote-source-install")
cd "$TEST_DIR"
run_pair install --source "$RELEASE_URL"
assert_success || exit 1
assert_dir ".pair/knowledge" || exit 1
assert_file "AGENTS.md" || exit 1
log_succ "Install from HTTPS release asset succeeded, content verified on disk"

log_info "Test 2: Non-TTY download progress evidence in captured output (AC4)"
# Read BEFORE the next run_pair call overwrites $TMP_DIR/last_cmd_output.log.
# Asserts the REAL formatProgress non-TTY contract (`${label}... ${pct}% complete`),
# never the `[N/M] registry-name` format the original card assumed and that AC4
# explicitly rules out as non-existent in the code (that format exists, but for
# per-registry copy progress — a different, unrelated log line — not for the
# download this AC is about).
#
# Bracketed in set +e/set -e, like the expected-failure blocks below (Tests 4-8):
# AC4 is a WITNESS (red until production wires progressWriter through the command
# layer). A bare `|| exit 1` here, under this script's global `set -e`, would abort
# the whole process before Tests 3-9 ever ran — the defect this bracket removes.
# AC4_FAILED is checked again at the very end of the script (after Test 9) so a red
# AC4 still fails the overall run even when every later test reaches completion.
AC4_FAILED=0
set +e
assert_output_contains "Downloading KB..."
AC4_RC1=$?
assert_output_contains "% complete"
AC4_RC2=$?
set -e
if [ "$AC4_RC1" -eq 0 ] && [ "$AC4_RC2" -eq 0 ]; then
  log_succ "Non-TTY download progress evidence present"
else
  log_fail "Non-TTY download progress evidence missing (AC4)"
  AC4_FAILED=1
fi

log_info "Test 3: Update from the same HTTPS URL (AC3)"
run_pair update --source "$RELEASE_URL"
assert_success || exit 1
assert_dir ".pair/knowledge" || exit 1
log_succ "Update from HTTPS release asset succeeded"

# -------------------------------------------------------------------
# AC5 — unsupported protocol / malformed URL -> non-zero, clear error
# Fully offline-deterministic: no network reachability required.
# -------------------------------------------------------------------
log_info "Test 4: Unsupported protocol (file://) is rejected (AC5)"
TEST_DIR=$(setup_workspace "remote-source-invalid-file")
cd "$TEST_DIR"
set +e
run_pair install --source "file:///etc/passwd"
RC=$?
set -e
if [ "$RC" -ne 0 ]; then
  log_succ "file:// correctly rejected (exit $RC)"
else
  log_fail "file:// install succeeded but should have failed"
  exit 1
fi
assert_output_contains "Unsupported source protocol" || exit 1

log_info "Test 5: Unsupported protocol (ftp://) is rejected (AC5)"
TEST_DIR=$(setup_workspace "remote-source-invalid-ftp")
cd "$TEST_DIR"
set +e
run_pair install --source "ftp://example.com/x"
RC=$?
set -e
if [ "$RC" -ne 0 ]; then
  log_succ "ftp:// correctly rejected (exit $RC)"
else
  log_fail "ftp:// install succeeded but should have failed"
  exit 1
fi
assert_output_contains "Unsupported source protocol" || exit 1

log_info "Test 6: Malformed non-URL string falls through to local-path resolution and fails (AC5)"
TEST_DIR=$(setup_workspace "remote-source-invalid-malformed")
cd "$TEST_DIR"
set +e
run_pair install --source "not-a-valid-url-at-all"
RC=$?
set -e
if [ "$RC" -ne 0 ]; then
  log_succ "Malformed source string correctly rejected (exit $RC)"
else
  log_fail "Malformed source string succeeded but should have failed"
  exit 1
fi
assert_output_contains "KB source path not found" || exit 1

# -------------------------------------------------------------------
# AC6 — a well-formed HTTPS URL that returns 404 -> fail fast, no retry delay
#
# Deliberately HTTPS, matching the AC's own wording ("a well-formed HTTPS URL") —
# NOT the technical note's "python3 -m http.server" suggestion. Verified
# empirically (2026-09-18): NodeHttpClientService (packages/content-ops/src/http)
# dials the `https` module unconditionally, and `https.get('http://...')` throws
# `ERR_INVALID_PROTOCOL` before any socket opens — a plain-HTTP fixture would
# never reach the 404/retry code paths these ACs are about. The self-signed cert
# is generated fresh per run (openssl, already a suite dependency via
# `lib/utils.sh`'s `openssl rand`) and trust is relaxed for this one child
# process only, via NODE_TLS_REJECT_UNAUTHORIZED — never globally, never for the
# suite's own process.
# -------------------------------------------------------------------
log_info "Test 7: HTTP 404 fails fast with no retry delay (AC6)"
CERT_DIR="$TMP_DIR/remote-source-404-certs"
rm -rf "$CERT_DIR"
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
  -subj "/CN=127.0.0.1" >/dev/null 2>&1

PORT_FILE="$TMP_DIR/remote-source-404-port"
rm -f "$PORT_FILE"
node "$FIXTURES_DIR/https-404-server.js" "$CERT_DIR/key.pem" "$CERT_DIR/cert.pem" \
  >"$PORT_FILE" 2>"$TMP_DIR/remote-source-404-server.log" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

READY=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do
  if [ -s "$PORT_FILE" ]; then READY=1; break; fi
  sleep 0.2
done
if [ "$READY" -ne 1 ]; then
  log_fail "404 fixture server never reported a port (see $TMP_DIR/remote-source-404-server.log)"
  exit 1
fi
PORT=$(cat "$PORT_FILE")

TEST_DIR=$(setup_workspace "remote-source-404")
cd "$TEST_DIR"
START=$(date +%s)
set +e
NODE_TLS_REJECT_UNAUTHORIZED=0 run_pair install --source "https://127.0.0.1:${PORT}/missing.zip"
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

kill "$SERVER_PID" 2>/dev/null || true
trap - EXIT

if [ "$RC" -ne 0 ]; then
  log_succ "404 install correctly failed (exit $RC)"
else
  log_fail "404 install succeeded but should have failed"
  exit 1
fi
assert_output_contains "404" || exit 1
if [ "$ELAPSED" -lt 5 ]; then
  log_succ "404 failed fast with no retry delay (${ELAPSED}s)"
else
  log_fail "404 took ${ELAPSED}s — HTTP 404 must never be retried (isRetryableError)"
  exit 1
fi

# -------------------------------------------------------------------
# AC7 — connection refused -> retries then fails, total duration >= 7s
# (DEFAULT_DELAYS = [1000, 2000, 4000], DEFAULT_MAX_RETRIES = 3 in
# retryable-download.ts). Lower-bound assertion only, deliberately, to avoid
# flakiness on slow machines (story's own Technical Risks table).
# -------------------------------------------------------------------
log_info "Test 8: Connection refused retries the full budget then fails (AC7)"
CLOSED_PORT=$(node "$FIXTURES_DIR/closed-port.js")

TEST_DIR=$(setup_workspace "remote-source-refused")
cd "$TEST_DIR"
START=$(date +%s)
set +e
run_pair install --source "https://127.0.0.1:${CLOSED_PORT}/kb.zip"
RC=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

if [ "$RC" -ne 0 ]; then
  log_succ "Connection-refused install correctly failed (exit $RC)"
else
  log_fail "Connection-refused install succeeded but should have failed"
  exit 1
fi
assert_output_contains "ECONNREFUSED" || exit 1
if [ "$ELAPSED" -ge 7 ]; then
  log_succ "Connection-refused exhausted the retry budget before failing (${ELAPSED}s >= 7s)"
else
  log_fail "Connection-refused failed after only ${ELAPSED}s — expected >= 7s (1s+2s+4s retry budget)"
  exit 1
fi

# -------------------------------------------------------------------
# AC10 — scripts/smoke-tests/README.md documents this scenario, consistent with
# the other CI_EXCLUDED entries (the `agent-harness-setup.sh` precedent: its own
# numbered "Covered Test Scenarios" section, not just a `ci-tests.sh` comment).
# -------------------------------------------------------------------
log_info "Test 9: README documents the scenario (AC10)"
assert_contains "$README" "remote-source-resolution.sh" || exit 1
if grep -qi 'network' "$README"; then
  log_succ "README documents remote-source-resolution.sh with a network-dependency reason"
else
  log_fail "README mentions remote-source-resolution.sh but not why it is excluded (network)"
  exit 1
fi

echo "=== $TEST_NAME Completed ==="

# AC4 (Test 2) is bracketed above so Tests 3-9 always run in this same invocation;
# this is where its red status (if still red) finally fails the overall script.
if [ "$AC4_FAILED" -ne 0 ]; then
  exit 1
fi
