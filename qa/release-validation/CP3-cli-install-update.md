# CP3 — CLI Install & Update

**Priority**: P0
**Scope**: `pair-cli install` (auto-download KB, explicit source), `pair-cli update`, idempotency, isolation
**Preconditions**: Working CLI binary (from CP2). `$WORKDIR` created outside the repo. `$CLI` = path to working pair-cli binary.

**CRITICAL**: All install/update tests MUST use `$WORKDIR` subdirectories as working directory, NEVER the repo itself.

---

## MT-CP301: Install with auto-download KB (default)

**Priority**: P0
**Preconditions**: `$CLI` is functional (CP2 passed), internet available
**Category**: CLI Functional

### Steps

1. `rm -rf ~/.pair/kb/` (clear KB cache to ensure clean state)
2. `mkdir -p $WORKDIR/project-auto && cd $WORKDIR/project-auto`
3. `$CLI install`

### Expected Result

- Exit code 0
- CLI downloads KB from GitHub release (output mentions download or similar)
- `.pair/knowledge/` directory created and non-empty
- `AGENTS.md` created at project root
- `.pair/adoption/` directory created
- KB cached at `~/.pair/kb/$VERSION/`

### Notes

- This tests the automatic KB download from GitHub release — the most common first-time user flow
- Cache MUST be cleared first — stale/incomplete cache data can cause false failures
- Network required; if offline, test skips with BLOCKED

---

## MT-CP301b: Install with cached KB (cache hit)

**Priority**: P0
**Preconditions**: MT-CP301 passes (KB cached at `~/.pair/kb/$VERSION/`)
**Category**: CLI Functional

### Steps

1. Verify `~/.pair/kb/$VERSION/` exists (cached by MT-CP301)
2. `mkdir -p $WORKDIR/project-cached && cd $WORKDIR/project-cached`
3. `$CLI install`

### Expected Result

- Exit code 0
- CLI uses cached KB (output does NOT mention download)
- `.pair/knowledge/` directory created and non-empty
- `AGENTS.md` created at project root
- `.pair/adoption/` directory created

### Notes

- This tests the cache-hit path: KB already downloaded by MT-CP301, CLI should reuse it without network
- Complements MT-CP301 (cache miss) to cover both download paths

---

## MT-CP302: Installed KB structure completeness

**Priority**: P0
**Preconditions**: MT-CP301 passes
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. Check directory structure

### Expected Result

- `.pair/knowledge/guidelines/` exists and contains subdirectories
- `.pair/knowledge/how-to/` exists
- `.pair/adoption/tech/` exists
- `.pair/adoption/product/` exists
- `AGENTS.md` exists and is non-empty
- `CLAUDE.md` exists (transform with claude prefix)
- `.github/` directory exists
- `.claude/skills/`, `.claude/workflows/` (incl. `pair-loop.js`) and `.claude/agents/` exist
- `.claude/skills/` canonical; `.github/skills/`, `.cursor/skills/`, `.agent/skills/`, `.agents/skills/` are symlinks to it

---

## MT-CP303: Install with explicit local directory source

**Priority**: P0
**Preconditions**: Knowledge-hub dataset available at known path (e.g. extracted from KB ZIP)
**Category**: CLI Functional

### Steps

1. Extract KB dataset to `$WORKDIR/kb-source/` (from KB ZIP artifact or local copy)
2. `mkdir -p $WORKDIR/project-local && cd $WORKDIR/project-local`
3. `$CLI install --source $WORKDIR/kb-source`

### Expected Result

- Exit code 0
- No network calls made (output does NOT mention download)
- Same file structure as MT-CP302

### Notes

- Source path is `$WORKDIR/kb-source` — disjoint from both repo and target `$WORKDIR/project-local`
- This validates the `--source` flag with a local directory

---

## MT-CP304: Install with explicit local ZIP source

