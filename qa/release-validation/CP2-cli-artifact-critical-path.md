# CP2 — CLI Artifact Critical Path

**Priority**: P0
**Scope**: Download, checksum, extraction, --version, --help for ZIP and TGZ artifacts
**Preconditions**: GitHub release published at `$RELEASE_URL`. `$WORKDIR` created outside the repo.

---

## MT-CP201: GitHub release exists

**Priority**: P0
**Preconditions**: None
**Category**: CLI Artifact

### Steps

1. Open `$RELEASE_URL` (or `gh release view v$VERSION`)

### Expected Result

- Release page exists with title containing `$VERSION`
- 7 assets listed: `.zip`, `.zip.sha256`, `.tgz`, `.tgz.sha256`, `.meta.json`, KB `.zip`, KB `.zip.sha256`

---

## MT-CP202: Download manual ZIP

**Priority**: P0
**Preconditions**: MT-CP201 passes
**Category**: CLI Artifact

### Steps

1. Download `pair-cli-manual-$VERSION.zip` to `$WORKDIR`
2. Download `pair-cli-manual-$VERSION.zip.sha256` to `$WORKDIR`

### Expected Result

- Both files downloaded without error
- ZIP file size > 0 bytes

---

## MT-CP203: ZIP checksum verification

**Priority**: P0
**Preconditions**: MT-CP202 passes
**Category**: CLI Artifact

### Steps

1. `cd $WORKDIR`
2. Compute: `sha256sum pair-cli-manual-$VERSION.zip` (or `shasum -a 256`)
3. Compare against content of `.sha256` file

### Expected Result

- Checksums match exactly

---

## MT-CP204: ZIP extraction and structure

**Priority**: P0
**Preconditions**: MT-CP203 passes
**Category**: CLI Artifact

### Steps

1. `unzip pair-cli-manual-$VERSION.zip -d $WORKDIR/manual`
2. List contents of extracted directory

### Expected Result

- Directory `pair-cli-manual-$VERSION/` exists
- Contains: `bundle-cli/index.js`, `bin/pair-cli`, `pair-cli` (top-level wrapper), `pair-cli.cmd`, `package.json`, `README.md`

---

## MT-CP205: ZIP binary --version

**Priority**: P0
**Preconditions**: MT-CP204 passes
**Category**: CLI Artifact

### Steps

1. `chmod +x $WORKDIR/manual/pair-cli-manual-$VERSION/pair-cli`
2. `$WORKDIR/manual/pair-cli-manual-$VERSION/pair-cli --version`

### Expected Result

- Exit code 0
- Output is `$VERSION` (exact match, no extra text)

---

## MT-CP206: ZIP binary --help

**Priority**: P0
**Preconditions**: MT-CP205 passes
**Category**: CLI Artifact

### Steps

1. `$WORKDIR/manual/pair-cli-manual-$VERSION/pair-cli --help`

### Expected Result

- Exit code 0
- Lists all 8 commands: install, update, package, kb-validate, kb-verify, kb-info, update-link, validate-config

---

## MT-CP207: Download TGZ artifact

**Priority**: P0
**Preconditions**: MT-CP201 passes
**Category**: CLI Artifact

### Steps

1. Download `pair-cli-$VERSION.tgz` to `$WORKDIR`
2. Download `pair-cli-$VERSION.tgz.sha256` to `$WORKDIR`

### Expected Result

- Both files downloaded without error

---

## MT-CP208: TGZ checksum verification

**Priority**: P0
**Preconditions**: MT-CP207 passes
**Category**: CLI Artifact

### Steps

1. Compute checksum of `pair-cli-$VERSION.tgz`
2. Compare against `.sha256` file content

### Expected Result

- Checksums match exactly

---

## MT-CP209: TGZ install into isolated project

**Priority**: P0
**Preconditions**: MT-CP208 passes
**Category**: CLI Artifact

### Steps

1. `mkdir -p $WORKDIR/tgz-test && cd $WORKDIR/tgz-test`
2. `npm init -y`
3. `npm install $WORKDIR/pair-cli-$VERSION.tgz --no-workspaces`

### Expected Result

- npm install exits 0
- `node_modules/.bin/pair-cli` exists (or symlink to it)

### Notes

- Use `--no-workspaces` to avoid pnpm workspace interference
- Ensure no `.npmrc` in parent dirs inherits auth config

---

## MT-CP210: TGZ binary --version

**Priority**: P0
**Preconditions**: MT-CP209 passes
**Category**: CLI Artifact

### Steps

1. `cd $WORKDIR/tgz-test`
2. `npx pair-cli --version`

### Expected Result

- Exit code 0
- Output is `$VERSION`

---

## MT-CP211: meta.json content

**Priority**: P1
**Preconditions**: MT-CP201 passes
**Category**: CLI Artifact

### Steps

1. Download `pair-cli-$VERSION.meta.json` to `$WORKDIR`
2. Parse JSON

### Expected Result

- `name` == `@foomakers/pair-cli`
- `version` == `$VERSION`
- `private` == `false`
- `publishConfig.registry` == `https://npm.pkg.github.com/`

---

## MT-CP212: Windows shim present in ZIP

**Priority**: P2
**Preconditions**: MT-CP204 passes
**Category**: CLI Artifact

### Steps

1. Check `$WORKDIR/manual/pair-cli-manual-$VERSION/pair-cli.cmd` exists
2. Inspect content

### Expected Result

- File exists
- Contains `node` invocation pointing to `bundle-cli\index.js`
