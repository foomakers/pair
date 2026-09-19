#!/usr/bin/env bash
# Smoke test: `pair install|update --source <https-url>` end to end — the remote-URL path
# (download, progress, error handling, retry budget) that unit tests already pin but no
# real-CLI scenario exercised (story #136, follow-up from PR #133 / story #92 review).
#
# Requires network access for the happy path (Test 1-3): a real HTTPS release asset of
# this repo. Error paths (Test 4-6) are fully deterministic offline, against local fixtures.

OFFLINE_SAFE=false

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Remote Source Resolution (--source <https-url>)"
echo "=== Running $TEST_NAME ==="

ensure_tmp_dir

# Pinned to a real release asset of this repo (story Assumption 5): predictable and stable,
# so a stale/unreachable asset is the only non-code failure mode — acceptable because this
# scenario is CI_EXCLUDED (mirrors the auto-download-*.sh posture).
RELEASE_URL="https://github.com/foomakers/pair/releases/download/v0.4.3/knowledge-base-0.4.3.zip"

# -------------------------------------------------------------------
# Test 1: Happy path — install from a real HTTPS release URL (AC2)
# -------------------------------------------------------------------
log_info "Test 1: Install from a real HTTPS release URL"
TEST_DIR=$(setup_workspace "remote-source-install")
cd "$TEST_DIR"
run_pair install --source "$RELEASE_URL"
assert_success || exit 1
assert_dir ".pair" || exit 1
assert_dir ".pair/knowledge" || exit 1
assert_dir ".pair/adoption" || exit 1
assert_file "AGENTS.md" || exit 1
log_succ "Install from remote HTTPS URL succeeded, content verified on disk"

# -------------------------------------------------------------------
# Test 2: Non-TTY download-in-progress evidence (AC4, DESCOPED 2026-09-18)
#
# Asserts the CLI's OWN current output (download-ui.ts's announceDownload/announceSuccess)
# — never a percentage line from progress-reporter.ts's formatProgress, which is unreachable
# from a real `pair install|update --source <url>` today: progressWriter/isTTY are declared
# in DatasetResolveOptions (apps/pair-cli/src/config/kb-resolver.ts) but never read by
# resolveDatasetRoot and never threaded through InstallHandlerOptions/DispatchContext —
# verified by direct read of that call chain, not assumed. Wiring it is a production change
# out of scope for this test-only story (see the card's AC4 note and Technical Risks table).
#
# Checked against $TMP_DIR/last_cmd_output.log, which run_pair overwrites on every
# invocation — this MUST run before Test 3's `update` overwrites Test 1's captured output.
# -------------------------------------------------------------------
log_info "Test 2: Non-TTY progress evidence via announceDownload/announceSuccess"
assert_output_contains "downloading" || exit 1
assert_output_contains "installed at" || exit 1
log_succ "Download-in-progress and success evidence present in CLI output"

# -------------------------------------------------------------------
# Test 3: Update from the same URL, in the same already-installed workspace (AC3)
# -------------------------------------------------------------------
log_info "Test 3: Update from the same HTTPS release URL"
run_pair update --source "$RELEASE_URL"
assert_success || exit 1
assert_dir ".pair" || exit 1
log_succ "Update from remote HTTPS URL succeeded"

# -------------------------------------------------------------------
# Test 4: Unsupported protocol / malformed URL (AC5)
#
# detectSourceType (source-detector.ts) returns INVALID for file:// and ftp://, rejected at
# parse time ("Unsupported source protocol: ..."); a non-URL string falls through to
# local-path resolution and fails as a non-existent path ("KB source path not found: ...").
# -------------------------------------------------------------------
log_info "Test 4: Unsupported protocol / malformed URL rejected"
TEST_DIR=$(setup_workspace "remote-source-invalid")
cd "$TEST_DIR"

run_pair install --source "file:///etc"
assert_failure || exit 1
assert_output_contains "Unsupported source protocol" || exit 1

run_pair install --source "ftp://example.com/x"
assert_failure || exit 1
assert_output_contains "Unsupported source protocol" || exit 1

run_pair install --source "not-a-real-source::whatever"
assert_failure || exit 1
assert_output_contains "not found" || exit 1
log_succ "Unsupported protocols and malformed URL correctly rejected"

# -------------------------------------------------------------------
# Local HTTPS fixtures for the deterministic error paths (AC6, AC7)
#
# VERIFIED against this tree: NodeHttpClientService (packages/content-ops/src/http/
# http-client-service.ts) calls Node's `https` module DIRECTLY and rejects a plain
# http:// URL synchronously — 'Protocol "http:" not supported. Expected "https:"' — before
# any network attempt. A plain `python3 -m http.server` (http://) fixture, as the card's
# Technical Analysis originally sketched, would therefore never reach the 404 / retry code
# paths at all; it would only ever hit this protocol guard. A local HTTPS server (self-signed
# cert, trusted for this process only via NODE_EXTRA_CA_CERTS — never a global
# NODE_TLS_REJECT_UNAUTHORIZED=0) is required for both fixtures below.
# -------------------------------------------------------------------
if ! command -v openssl >/dev/null 2>&1; then
  log_fail "openssl not found — required to fixture a local HTTPS server for AC6/AC7"
  exit 1
