#!/usr/bin/env bash
set -euo pipefail

# scripts/workflows/release/determine-version.sh
# Determine version from various GitHub event sources
# Usage:
#   ./scripts/workflows/release/determine-version.sh [options]
#
# Options:
#   --input-version VERSION    Version from workflow_dispatch input
#   --release-tag TAG         Tag name from release event
#   --github-ref REF          GITHUB_REF environment variable
#   --output-file FILE        File to write version output (default: stdout)
#   --env-file FILE          File to write VERSION env var (default: stdout)
#
# Outputs:
#   - version=VERSION to GITHUB_OUTPUT format
#   - VERSION=VERSION to GITHUB_ENV format

INPUT_VERSION=""
RELEASE_TAG=""
GITHUB_REF=""
OUTPUT_FILE=""
ENV_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --input-version)
      INPUT_VERSION="$2"
      shift 2
      ;;
    --release-tag)
      RELEASE_TAG="$2"
      shift 2
      ;;
    --github-ref)
      GITHUB_REF="$2"
      shift 2
      ;;
    --output-file)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --input-version VERSION    Version from workflow_dispatch input"
      echo "  --release-tag TAG         Tag name from release event"
      echo "  --github-ref REF          GITHUB_REF environment variable"
      echo "  --output-file FILE        File to write version output (default: stdout)"
      echo "  --env-file FILE          File to write VERSION env var (default: stdout)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

# Determine version using same logic as workflow
if [ -n "$INPUT_VERSION" ]; then
  VERSION="$INPUT_VERSION"
elif [ -n "$RELEASE_TAG" ]; then
  VERSION="$RELEASE_TAG"
elif [[ $GITHUB_REF == refs/tags/* ]]; then
  VERSION="${GITHUB_REF#refs/tags/}"
else
  echo "Error: Could not determine version from provided inputs"
  echo "INPUT_VERSION: '$INPUT_VERSION'"
  echo "RELEASE_TAG: '$RELEASE_TAG'"
  echo "GITHUB_REF: '$GITHUB_REF'"
  exit 1
fi

echo "Determined version: $VERSION"

# Output in GITHUB_OUTPUT format
OUTPUT_LINE="version=$VERSION"
if [ -n "$OUTPUT_FILE" ]; then
  echo "$OUTPUT_LINE" >> "$OUTPUT_FILE"
else
  echo "$OUTPUT_LINE"
fi

# Output in GITHUB_ENV format
ENV_LINE="VERSION=$VERSION"
if [ -n "$ENV_FILE" ]; then
  echo "$ENV_LINE" >> "$ENV_FILE"
else
  echo "$ENV_LINE"
fi