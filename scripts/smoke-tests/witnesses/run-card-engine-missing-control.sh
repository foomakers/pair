#!/usr/bin/env bash
# #543 r0-1 control: 4b-5 with no pi dir on PATH passes.
exec "$(dirname "$0")/run-card-engine-missing.sh" none
