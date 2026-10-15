#!/usr/bin/env bash
# #550 r0-1 witness: an altered line in the reinstalled CLAUDE.md must fail package-roundtrip.sh.
exec "$(dirname "$0")/package-roundtrip-mutation.sh" claude
