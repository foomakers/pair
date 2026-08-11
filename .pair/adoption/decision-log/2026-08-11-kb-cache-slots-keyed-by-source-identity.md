# Decision: a KB cache slot is keyed by SOURCE identity, never by CLI version alone

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

`~/.pair/kb/` is a **machine-wide** cache shared by every project on the machine. It was keyed by CLI version alone (`~/.pair/kb/<cliVersion>/`), which encodes the assumption "one KB per machine". `--source` contradicts that assumption by design.

Reproduced during the review of #391 (story #395): `pair install --source <acme-kb.zip>` extracted the external KB **into the official KB's slot**. The consuming project received the official KB's `guidelines/`, `how-to/` and `getting-started.md` mixed with the external KB's content, and `~/.pair/kb/<cliVersion>/manifest.json` was rewritten to `{"name":"acme-kb","version":"1.0.0"}` — so `kb-info` in **every other project on the machine** then reported the external KB as the installed one. The damage outlives the command that causes it, and nothing connects cause to effect.

The same shape existed for `--url <remote zip>`: it wrote into the official slot too, guarded only by a backup/restore dance (`<slot>.bak`) whose existence is the admission that the slot was being clobbered.

## Decision

**The cache slot is derived from the identity of the SOURCE. Two different sources can never share a slot, and the same source always resolves to the same slot.**

Layout:

```text
~/.pair/kb/<version>/                          official KB only
~/.pair/kb/external/<kind>-<label>-<hash12>/   one slot per external source
```

- Identity is modelled as `KBSource` in `apps/pair-cli/src/kb-manager/cache-manager.ts` — `official | remote | git | zip | directory`. `cacheSlotKey()` is the single place a slot name is derived; `getSourceCachePath()` the single place a slot path is.
- The official KB keeps the bare version slot, so existing caches stay valid and no user re-downloads for the fix itself.
- The **git** slot reuses the pre-existing `gitCacheKey()` (`git-<sha256(url#ref)>`), now under `external/`, rather than introducing a second hashing scheme.
- **The discriminator for a local source is its resolved path**, not its content: `zip-<basename>-<sha256(path)[0..12]>`. See the alternatives below for why not content.
- Slot names keep a human-readable label (`zip-acme-kb-1.0.0-8ae362dc47aa`) so a user inspecting `~/.pair/kb/external/` can tell what a slot is without a lookup table.
- **A local install replaces its slot wholesale** (`purgeSlot` then extract/copy). Extracting over an existing slot merges two KBs — that is the same class of defect one level down.
- **A polluted slot is detected, not trusted** (#395 AC5). `inspectSlot()` compares the slot's `manifest.json` `name` against the name the source is expected to carry (`knowledge-base` for the official KB). On mismatch, `ensureKBAvailable` warns, purges and re-fetches. `isKBCached()` reports a contaminated slot as not-cached, so the re-fetch happens even on a plain `pair install`.
- **A missing, unreadable or nameless manifest is inconclusive, not foreign** — the slot stays trusted. Slots predating the manifest contract are common; treating them as contaminated would delete user cache and force re-downloads for a signal that says nothing.

## Alternatives Considered

- **Extract external ZIPs to a temp dir, leave keying alone** (the story's fallback phrasing): rejected. It fixes the ZIP form and leaves `--url` and `--source <dir>` writing to the official slot; the defect is the keying, not the ZIP.
- **Hash the ZIP's CONTENT as the discriminator** (so the same archive at two paths shares a slot): rejected for now. The hash would be computed through `FileSystemService.readFileSync`, which is text-mode (`utf-8`) — hashing a lossily decoded binary is not an identity we want to defend in a security-adjacent path, and the alternative (a second, byte-mode read API) is a `content-ops` interface change out of scope here. Cost of the path-based key: the same archive copied to two directories occupies two slots. Bounded, visible, and harmless — it never merges two KBs, which is the property that matters.
- **Namespace by the manifest's declared `name@version`**: rejected. Two unrelated KBs can declare the same name and version, which is exactly the collision this decision exists to prevent; the story lists it as an edge case.
- **Keep the backup/restore dance as the protection**: rejected. It protects the official slot only for the duration of one command and only when the install fails; a successful external install still overwrote it. With identity keying the dance now protects **the source's own slot**, which is what it was always trying to express.

## Consequences

- `install --source <zip|dir>`, `--url` and git sources install into `~/.pair/kb/external/…`. The official slot is written only by the official KB.
- **A machine already contaminated self-heals** on the next install: the foreign slot is detected, purged and re-downloaded, with a warning naming both KBs. Users never need to know `~/.pair/kb` exists.
- **Disk**: one slot per distinct external source, plus one per distinct path of the same archive. Slots are plain directories with no hidden state — `rm -rf ~/.pair/kb/external` is always safe and the next install re-populates. **Automatic eviction is deliberately not implemented**: an LRU/TTL over a shared cache needs a policy and a concurrency story of its own, and the growth here is proportional to the number of KBs a user actually installs (single digits), not to installs over time (re-installing the same source reuses its slot).
- **Concurrency is unchanged and still not safe for the same source** — stated, not solved. Two projects installing the **same** source at the same moment can interleave `purgeSlot` + extract in one shared directory and one of them can read a half-written slot. Cross-source interference, which was the realistic case (project A installing an external KB while project B reads the official one), is gone by construction: they no longer share a directory. Making same-source installs atomic requires a lock file or extract-to-temp + atomic swap, which is a separate change with its own failure modes (stale locks, cross-device renames); deliberately deferred rather than half-done here.
- `apps/pair-cli/src/kb-manager/cache-manager.ts` functions that took a `version` string (`backupCachedKB`, `restoreCachedKB`, `removeBackupKB`) now take a `KBSource`. `getCachedKBPath(key)` survives unchanged as the key→path mapper.
- Local ZIP paths now resolve against the **injected** cwd (`fs.currentWorkingDirectory()`), like local directory paths already did, instead of `process.cwd()`. Two resolutions of the same relative path must not produce two slots.
- The `scaffold-kb` smoke scenario's pinned assertion for #395 (`assert_pinned_bug`) is flipped to a positive assertion: it pre-seeds an official slot in an isolated `HOME` and fails if a ZIP install rewrites it, or if the external KB does not land under `external/`. The isolated `HOME` stays, for a different reason than before — test hygiene, not a workaround.

## Adoption Impact

- No change to `.pair/adoption/tech/` architecture or stack records: this is an internal keying convention of the CLI's KB cache.
- Related: story #395 (this defect), #391 / #279 (where it was found and documented as a limitation), #396 / #397 (sibling defects on the same install path, kept separate).
