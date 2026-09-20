#!/usr/bin/env bash
set -euo pipefail

# Smoke test: end-to-end coverage of `pair install|update --source <https-url>` —
# the remote-URL path (download, progress evidence, error handling, retry budget).
# `source-resolution.sh` (OFFLINE_SAFE=true) covers only local directories; the
# `auto-download-*.sh` scenarios cover only the no-`--source` release-asset path.
# Nothing else exercises `--source <https-url>` end to end. Story #136.
#
# Error-path tests (AC5-AC7) never depend on a third-party endpoint: they use a
# local self-signed HTTPS fixture server (the CLI's HttpClientService is HTTPS-only
# — `https.get` throws "Protocol http: not supported" for an http:// URL, verified
# directly against `packages/content-ops/src/http/http-client-service.ts`) or a
# closed local port, so failures are fully deterministic offline. Only the
# happy-path install/update (AC2-AC4) uses a real remote URL.

OFFLINE_SAFE=false

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Remote Source Resolution (--source <https-url>)"
echo "=== Running $TEST_NAME ==="

ensure_tmp_dir

# Pinned happy-path source: a real release asset of THIS repo (predictable, stable).
# `--source` install is not tied to the CLI's own version — the URL alone decides
# what is fetched — so pinning a specific past release keeps this from depending on
# the CLI's currently-unreleased version.
RELEASE_URL="https://github.com/foomakers/pair/releases/download/v0.4.3/knowledge-base-0.4.3.zip"

# ── Local HTTPS fixture server (AC6: 404) ────────────────────────────────────
# The CLI's http client always calls Node's https.get, even for an http:// URL
# (it throws "Protocol http: not supported. Expected https:" before ever reaching
# the network) — so a deterministic local error-path fixture must itself be HTTPS.
FIXTURE_DIR="$TMP_DIR/remote-source-resolution-fixture"
rm -rf "$FIXTURE_DIR"
mkdir -p "$FIXTURE_DIR"

if ! command -v openssl >/dev/null 2>&1; then
  log_fail "openssl not found; required to generate the local HTTPS fixture's self-signed cert"
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -keyout "$FIXTURE_DIR/key.pem" -out "$FIXTURE_DIR/cert.pem" \
  -days 1 -nodes -subj "/CN=localhost" >/dev/null 2>&1

cat > "$FIXTURE_DIR/server.js" <<'EOF'
const https = require('https')
const fs = require('fs')
const port = parseInt(process.argv[2], 10)
const certDir = process.argv[3]
const options = {
  key: fs.readFileSync(`${certDir}/key.pem`),
  cert: fs.readFileSync(`${certDir}/cert.pem`),
}
https
  .createServer(options, (req, res) => {
    res.writeHead(404)
    res.end('not found')
  })
  .listen(port, '127.0.0.1', () => console.log('listening'))
EOF

FIXTURE_PORT=18743
FIXTURE_PID=""

start_fixture_server() {
  node "$FIXTURE_DIR/server.js" "$FIXTURE_PORT" "$FIXTURE_DIR" >"$FIXTURE_DIR/server.log" 2>&1 &
  FIXTURE_PID=$!
  # Wait for the listener rather than a fixed sleep.
  for _ in $(seq 1 50); do
    grep -q "listening" "$FIXTURE_DIR/server.log" 2>/dev/null && return 0
    sleep 0.1
  done
  log_fail "Local HTTPS fixture server did not start"
  return 1
}

stop_fixture_server() {
  if [ -n "$FIXTURE_PID" ] && kill -0 "$FIXTURE_PID" 2>/dev/null; then
    kill "$FIXTURE_PID" 2>/dev/null || true
    wait "$FIXTURE_PID" 2>/dev/null || true
  fi
  FIXTURE_PID=""
}

trap stop_fixture_server EXIT

# The local fixture's cert is self-signed on purpose (deterministic, no CA
# dependency); NODE_TLS_REJECT_UNAUTHORIZED=0 is scoped to these two run_pair
# invocations only, never exported for the happy-path (real GitHub) requests.