**Priority**: P0
**Preconditions**: KB ZIP artifact at `$WORKDIR/knowledge-base-$VERSION.zip`
**Category**: CLI Functional

### Steps

1. `mkdir -p $WORKDIR/project-zip && cd $WORKDIR/project-zip`
2. `$CLI install --source $WORKDIR/knowledge-base-$VERSION.zip`

### Expected Result

- Exit code 0
- Same file structure as MT-CP302

### Notes

- Tests ZIP source resolution (vs directory in MT-CP303)

---

## MT-CP305: Install with --offline flag

**Priority**: P1
**Preconditions**: Local source available
**Category**: CLI Functional

### Steps

1. `mkdir -p $WORKDIR/project-offline && cd $WORKDIR/project-offline`
2. `$CLI install --offline --source $WORKDIR/kb-source`

### Expected Result

- Exit code 0
- No network calls attempted
- Same file structure as MT-CP302

---

## MT-CP306: Install rejects on already-installed project

**Priority**: P0
**Preconditions**: MT-CP301 completed (project-auto has KB installed)
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI install --source $WORKDIR/kb-source`

### Expected Result

- Non-zero exit code
- Error message suggests using `pair-cli update` instead
- No files overwritten or modified

---

## MT-CP307: Install --list-targets

**Priority**: P1
**Preconditions**: `$CLI` is functional
**Category**: CLI Functional

### Steps

1. `$CLI install --list-targets`

### Expected Result

- Exit code 0
- Lists the 7 registries from config.json: github, knowledge, adoption, agents, skills, workflows, agent-definitions

---

## MT-CP308: Update after install

**Priority**: P0
**Preconditions**: MT-CP301 completed
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI update --source $WORKDIR/kb-source`

### Expected Result

- Exit code 0
- Backup created (output mentions backup)
- Files updated

### Step: dropped files are removed (#421)

1. Remove one file from `$WORKDIR/kb-source/.pair/knowledge/` and add a marker line to an installed `.pair/adoption/tech/*.md`
2. `$CLI update --source $WORKDIR/kb-source` again
3. Expected: the removed file is gone from `project-auto/.pair/knowledge/` (mirror registry); the `.pair/adoption` edit survives (add registry)
4. Offline equivalent: `scripts/smoke-tests/scenarios/update-removes-files.sh`

---

## MT-CP309: Update --persist-backup

**Priority**: P1
**Preconditions**: MT-CP301 completed
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI update --source $WORKDIR/kb-source --persist-backup`

### Expected Result

- Exit code 0
- `.pair/backups/` remains after update with at least one entry (without the flag it is emptied)
- Offline equivalent: `scripts/smoke-tests/scenarios/update-minor-fixes.sh`

---

## MT-CP310: validate-config on default config

**Priority**: P1
**Preconditions**: `$CLI` is functional
**Category**: CLI Functional

### Steps

1. `$CLI validate-config`

### Expected Result

- Exit code 0
- Config valid message

---

## MT-CP311: kb-validate after install

**Priority**: P1
**Preconditions**: MT-CP301 completed
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI kb-validate`

### Expected Result

- Exit code 0
- KB structure valid

---

## MT-CP312: update-link after install

