# CP7 — Registry Publish (npmjs.org)

**Priority**: P0
**Scope**: Package visibility on npmjs.org, install from public registry
**Preconditions**: `publish-npm` job completed (or local `scripts/workflows/release/publish-npm.sh` run). `$WORKDIR` created outside the repo.

---

## MT-CP701: Package visible on npmjs.org

**Priority**: P0
**Preconditions**: Publish job ran
**Category**: Registry

### Steps

1. Open `https://www.npmjs.com/package/@foomakers/pair-cli/v/$VERSION`
2. Or run: `npm view @foomakers/pair-cli@$VERSION`

### Expected Result

- `@foomakers/pair-cli` package listed
- Version `$VERSION` visible

### Notes

- No authentication required — package is public on npmjs.org.

---

## MT-CP702: npm view from registry

**Priority**: P0
**Preconditions**: None (public package)
**Category**: Registry

### Steps

1. `npm view @foomakers/pair-cli@$VERSION`

### Expected Result

- Returns package metadata
- Version matches `$VERSION`

### Notes

- No `.npmrc` or token needed — npmjs.org public packages are accessible without auth.

---

## MT-CP703: Install from registry into isolated project

**Priority**: P0
**Preconditions**: MT-CP702 passes
**Category**: Registry

### Steps

1. `mkdir -p $WORKDIR/registry-test && cd $WORKDIR/registry-test`
2. `npm init -y`
3. `npm install @foomakers/pair-cli@$VERSION`

### Expected Result

- npm install exits 0
- `node_modules/@foomakers/pair-cli/` exists

### Notes

- No `.npmrc` needed — default npm registry is registry.npmjs.org.

---

## MT-CP704: CLI functional after registry install

**Priority**: P0
**Preconditions**: MT-CP703 passes
**Category**: Registry

### Steps

1. `cd $WORKDIR/registry-test`
2. `npx pair-cli --version`

### Expected Result

- Exit code 0
- Output is `$VERSION`

---

## MT-CP705: Install + pair-cli install from registry

**Priority**: P0
**Preconditions**: MT-CP703 passes
**Category**: Registry

### Steps

1. `cd $WORKDIR/registry-test`
2. `npx pair-cli install`

### Expected Result

- Exit code 0
- KB installed (`.pair/knowledge/` exists and non-empty)
