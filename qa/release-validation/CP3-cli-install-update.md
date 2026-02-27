# CP3 — CLI Install & Update

**Priority**: P0
**Scope**: `pair install` (auto-download KB, explicit source), `pair update`, idempotency, isolation
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
- Error message suggests using `pair update` instead
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
- Lists target registries from config.json (knowledge, adoption, github, agents, skills)

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
- Backup files/directory retained after update (not cleaned up)

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
- Shows what would change (or "no changes needed")
- No files modified (dry-run)

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
- Error message suggests using `pair update`
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
- Error message suggests using `pair install` first
- No files created

### Notes

- Symmetric with MT-CP317. `update` precondition: targets must exist.

---

## MT-CP319: Install from Git repository source

**Priority**: P1
**Preconditions**: `$CLI` functional, internet available, `git` installed
**Category**: CLI Functional

### Steps

1. Save the CLI `config.json` and change skills source to match the repo layout:
   ```bash
   CLI_DIR=$(dirname $(dirname $CLI))   # pair-cli package root
   cp $CLI_DIR/config.json $WORKDIR/config.json.bak
   node -e "
     const fs=require('fs'), p='$CLI_DIR/config.json';
     const c=JSON.parse(fs.readFileSync(p,'utf-8'));
     c.asset_registries.skills.source='.claude/skills';
     fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
   "
   ```
2. `rm -rf ~/.pair/kb/git-*` (clear git KB cache entries)
3. `mkdir -p $WORKDIR/project-git && cd $WORKDIR/project-git`
4. `$CLI install --source https://github.com/foomakers/pair.git#main`
5. Verify cache uses hash-based path: `ls ~/.pair/kb/ | grep '^git-'`
6. Verify `.git` removed from cache: `ls ~/.pair/kb/git-*/.git` (should fail)
7. Restore original config: `cp $WORKDIR/config.json.bak $CLI_DIR/config.json`

### Expected Result

- Exit code 0 (all 5 registries succeed including skills)
- Cache directory is `~/.pair/kb/git-<hash>/` (not version-based)
- No `.git` directory inside cache
- Same file structure as MT-CP302
- Original `config.json` restored after test

### Notes

- The default `config.json` has `skills.source: ".skills"` but the pair repo uses `.claude/skills/` — step 1 remaps this temporarily
- Git cache key is a SHA-256 hash of the full URL (including `#ref`), independent of CLI version
- Different URLs/refs produce different cache entries (no collisions)
