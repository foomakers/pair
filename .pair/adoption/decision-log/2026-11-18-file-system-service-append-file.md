# Decision: `FileSystemService.appendFile` added; atomicity leaves stay on `node:fs`

## Date

2026-11-18

## Status

Active

## Category

Convention Adoption

## Context

Revisit of [2026-08-30-atomicity-primitives-use-node-fs-directly](2026-08-30-atomicity-primitives-use-node-fs-directly.md): its trigger ("reconsider when a third caller appears") fired. Append callers: `dispatch-audit.ts` (concurrent append, OS property), `telemetry.ts` (best-effort JSONL, `in-flight-churn`), and `determine-version.ts` (appends to `GITHUB_OUTPUT`/`GITHUB_ENV`; a `writeFile` overwrite would drop other steps' lines).

## Decision

- Add `appendFile` to `FileSystemService` (real: `fs.appendFile`; double: concatenates). Only `determine-version.ts` migrates.
- `dispatch-audit.ts` and `card-lock.ts` stay real-fs leaves: concurrent append and exclusive create are OS guarantees the double cannot prove.
- `telemetry*.ts` stay `in-flight-churn` exceptions (edited by in-flight cards).
- Direct-fs use is enforced by an exact-path registry (`docs/engineering/direct-fs-inventory.json`) checked by `pnpm direct-fs:check`.

## Alternatives Considered

- Keep the service closed: `determine-version.ts` would become an exact exception.
- Add `mkdirExclusive`: rejected, no migrated consumer (service extensions only for a migrated consumer).
