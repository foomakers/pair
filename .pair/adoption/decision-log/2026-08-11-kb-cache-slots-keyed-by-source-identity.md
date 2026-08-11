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
- **A polluted slot is detected, not trusted** (#395 AC5). `inspectSlot()` compares the slot's `manifest.json` `name` against the name the source is expected to carry (`knowledge-base` for the official KB). On mismatch, `ensureKBAvailable` warns, replaces and re-fetches. `isKBCached()` reports a contaminated slot as not-cached, so the re-fetch happens even on a plain `pair install`.
- **Only `name` is compared, never `version`** — deliberate, and the AC's "name/version vs. the expected source" is satisfied by construction: the official slot is *keyed* by the version, so a version mismatch inside `~/.pair/kb/0.4.3/` can only come from a hand-edited cache, while the cross-KB case the story exists to close is exactly a `name` mismatch. Comparing `version` would add a re-download path with no defect behind it (a slot legitimately written by `0.4.3` and read by `0.4.3`).
- **An unreadable or nameless manifest is inconclusive, not foreign** — the slot stays trusted. Slots predating the manifest contract are common; treating them as contaminated would delete user cache and force re-downloads for a signal that says nothing.
- **No manifest at all, where one is expected, is a half-written slot** — reported `empty`, so it is re-fetched rather than served (an aborted extraction used to read as a cache hit and yield an empty KB path). `empty` deletes nothing, so the argument above is untouched: the slot is set aside, and restored if the re-fetch fails.
- **A slot is never deleted before its replacement is in hand.** `ensureKBAvailable` backs the slot up (`<slot>.bak`), installs, then drops the backup — and restores it when the install throws. This covers the contaminated official slot as much as a custom source: a failing re-fetch (offline, 5xx, proxy) must leave the user with the cache they had, not with none.
- **One classifier per question.** ZIP-vs-directory is decided only in `localKBSource()` (case-insensitively) and every caller dispatches on the resulting `kind`; the slot key is derived only in `cacheSlotKey()`; version normalization (`v0.2.0` → `0.2.0`) happens only there too, so `getCachedKBPath(key)` maps a key verbatim and rejects an empty one instead of resolving to the cache root. Two classifiers meant `--source /downloads/KB.ZIP` took a ZIP slot and the directory installer.
- **Pure derivation is separated from filesystem lifecycle**: `kb-manager/cache-slot-key.ts` (identity → key → path, no fs) vs `kb-manager/cache-manager.ts` (inspect, purge, backup/restore). The public surface is re-exported from `kb-manager/index.ts`; nothing outside `kb-manager/` imports its internal modules.
- **The cache root honours `PAIR_KB_CACHE_DIR`** (documented in the configuration reference, previously read by no code), defaulting to `~/.pair/kb`.

## Alternatives Considered

- **Extract external ZIPs to a temp dir, leave keying alone** (the story's fallback phrasing): rejected. It fixes the ZIP form and leaves `--url` and `--source <dir>` writing to the official slot; the defect is the keying, not the ZIP.
- **Hash the ZIP's CONTENT as the discriminator** (so the same archive at two paths shares a slot): rejected for now. The hash would be computed through `FileSystemService.readFileSync`, which is text-mode (`utf-8`) — hashing a lossily decoded binary is not an identity we want to defend in a security-adjacent path, and the alternative (a second, byte-mode read API) is a `content-ops` interface change out of scope here. Cost of the path-based key: the same archive copied to two directories occupies two slots. Bounded, visible, and harmless — it never merges two KBs, which is the property that matters.
- **Namespace by the manifest's declared `name@version`**: rejected. Two unrelated KBs can declare the same name and version, which is exactly the collision this decision exists to prevent; the story lists it as an edge case.
- **Keep the backup/restore dance as the protection**: rejected. It protects the official slot only for the duration of one command and only when the install fails; a successful external install still overwrote it. With identity keying the dance now protects **the source's own slot**, which is what it was always trying to express.

## Consequences

- `install --source <zip|dir>`, `--url` and git sources install into `~/.pair/kb/external/…`. The official slot is written only by the official KB.
- **A machine already contaminated self-heals** on the next install *of the same CLI version*: the foreign slot is detected, replaced and re-downloaded, with a warning naming both KBs. **Scope, stated honestly**: the official slot is keyed by CLI version, and this fix ships in a new version — a slot polluted by an older CLI lives under that older version's directory, which the fixed CLI never reads again. It is abandoned, not discarded; AC5's outcome (never serve foreign content) holds either way. The docs point users at `~/.pair/kb/<old-version>/` for the leftovers.
- **Disk**: one slot per distinct external source, plus one per distinct path of the same archive. Slots are plain directories with no hidden state — `rm -rf ~/.pair/kb/external` is always safe and the next install re-populates. That command does **not** cover three leftovers, all safe to delete by hand and named in the source-resolution spec: `~/.pair/kb/<old-cli-version>/`, `~/.pair/kb/git-<hash>/` (git clones from before the `external/` namespace) and `~/.pair/kb/<version>.bak` (interrupted installs — a stale one is now cleared automatically on the next backup). **Automatic eviction is deliberately not implemented**: an LRU/TTL over a shared cache needs a policy and a concurrency story of its own, and the growth here is proportional to the number of KBs a user actually installs (single digits), not to installs over time (re-installing the same source reuses its slot). Tracked as [#427](https://github.com/foomakers/pair/issues/427).
- **Concurrency is unchanged and still not safe for the same source** — stated, not solved. Two projects installing the **same** source at the same moment can interleave `purgeSlot` + extract in one shared directory and one of them can read a half-written slot. Cross-source interference, which was the realistic case (project A installing an external KB while project B reads the official one), is gone by construction: they no longer share a directory. Making same-source installs atomic requires a lock file or extract-to-temp + atomic swap, which is a separate change with its own failure modes (stale locks, cross-device renames); deliberately deferred rather than half-done here. Tracked as [#428](https://github.com/foomakers/pair/issues/428).
- **The path-not-content discriminator for local sources** (same archive at two paths ⇒ two slots) is tracked as [#429](https://github.com/foomakers/pair/issues/429).
- `apps/pair-cli/src/kb-manager/cache-manager.ts` functions that took a `version` string (`backupCachedKB`, `restoreCachedKB`, `removeBackupKB`) now take a `KBSource`. `getCachedKBPath(key)` survives as the key→path mapper — but takes a KEY verbatim now (no version normalization) and throws on an empty one.
- Local ZIP paths now resolve against the **injected** cwd (`fs.currentWorkingDirectory()`), like local directory paths already did, instead of `process.cwd()`. Two resolutions of the same relative path must not produce two slots.
- The `scaffold-kb` smoke scenario's pinned assertion for #395 (`assert_pinned_bug`) is flipped to a positive assertion: it pre-seeds an official slot in an isolated `HOME` and fails if a ZIP install rewrites it, or if the external KB does not land under `external/`. The isolated `HOME` stays, for a different reason than before — test hygiene, not a workaround.

- Local paths are classified absolute under **either** convention (`posix.isAbsolute || win32.isAbsolute`), so a Windows path (`C:\kb\acme.zip`) is no longer joined onto the cwd into a bogus slot.
- `OFFICIAL_KB_NAME` must byte-match the `--name` the release script passes (`scripts/workflows/release/package-kb-dataset.sh`), or every official slot reads as contaminated. A conformance test (`packages/knowledge-hub/src/conformance/official-kb-name.test.ts`) now ties the two artifacts together.

## Adoption Impact

- `.pair/adoption/tech/architecture.md` and the context map's glossary (`tech/boundedcontext/integration-process-standardization.md`) both describe the cache as source-keyed; no other adoption record changes. This is an internal keying convention of the CLI's KB cache.
- Related: story #395 (this defect), #391 / #279 (where it was found and documented as a limitation), #396 / #397 (sibling defects on the same install path, kept separate).