**Priority**: P1
**Preconditions**: MT-CP301 completed
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI update-link --dry-run`

### Expected Result

- Exit code 0
- Output lists the planned changes, or `No changes` when nothing would change
- No files modified (dry-run)
- Offline equivalent: `scripts/smoke-tests/scenarios/update-minor-fixes.sh`

---

## MT-CP313: Branding output

**Priority**: P1
**Preconditions**: `$CLI` is functional
**Category**: CLI Functional

### Steps

1. `$CLI install --help`

### Expected Result

- Output contains pair logo/banner
- Shows `$VERSION` in banner or help text

---

## MT-CP314: Unknown command

**Priority**: P2
**Preconditions**: `$CLI` is functional
**Category**: CLI Functional

### Steps

1. `$CLI nonexistent-command`

### Expected Result

- Non-zero exit code
- Error message suggests `--help`

---

## MT-CP315: Default install auto-downloads KB (BUG 1+3)

**Priority**: P0
**Preconditions**: `$CLI` functional, internet available, `~/.pair/kb/` cache cleared
**Category**: CLI Functional

### Steps

1. `rm -rf ~/.pair/kb/` (clear KB cache)
2. Verify `~/.pair/kb/$VERSION/` does NOT exist
3. `mkdir -p $WORKDIR/project-download && cd $WORKDIR/project-download`
4. `$CLI install`

### Expected Result

- Exit code 0
- CLI downloads KB from GitHub release (output mentions download)
- `.pair/knowledge/` directory created and non-empty
- KB cached at `~/.pair/kb/$VERSION/` for subsequent runs

### Notes

- This validates the download path works end-to-end in the release package
- Without BUG 1+3 fixes, this will fail: BUG 1 prevents download fallback, BUG 3 breaks ZIP extraction

---

## MT-CP316: Downloaded KB ZIP extracts in bundled CLI (BUG 3)

**Priority**: P0
**Preconditions**: `$CLI` functional, internet available
**Category**: CLI Functional

### Steps

1. `rm -rf ~/.pair/kb/` (clear KB cache)
2. Download KB ZIP: `curl -L -o $WORKDIR/kb.zip https://github.com/foomakers/pair/releases/download/v$VERSION/knowledge-base-$VERSION.zip`
3. Verify ZIP integrity: `unzip -t $WORKDIR/kb.zip` (expect "No errors detected")
4. `mkdir -p $WORKDIR/project-zip-bundled && cd $WORKDIR/project-zip-bundled`
5. `$CLI install --source $WORKDIR/kb.zip`

### Expected Result

- Exit code 0
- No ADM-ZIP errors in output
- `.pair/knowledge/` directory created and non-empty

### Notes

- Tests that the bundled adm-zip in the release package can extract valid ZIPs
- Without BUG 3 fix: "ADM-ZIP: Number of disk entries is too large"

---

## MT-CP317: Second install fails (BUG 4)

**Priority**: P0
**Preconditions**: MT-CP301 completed (project-auto has KB installed)
**Category**: CLI Functional

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI install --source $WORKDIR/kb-source`

### Expected Result

- Non-zero exit code
- Error message suggests using `pair-cli update`
- No files overwritten

### Notes

- Symmetric with MT-CP318. `install` precondition: targets must NOT exist.

---

## MT-CP318: Update on fresh project fails (BUG 4)

**Priority**: P0
**Preconditions**: `$CLI` functional, KB source available
**Category**: CLI Functional

### Steps

1. `mkdir -p $WORKDIR/project-fresh-update && cd $WORKDIR/project-fresh-update`
2. `$CLI update --source $WORKDIR/kb-source`

### Expected Result

- Non-zero exit code
- Error message suggests using `pair-cli install` first
- No files created

### Notes

- Symmetric with MT-CP317. `update` precondition: targets must exist.

---

## MT-CP319: Install from Git repository source

**Priority**: P1
**Preconditions**: `$CLI` functional, internet available, `git` installed
**Category**: CLI Functional

### Steps

1. Use the CLI's default `config.json` (no remap): the repo root's `.claude/skills` is an installed, flattened catalog that also holds third-party skills (e.g. `agent-browser`), so remapping `skills.source` to it fails with an ambiguous-flatten error; the repo has no root `.workflows`
2. `rm -rf ~/.pair/kb/external/git-*` (clear git KB cache entries)
3. `mkdir -p $WORKDIR/project-git && cd $WORKDIR/project-git`
4. `$CLI install --source https://github.com/foomakers/pair.git#main`
5. Verify cache uses hash-based path: `ls ~/.pair/kb/external/ | grep '^git-'` (`~/.pair/kb/external/git-<hash>/`)
6. Verify `.git` removed from cache: `ls ~/.pair/kb/external/git-*/.git` (should fail)

