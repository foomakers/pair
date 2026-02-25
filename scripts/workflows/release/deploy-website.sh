#!/bin/bash
set -euo pipefail

# Script: deploy-website.sh
# Purpose: Deploy apps/website to Vercel via CLI
# Parameters:
#   --prod: Deploy to production (default: preview)
#   --dry-run: Show what would be done without deploying
# Environment:
#   VERCEL_TOKEN: Vercel access token (required in CI; optional locally if authenticated via `vercel login`)
#   VERCEL_ORG_ID: Vercel org/team ID (required in CI; read from .vercel/project.json locally)
#   VERCEL_PROJECT_ID: Vercel project ID (required in CI; read from .vercel/project.json locally)
# Outputs:
#   Deploy URL printed as "URL: <url>"

DRY_RUN=false
PROD=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --prod)
      PROD=true
      shift
      ;;
    -*)
      echo "Unknown option: $1"
      echo "Usage: $0 [--prod] [--dry-run]"
      exit 1
      ;;
    *)
      echo "Unexpected argument: $1"
      echo "Usage: $0 [--prod] [--dry-run]"
      exit 1
      ;;
  esac
done

echo "=== Website Deploy ==="
echo "Mode: $([ "$PROD" = true ] && echo 'production' || echo 'preview')"
echo "Dry run: $DRY_RUN"

# Validate website directory exists
if [ ! -d "apps/website" ]; then
  echo "Error: apps/website directory not found. Run from repo root."
  exit 1
fi

# Determine auth mode: token (CI) or session (local)
AUTH_MODE="session"
if [ -n "${VERCEL_TOKEN:-}" ]; then
  AUTH_MODE="token"
fi

# In session mode, try to read project config from .vercel/project.json
if [ "$AUTH_MODE" = "session" ] && [ "$DRY_RUN" = false ]; then
  if [ -f ".vercel/project.json" ]; then
    # Export org/project IDs from local config if not already set
    if [ -z "${VERCEL_ORG_ID:-}" ]; then
      VERCEL_ORG_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.vercel/project.json','utf8')).orgId)")
      export VERCEL_ORG_ID
    fi
    if [ -z "${VERCEL_PROJECT_ID:-}" ]; then
      VERCEL_PROJECT_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.vercel/project.json','utf8')).projectId)")
      export VERCEL_PROJECT_ID
    fi
    echo "Auth: session (local .vercel/project.json)"
  else
    echo "Error: No VERCEL_TOKEN and no .vercel/project.json found."
    echo "Run 'vercel login && vercel link' or set VERCEL_TOKEN env var."
    exit 1
  fi
elif [ "$AUTH_MODE" = "token" ]; then
  # Token mode: validate required env vars
  if [ -z "${VERCEL_ORG_ID:-}" ]; then
    echo "Error: VERCEL_ORG_ID is required in token mode"
    exit 1
  fi
  if [ -z "${VERCEL_PROJECT_ID:-}" ]; then
    echo "Error: VERCEL_PROJECT_ID is required in token mode"
    exit 1
  fi
  echo "Auth: token"
fi

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would deploy apps/website to Vercel"
  echo "[DRY RUN] Auth mode: $AUTH_MODE"
  echo "[DRY RUN] VERCEL_ORG_ID: ${VERCEL_ORG_ID:-<not set>}"
  echo "[DRY RUN] VERCEL_PROJECT_ID: ${VERCEL_PROJECT_ID:-<not set>}"
  echo "[DRY RUN] VERCEL_TOKEN: ${VERCEL_TOKEN:+<set>}${VERCEL_TOKEN:-<not set>}"
  if [ "$PROD" = true ]; then
    echo "[DRY RUN] Command: vercel deploy --prod --archive=tgz"
    echo "[DRY RUN] Production URL: https://pair-website.vercel.app (placeholder)"
  else
    echo "[DRY RUN] Command: vercel deploy --archive=tgz"
    echo "[DRY RUN] Preview URL: https://pair-website-<hash>.vercel.app (placeholder)"
  fi
  exit 0
fi

# Resolve vercel CLI: prefer global install, fallback to npx
if command -v vercel >/dev/null 2>&1; then
  VERCEL_CMD="vercel"
else
  VERCEL_CMD="npx vercel"
fi

# Build CLI args
# --archive=tgz: required for monorepos with >15000 files
VERCEL_ARGS="deploy --archive=tgz"
if [ "$AUTH_MODE" = "token" ]; then
  VERCEL_ARGS="${VERCEL_ARGS} --token=${VERCEL_TOKEN}"
fi
if [ "$PROD" = true ]; then
  VERCEL_ARGS="${VERCEL_ARGS} --prod"
fi

echo "Deploying to Vercel ($VERCEL_CMD)..."
DEPLOY_OUTPUT=$($VERCEL_CMD ${VERCEL_ARGS} 2>&1)
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[^ ]+\.vercel\.app' | tail -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "Error: Deploy failed — no URL returned"
  echo "Output:"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo "Deploy successful!"
echo "URL: $DEPLOY_URL"
