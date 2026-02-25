# CP4 — KB Dataset

**Priority**: P1
**Scope**: Knowledge Base ZIP artifact from GitHub release — download, manifest, verify, info
**Preconditions**: GitHub release published at `$RELEASE_URL`. `$WORKDIR` created outside the repo. `$CLI` = path to working pair-cli binary.

---

## MT-CP401: Download KB ZIP artifact

**Priority**: P1
**Preconditions**: MT-CP201 passes (release exists)
**Category**: Dataset

### Steps

1. Download `knowledge-base-$VERSION.zip` to `$WORKDIR`
2. Download `knowledge-base-$VERSION.zip.sha256` to `$WORKDIR`

### Expected Result

- Both files downloaded without error
- ZIP file size > 0 bytes

---

## MT-CP402: KB ZIP checksum verification

**Priority**: P1
**Preconditions**: MT-CP401 passes
**Category**: Dataset

### Steps

1. Compute checksum of `knowledge-base-$VERSION.zip`
2. Compare against `.sha256` file content

### Expected Result

- Checksums match exactly

---

## MT-CP403: KB ZIP contains manifest

**Priority**: P1
**Preconditions**: MT-CP402 passes
**Category**: Dataset

### Steps

1. `unzip -l $WORKDIR/knowledge-base-$VERSION.zip | grep manifest.json`
2. Extract manifest: `unzip -p $WORKDIR/knowledge-base-$VERSION.zip manifest.json`
3. Parse JSON

### Expected Result

- `manifest.json` exists in ZIP
- Contains `name` field (non-empty)
- Contains `version` field matching `$VERSION`

---

## MT-CP404: KB ZIP content non-trivial

**Priority**: P1
**Preconditions**: MT-CP402 passes
**Category**: Dataset

### Steps

1. `unzip -l $WORKDIR/knowledge-base-$VERSION.zip | wc -l`

### Expected Result

- File count > 50 (not an empty or stub package)

---

## MT-CP405: pair kb-verify on KB ZIP

**Priority**: P1
**Preconditions**: MT-CP401 passes, `$CLI` functional
**Category**: Dataset

### Steps

1. `$CLI kb-verify $WORKDIR/knowledge-base-$VERSION.zip`

### Expected Result

- Exit code 0
- Output confirms checksum valid, structure valid, manifest valid

---

## MT-CP406: pair kb-verify --json output

**Priority**: P2
**Preconditions**: MT-CP401 passes, `$CLI` functional
**Category**: Dataset

### Steps

1. `$CLI kb-verify $WORKDIR/knowledge-base-$VERSION.zip --json`
2. Parse output as JSON

### Expected Result

- Valid JSON output
- Contains verification results

---

## MT-CP407: pair kb-info on KB ZIP

**Priority**: P1
**Preconditions**: MT-CP401 passes, `$CLI` functional
**Category**: Dataset

### Steps

1. `$CLI kb-info $WORKDIR/knowledge-base-$VERSION.zip`

### Expected Result

- Exit code 0
- Shows name, version, file count
- Version matches `$VERSION`

---

## MT-CP408: pair kb-info --json output

**Priority**: P2
**Preconditions**: MT-CP401 passes, `$CLI` functional
**Category**: Dataset

### Steps

1. `$CLI kb-info $WORKDIR/knowledge-base-$VERSION.zip --json`
2. Parse output as JSON

### Expected Result

- Valid JSON output
- `version` field matches `$VERSION`
