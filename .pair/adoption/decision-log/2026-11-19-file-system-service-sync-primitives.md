# Decision: `FileSystemService` grows the sync primitives migrated code needs; direct `node:fs` stays a rare, jointly decided exception

## Date

2026-11-19

## Status

Active

## Category

Convention Adoption

## Context

Refines [2026-11-18-file-system-service-append-file](2026-11-18-file-system-service-append-file.md), whose clause "service extensions only for a migrated consumer (`appendFile` only)" would have kept ordinary sync code (`readdirSync`, `writeFileSync`, `rmSync`, ...) on `node:fs` and the 78 `deferred-migration` rows of #621 un-migrated. The project convention is the opposite: use `FileSystemService`, extend it when an operation is missing, and keep direct `fs` for rare cases decided together (OS guarantees: exclusive create, concurrent append, symlink containment).

## Decision

- Extend `FileSystemService` with the sync primitives migrated consumers need: `writeFileSync`, `readFileBytesSync`, `readdirSync`, `statSync`, `rmSync`, `chmodSync`, `cpSync`, `symlinkSync`, `mkdtempSync`.
- `InMemoryFileSystemService` implements each; `file-system-sync-parity.test.ts` runs the same scenarios against the real service and the double and requires equal observations.
- A missing operation is a reason to extend the service, never to import `fs`. Direct `fs` remains only as an exact-path registry entry with a real reason (`os-guarantee`, `standalone-script`, `in-flight-churn`, ...) decided with the maintainer.

## Alternatives Considered

- Keep the service closed (`appendFile` only): leaves ordinary IO coupled to disk and forces effort-based deferral, which the story forbids.
- Make every consumer async to fit the old surface: rewrites public sync APIs (docs staleness check, Next routes) for no behavioral gain.