fi

FIXTURE_DIR="$TMP_DIR/remote-source-tls"
rm -rf "$FIXTURE_DIR"
mkdir -p "$FIXTURE_DIR"

openssl req -x509 -newkey rsa:2048 -keyout "$FIXTURE_DIR/key.pem" -out "$FIXTURE_DIR/cert.pem" \
  -days 1 -nodes -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" >/dev/null 2>&1

cat >"$FIXTURE_DIR/404-server.js" <<'JS'
const https = require('https')
const fs = require('fs')
const path = require('path')

const port = process.argv[2]
const dir = path.dirname(process.argv[1])
const options = {
  key: fs.readFileSync(path.join(dir, 'key.pem')),
  cert: fs.readFileSync(path.join(dir, 'cert.pem')),
}

https
  .createServer(options, (_req, res) => {
    res.writeHead(404)
    res.end('not found')
  })
  .listen(Number(port), '127.0.0.1', () => console.log('listening'))
JS

# -------------------------------------------------------------------
# Test 5: HTTP 404 fails fast, no retry delay (AC6)
#
# HTTP 404 ("Resource not found (404): ...") does not match retryable-download.ts's
# RETRYABLE_PATTERNS, so isRetryableError returns false and the failure is immediate —
# asserted here as a low elapsed-time upper bound (never the retry lower bound Test 6 uses).
# -------------------------------------------------------------------
log_info "Test 5: HTTP 404 fails fast with no retry delay"
PORT_404=18443
node "$FIXTURE_DIR/404-server.js" "$PORT_404" >"$FIXTURE_DIR/server-404.log" 2>&1 &
SERVER_404_PID=$!
trap 'kill "$SERVER_404_PID" 2>/dev/null || true' EXIT
sleep 1

TEST_DIR=$(setup_workspace "remote-source-404")
cd "$TEST_DIR"
START_404=$(date +%s)
NODE_EXTRA_CA_CERTS="$FIXTURE_DIR/cert.pem" run_pair install --source "https://127.0.0.1:$PORT_404/missing.zip"
assert_failure || exit 1
END_404=$(date +%s)
ELAPSED_404=$((END_404 - START_404))

kill "$SERVER_404_PID" 2>/dev/null || true
wait "$SERVER_404_PID" 2>/dev/null || true
trap - EXIT

if [ "$ELAPSED_404" -le 3 ]; then
  log_succ "404 failed fast with no retry delay (${ELAPSED_404}s)"
else
  log_fail "404 took ${ELAPSED_404}s — expected a fast, non-retried failure"
  exit 1
fi

# -------------------------------------------------------------------
# Test 6: Connection refused retries the full budget, then fails (AC7)
#
# DEFAULT_DELAYS=[1000,2000,4000], DEFAULT_MAX_RETRIES=3 (retryable-download.ts) — total
# mandatory delay is 7s. A closed local port refuses the connection immediately at the OS
# level (ECONNREFUSED matches RETRYABLE_PATTERNS), so no TLS handshake ever happens — the
# same fixture cert is passed for consistency, though this path never reaches it. Asserts a
# LOWER BOUND only, never an upper bound (flakiness guard, per the story's Edge Cases).
# Per-attempt logging is NOT asserted — downloadWithRetry retries silently by design.
# -------------------------------------------------------------------
log_info "Test 6: Connection-refused retries the full budget, then fails"
CLOSED_PORT=19999
TEST_DIR=$(setup_workspace "remote-source-refused")
cd "$TEST_DIR"
START_REFUSED=$(date +%s)
NODE_EXTRA_CA_CERTS="$FIXTURE_DIR/cert.pem" run_pair install --source "https://127.0.0.1:$CLOSED_PORT/kb.zip"
assert_failure || exit 1
END_REFUSED=$(date +%s)
ELAPSED_REFUSED=$((END_REFUSED - START_REFUSED))

if [ "$ELAPSED_REFUSED" -ge 7 ]; then
  log_succ "Connection-refused exhausted the retry budget (${ELAPSED_REFUSED}s >= 7s)"
else
  log_fail "Connection-refused failed after only ${ELAPSED_REFUSED}s — expected >= 7s (retry budget)"
  exit 1
fi

rm -rf "$FIXTURE_DIR"

echo "=== $TEST_NAME Completed ==="
