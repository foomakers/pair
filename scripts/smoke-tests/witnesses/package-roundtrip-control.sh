#!/usr/bin/env bash
# #550 r0-1 control: a clean round-trip passes (declared divergence only); an extra file in the zip fails.
D="$(dirname "$0")"
"$D/package-roundtrip-mutation.sh" none && "$D/package-roundtrip-mutation.sh" extra-file