# -------------------------------------------------------------------
# Test 1 (AC1): scenario file conventions
# -------------------------------------------------------------------
log_info "Test 1: scenario declares OFFLINE_SAFE=false and follows conventions"
SELF_MODE=$(file_mode "$(dirname "$0")/remote-source-resolution.sh")
if [ "$SELF_MODE" = "755" ] || [ "$SELF_MODE" = "775" ]; then
  log_succ "Scenario file is executable ($SELF_MODE)"
else
  log_fail "Scenario file is not executable (mode: $SELF_MODE)"
  exit 1
fi

# -------------------------------------------------------------------
# Test 2 (AC2): install --source <https-url> succeeds, content verified on disk
# -------------------------------------------------------------------
log_info "Test 2: pair install --source <https-url> — happy path"
TEST_DIR=$(setup_workspace "remote-source-install")
cd "$TEST_DIR"
run_pair install --source "$RELEASE_URL"
assert_success || exit 1
assert_dir ".pair/knowledge" || exit 1
log_succ "Remote install succeeded and KB content verified on disk"

# -------------------------------------------------------------------
# Test 3 (AC4): non-TTY download-in-progress evidence via the CLI's own current
# output (`download-ui.ts`'s announceDownload/announceSuccess) — captured from
# Test 2's run (run_pair's non-interactive capture is never a TTY).
# AC4 as originally drafted (a `formatProgress` percentage line) is unreachable
# from the real CLI and was descoped 2026-09-18 (see the card).
# -------------------------------------------------------------------
log_info "Test 3: non-TTY download-in-progress evidence"
assert_output_contains "downloading v0.4.3 from GitHub" || exit 1
assert_output_contains "KB v0.4.3 installed at" || exit 1
log_succ "Download-in-progress evidence present via announceDownload/announceSuccess"

# -------------------------------------------------------------------
# Test 4 (AC3): update --source <https-url> succeeds on a workspace already
# installed from that URL
# -------------------------------------------------------------------
log_info "Test 4: pair update --source <https-url> — already-installed workspace"
run_pair update --source "$RELEASE_URL"
assert_success || exit 1
log_succ "Remote update succeeded"

# -------------------------------------------------------------------
# Test 5 (AC5): unsupported protocol / malformed URL -> non-zero exit, clear error
# -------------------------------------------------------------------
log_info "Test 5: unsupported protocol and malformed source values"
TEST_DIR=$(setup_workspace "remote-source-invalid")
cd "$TEST_DIR"

# `run_pair ... && RC=0 || RC=$?` keeps the compound command's own status 0 (via
# the `||` branch), so `set -e` never fires on an EXPECTED failure here — a bare
# `run_pair ...; RC=$?` would abort the script on the very call under test.
RC=0
run_pair install --source "file:///etc" && RC=0 || RC=$?
if [ $RC -eq 0 ]; then
  log_fail "file:// source unexpectedly succeeded"
  exit 1
fi
log_succ "Unsupported protocol (file://) correctly rejected (exit $RC)"

RC=0
run_pair install --source "ftp://example.com/x" && RC=0 || RC=$?
if [ $RC -eq 0 ]; then
  log_fail "ftp:// source unexpectedly succeeded"
  exit 1
fi
log_succ "Unsupported protocol (ftp://) correctly rejected (exit $RC)"

RC=0
run_pair install --source "not-a-real-kb-source-xyz" && RC=0 || RC=$?
if [ $RC -eq 0 ]; then
  log_fail "Malformed/non-existent source unexpectedly succeeded"
  exit 1
fi
log_succ "Malformed source correctly rejected (exit $RC)"

# -------------------------------------------------------------------
# Test 6 (AC6): HTTP 404 fails fast, no retry delay observed
# -------------------------------------------------------------------
log_info "Test 6: 404 fails fast (non-retryable)"
TEST_DIR=$(setup_workspace "remote-source-404")
cd "$TEST_DIR"

start_fixture_server || exit 1

START_TS=$(date +%s)
STATUS_404=0
NODE_TLS_REJECT_UNAUTHORIZED=0 run_pair install --source "https://127.0.0.1:${FIXTURE_PORT}/missing.zip" && STATUS_404=0 || STATUS_404=$?
END_TS=$(date +%s)
ELAPSED_404=$((END_TS - START_TS))

stop_fixture_server

