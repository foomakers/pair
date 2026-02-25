# CP7 — Registry Publish

**Priority**: P2
**Scope**: Package visibility on GitHub Packages, install from registry
**Preconditions**: `publish-gh-packages` job completed. `$WORKDIR` created outside the repo. `$WORKDIR/.npmrc` created by variable resolution step (uses `gh auth token` — no manual PAT needed).

---

## MT-CP701: Package visible on GitHub

**Priority**: P2
**Preconditions**: Publish job ran
**Category**: Registry

### Steps

1. Navigate to `https://github.com/foomakers/pair/pkgs/npm/pair-cli`
   - Direct version link: `https://github.com/orgs/foomakers/packages/npm/pair-cli/$VERSION_ID`
   - Release page with all artifacts: `https://github.com/foomakers/pair/releases/tag/v$VERSION`
2. Or run: `gh api /orgs/foomakers/packages?package_type=npm` (requires `read:packages` scope)

### Expected Result

- `@foomakers/pair-cli` package listed
- Version `$VERSION` visible

### Notes

- The `gh api` alternative requires a token with `read:packages` scope. If unavailable, verify via browser or `curl` on the direct links above.

---

## MT-CP702: npm view from registry

**Priority**: P2
**Preconditions**: `$WORKDIR/.npmrc` created by variable resolution step
**Category**: Registry

### Steps

1. `npm view @foomakers/pair-cli@$VERSION --registry=$REGISTRY --userconfig=$WORKDIR/.npmrc`

### Expected Result

- Returns package metadata
- Version matches `$VERSION`

### Notes

- GitHub Packages npm **requires authentication** even for public repos. Auth is handled automatically via `$WORKDIR/.npmrc` (populated from `gh auth token` during variable resolution).
- If 401: run `gh auth refresh -h github.com -s read:packages` and re-resolve `$NPM_TOKEN`.

---

## MT-CP703: Install from registry into isolated project

**Priority**: P2
**Preconditions**: MT-CP702 passes
**Category**: Registry

### Steps

1. `mkdir -p $WORKDIR/registry-test && cd $WORKDIR/registry-test`
2. `npm init -y`
3. `cp $WORKDIR/.npmrc $WORKDIR/registry-test/.npmrc`
4. `npm install @foomakers/pair-cli@$VERSION`

### Expected Result

- npm install exits 0
- `node_modules/@foomakers/pair-cli/` exists

---

## MT-CP704: CLI functional after registry install

**Priority**: P2
**Preconditions**: MT-CP703 passes
**Category**: Registry

### Steps

1. `cd $WORKDIR/registry-test`
2. `npx pair-cli --version`

### Expected Result

- Exit code 0
- Output is `$VERSION`

---

## MT-CP705: Install + pair install from registry

**Priority**: P2
**Preconditions**: MT-CP703 passes
**Category**: Registry

### Steps

1. `cd $WORKDIR/registry-test`
2. `npx pair-cli install`

### Expected Result

- Exit code 0
- KB installed (`.pair/knowledge/` exists and non-empty)