### Expected Result

- Exit code 0
- Registries present at the repo root (`github`, `knowledge`, `adoption`, `agents`, `agent-definitions`) install; `skills` and `workflows` report `skipped — not shipped by this source` — skipped registries are OK, not a failure
- Cache directory is `~/.pair/kb/external/git-<hash>/` (not version-based)
- No `.git` directory inside cache

### Notes

- The repo root is not a KB source layout: the distributable KB lives in `packages/knowledge-hub/dataset` (`.skills`, `.workflows`). This case validates git fetch + cache + install of what the root ships, not a full 7-registry install (that is MT-CP302)
- Git cache key is a SHA-256 hash of the full URL (including `#ref`), independent of CLI version
- Different URLs/refs produce different cache entries (no collisions)

---

## MT-CP320: npx @foomakers/pair-cli install from the channel registry (no prior config)

**Priority**: P0
**Preconditions**: `$CHANNEL=final`: package on npmjs.org, no `.npmrc` for `@foomakers` scope. `$CHANNEL=pre|rc`: package on GitHub Packages; `$REGISTRY_TOKEN` (`read:packages`) available — never written to the report; no token ⇒ BLOCKED, not FAIL
**Category**: CLI Functional

### Steps

1. `mkdir -p $WORKDIR/project-npx && cd $WORKDIR/project-npx`
2. Verify no `.npmrc` exists in `$WORKDIR/project-npx/` or parent dirs that configures `@foomakers` scope
3. `$CHANNEL=final`: `npx @foomakers/pair-cli install`
   `$CHANNEL=pre|rc`: `npm config set @foomakers:registry https://npm.pkg.github.com --location=project`, put the `read:packages` token in a project `.npmrc` (`//npm.pkg.github.com/:_authToken=...`, deleted afterwards), then `npx @foomakers/pair-cli@$VERSION install`

### Expected Result

- Exit code 0
- CLI downloaded from the channel registry (`registry.npmjs.org` on final, `npm.pkg.github.com` on pre/rc; no 404, no auth error)
- `.pair/knowledge/` directory created and non-empty
- `AGENTS.md` created at project root

### Notes

- This is the primary adoption path — validates that a user with zero configuration can install pair
- If 404: package not published to npmjs.org. If 401: registry still pointing to GitHub Packages
- Complements MT-CP301 (tests auto-download KB) by validating the npm registry path

---

## MT-CP321: Error paths exit non-zero (#543)

**Priority**: P1
**Preconditions**: `$CLI` functional
**Category**: CLI Functional

### Steps

1. `echo notzip > $WORKDIR/corrupt.zip`
2. `$CLI kb-verify $WORKDIR/corrupt.zip`; `$CLI kb-info $WORKDIR/corrupt.zip`
3. `mkdir $WORKDIR/empty-src $WORKDIR/project-empty && echo x > $WORKDIR/empty-src/a.md && cd $WORKDIR/project-empty && $CLI install --no-kb --offline --source $WORKDIR/empty-src`

### Expected Result

- Step 2: `kb-verify` exits != 0; `kb-info` exits 1 and prints `Invalid ZIP archive: $WORKDIR/corrupt.zip`
- Step 3: exit 1, `Invalid KB structure at: ...`, nothing installed
- Offline equivalent: `scripts/smoke-tests/scenarios/update-removes-files.sh` (`update-minor-fixes.sh` for the `kb-info` message)

---

## Changelog

- #543: channel-aware MT-CP320 (`$CHANNEL`); MT-CP302 adds workflows/agents/skills paths; MT-CP307 lists 7 registries; MT-CP308 dropped-file step; MT-CP319 `external/git-<hash>` cache path, default config (no stale `.claude/skills` remap), skipped skills/workflows OK; new MT-CP321 error paths.