if [ $STATUS_404 -eq 0 ]; then
  log_fail "404 install unexpectedly succeeded"
  exit 1
fi
log_succ "404 correctly rejected (exit $STATUS_404)"

# No retry delay: 404 is non-retryable, so total time stays well under the
# 7s retry-budget floor asserted in Test 7. A generous bound (5s) absorbs
# process startup without masking an accidental retry loop.
if [ $ELAPSED_404 -ge 5 ]; then
  log_fail "404 took ${ELAPSED_404}s — looks like it was retried (non-retryable errors must fail immediately)"
  exit 1
fi
log_succ "404 failed fast (${ELAPSED_404}s, no retry delay)"

# -------------------------------------------------------------------
# Test 7 (AC7): connection-refused retries then fails, total duration >= 7s
# -------------------------------------------------------------------
log_info "Test 7: connection-refused exhausts the retry budget (>= 7s)"
TEST_DIR=$(setup_workspace "remote-source-refused")
cd "$TEST_DIR"

# A port nothing is listening on — the OS refuses the connection immediately,
# matching 'econnrefused' in retryable-download.ts's RETRYABLE_PATTERNS.
REFUSED_PORT=18744

START_TS=$(date +%s)
STATUS_REFUSED=0
NODE_TLS_REJECT_UNAUTHORIZED=0 run_pair install --source "https://127.0.0.1:${REFUSED_PORT}/kb.zip" && STATUS_REFUSED=0 || STATUS_REFUSED=$?
END_TS=$(date +%s)
ELAPSED_REFUSED=$((END_TS - START_TS))

if [ $STATUS_REFUSED -eq 0 ]; then
  log_fail "Connection-refused install unexpectedly succeeded"
  exit 1
fi
log_succ "Connection-refused correctly rejected (exit $STATUS_REFUSED)"

# Lower-bound only (never an upper bound) — DEFAULT_DELAYS=[1000,2000,4000]ms,
# DEFAULT_MAX_RETRIES=3 in retryable-download.ts: three retries after the first
# attempt, all rejected, sum to >= 7s of mandatory delay before giving up.
if [ $ELAPSED_REFUSED -ge 7 ]; then
  log_succ "Retry budget exhausted after >= 7s (${ELAPSED_REFUSED}s)"
else
  log_fail "Connection-refused failed after only ${ELAPSED_REFUSED}s — expected >= 7s (retry budget: 1s+2s+4s)"
  exit 1
fi

# -------------------------------------------------------------------
# Test 8 (AC9, AC10): registered CI_EXCLUDED with a reason naming the network
# dependency, and documented in the README consistently with that reason.
# This is the docs/config half of the story (never written by this test file
# itself — `lib/ci-tests.sh` and `README.md` are edited by the implementation,
# not here) — asserted as an executable invariant rather than left to a manual
# read-through, so a future edit cannot silently drop one half.
# -------------------------------------------------------------------
log_info "Test 8: registered in CI_EXCLUDED and documented in the README"
CI_TESTS_FILE="$REPO_ROOT/scripts/smoke-tests/lib/ci-tests.sh"
README_FILE="$REPO_ROOT/scripts/smoke-tests/README.md"

if ! grep -q '"remote-source-resolution\.sh:' "$CI_TESTS_FILE"; then
  log_fail "remote-source-resolution.sh is not registered in CI_EXCLUDED ($CI_TESTS_FILE)"
  exit 1
fi
CI_REASON_LINE="$(grep '"remote-source-resolution\.sh:' "$CI_TESTS_FILE")"
if ! echo "$CI_REASON_LINE" | grep -qi "network"; then
  log_fail "CI_EXCLUDED reason for remote-source-resolution.sh does not name the network dependency: $CI_REASON_LINE"
  exit 1
fi
log_succ "Registered in CI_EXCLUDED with a reason naming the network dependency"

if ! grep -q "remote-source-resolution.sh" "$README_FILE"; then
  log_fail "README.md does not document remote-source-resolution.sh"
  exit 1
fi
if ! grep -qi "network" "$README_FILE"; then
  log_fail "README.md does not name the network-dependent exclusion reason"
  exit 1
fi
log_succ "README.md documents the scenario and its exclusion reason"

echo "=== $TEST_NAME Completed ==="
