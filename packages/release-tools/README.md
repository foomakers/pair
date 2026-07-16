# @pair/release-tools

Pair's release-pipeline decision logic, as a tested TypeScript module — same reference pattern as [`@pair/dev-tools`](../dev-tools/README.md), per [ADL 2026-07-13-gate-tooling-code-in-tested-modules](../../.pair/adoption/decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md) (extended here from dev/quality gates to release tooling).

## Tools

| Script              | Module                       | Purpose                                                                                 |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `determine-version` | `src/determine-version.ts`   | Resolves the release version from `--input-version` > `--release-tag` > `--github-ref` tag pattern, writes GITHUB_OUTPUT/GITHUB_ENV |

Ported from `scripts/workflows/release/determine-version.sh` (deleted — see #148), preserving exact precedence, tag-pattern extraction, and output format.

Invoke via the package script, which `.github/workflows/release.yml`'s "Determine version" step calls directly:

```bash
pnpm --filter @pair/release-tools determine-version -- \
  --input-version "$INPUT" \
  --release-tag "$TAG" \
  --github-ref "$GITHUB_REF" \
  --output-file "$GITHUB_OUTPUT" \
  --env-file "$GITHUB_ENV"
```

## Conventions

Every module here follows the shape: logic as exported, unit-tested pure functions; a thin `main()` CLI wrapper behind a `require.main === module` guard. Tests are white-box (import the module directly) and never spawn the script as a subprocess — see the ADL linked above.
