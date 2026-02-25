#!/bin/bash
set -euo pipefail

# Script: deploy-website.sh
# Purpose: Deploy apps/website to Vercel via CLI
# Parameters:
#   --prod: Deploy to production (default: preview)
#   --dry-run: Show what would be done without deploying
# Environment:
#   VERCEL_TOKEN: Vercel access token (required unless --dry-run)
#   VERCEL_ORG_ID: Vercel org/team ID (required unless --dry-run)
#   VERCEL_PROJECT_ID: Vercel project ID (required unless --dry-run)
# Outputs:
#   Deploy URL (stdout last line)

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

# Validate environment
if [ "$DRY_RUN" = false ]; then
  if [ -z "${VERCEL_TOKEN:-}" ]; then
    echo "Error: VERCEL_TOKEN is required"
    echo "Set it via: export VERCEL_TOKEN=<your-token>"
    exit 1
  fi
  if [ -z "${VERCEL_ORG_ID:-}" ]; then
    echo "Error: VERCEL_ORG_ID is required"
    exit 1
  fi
  if [ -z "${VERCEL_PROJECT_ID:-}" ]; then
    echo "Error: VERCEL_PROJECT_ID is required"
    exit 1
  fi
fi

# Validate website build exists or can be built
if [ ! -d "apps/website" ]; then
  echo "Error: apps/website directory not found. Run from repo root."
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would deploy apps/website to Vercel"
  echo "[DRY RUN] VERCEL_ORG_ID: ${VERCEL_ORG_ID:-<not set>}"
  echo "[DRY RUN] VERCEL_PROJECT_ID: ${VERCEL_PROJECT_ID:-<not set>}"
  echo "[DRY RUN] VERCEL_TOKEN: ${VERCEL_TOKEN:+<set>}${VERCEL_TOKEN:-<not set>}"
  if [ "$PROD" = true ]; then
    echo "[DRY RUN] Command: npx vercel deploy --prod --token=***"
    echo "[DRY RUN] Production URL: https://pair-website.vercel.app (placeholder)"
  else
    echo "[DRY RUN] Command: npx vercel deploy --token=***"
    echo "[DRY RUN] Preview URL: https://pair-website-<hash>.vercel.app (placeholder)"
  fi
  exit 0
fi

# Build vercel CLI args
# --archive=tgz: required for monorepos with >15000 files
VERCEL_ARGS="deploy --archive=tgz --token=${VERCEL_TOKEN}"
if [ "$PROD" = true ]; then
  VERCEL_ARGS="${VERCEL_ARGS} --prod"
fi

echo "Deploying to Vercel..."
DEPLOY_URL=$(npx vercel ${VERCEL_ARGS} 2>&1 | tail -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "Error: Deploy failed — no URL returned"
  exit 1
fi

echo "Deploy successful!"
echo "URL: $DEPLOY_URL"
