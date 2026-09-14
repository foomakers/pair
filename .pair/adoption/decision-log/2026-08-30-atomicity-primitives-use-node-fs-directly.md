# Decision: the two atomicity primitives (exclusive create, append) use `node:fs` directly, in leaf modules tested against a real temporary directory

## Date

2026-08-30

## Status

Active

## Category

Convention Adoption

## Context

Story #217's dispatch needs two filesystem operations whose whole value is **atomicity**:

- an **exclusive create** — the per-card lock that guarantees a trigger burst never starts two runs on one card;
- an **append** — the audit trail, whose lines must survive two dispatches writing the same file concurrently.

The project's convention is dependency injection through `FileSystemService`, with an `InMemoryFileSystemService` double instead of mocks. That service exposes neither primitive: `mkdirSync` is modelled in the double as "add the path to a set" (it cannot fail a second create at all), and the only write is `writeFile`, a full overwrite — so an append would have to be read-concat-write, which reintroduces exactly the lost update `O_APPEND` exists to prevent.

Widening `FileSystemService` was the obvious alternative, and it is the one worth stating why we did not take.

## Decision

`card-lock.ts` and `dispatch-audit.ts` call `node:fs` **directly** (`mkdirSync` without `recursive`, `appendFileSync`), and are:

- **leaf modules** — nothing else in the dispatch path touches the filesystem, so the untestable surface is two small files rather than a layer;
- **injected at the call site** — the handler takes a `LockAcquirer` and an `AuditAppender`, so every other test in the run pipeline stays hermetic and none of them touches a real working area;
- **tested against a real temporary directory** (`mkdtempSync`), because the properties under test — a second create fails, two appends both survive — are properties of the real filesystem and of nothing else. There is precedent in this repo: `path-containment.test.ts` tests symlink containment the same way, for the same reason.

The rule generalises: **when the behaviour under test IS an atomicity or containment guarantee of the operating system, test it against the operating system.** A double that cannot fail the way production fails proves nothing, and asserting against it is worse than not asserting — it reads like coverage.

## Alternatives Considered

- **Add `mkdirExclusive`/`appendFile` to `FileSystemService`**: correct in principle, but it widens a package shared by every other story in flight for two callers, and the in-memory double would still have to *simulate* the failure mode — so the double's fidelity, not the filesystem's behaviour, is what the tests would end up asserting. Reconsider when a third caller appears.
- **Read-concat-write the audit through `writeFile`**: loses records when two dispatches on different cards write the same audit file; the per-card lock does not protect a shared file.
- **Lock with `existsSync` + `mkdirSync`**: a check-then-act window, which is the exact race the lock exists to close.

## Consequences

- Two modules in `apps/pair-cli/src/commands/run/` bypass `FileSystemService`, each carrying a comment saying why and pointing here.
- Their tests are slower than the rest of the suite (real I/O in `os.tmpdir()`), and clean up after themselves.
- Handler-level tests inject fakes for both, so the dispatch pipeline remains testable in memory.
- A future third caller for either primitive is the trigger to revisit and put it on `FileSystemService` properly.

## Adoption Impact

- `adoption/tech/way-of-working.md` — Quality Gates section: records the exception to the "avoid mocks, use the in-memory double" convention for OS atomicity/containment guarantees.
