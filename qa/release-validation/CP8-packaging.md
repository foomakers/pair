# CP8 — KB Packaging

**Priority**: P1
**Scope**: `pair-cli package` with source and target layout modes, validation, metadata
**Preconditions**: Working CLI binary (from CP2). `$WORKDIR` created outside the repo. `$CLI` = path to working pair-cli binary. KB installed in `$WORKDIR/project-auto` (from MT-CP301).

---

## MT-CP801: Package with target layout (default)

**Priority**: P1
**Preconditions**: MT-CP301 passes (KB installed in `$WORKDIR/project-auto`)
**Category**: Packaging

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI package -o $WORKDIR/pkg-target.zip`

### Expected Result

- Exit code 0
- `$WORKDIR/pkg-target.zip` exists and is non-empty
- ZIP contains files from installed target directories (e.g., `.pair/knowledge/`, `.claude/skills/`)

---

## MT-CP802: Package with source layout

**Priority**: P1
**Preconditions**: KB source available at `$WORKDIR/kb-source` (from MT-CP303 setup)
**Category**: Packaging

### Steps

1. `cd $WORKDIR/kb-source`
2. `$CLI package --layout source -o $WORKDIR/pkg-source.zip`

### Expected Result

- Exit code 0
- `$WORKDIR/pkg-source.zip` exists and is non-empty
- ZIP contains files from source directories (no prefix/flatten transforms applied)

### Notes

- Source layout reads from `config.json` `source` fields, not from installed targets

---

## MT-CP803: Package with metadata flags

**Priority**: P1
**Preconditions**: MT-CP301 passes
**Category**: Packaging

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI package --name "Test KB" --version $VERSION --author "Tester" -o $WORKDIR/pkg-meta.zip`

### Expected Result

- Exit code 0
- `$WORKDIR/pkg-meta.zip` exists
- ZIP contains a manifest with name="Test KB", version=$VERSION, author="Tester"

---

## MT-CP804: Validate target layout

**Priority**: P1
**Preconditions**: MT-CP301 passes
**Category**: Packaging

### Steps

1. `cd $WORKDIR/project-auto`
2. `$CLI kb-validate --layout target`

### Expected Result

- Exit code 0
- Validation passes for target layout structure

---

## MT-CP805: Validate source layout

**Priority**: P1
**Preconditions**: KB source available at `$WORKDIR/kb-source`
**Category**: Packaging

### Steps

1. `cd $WORKDIR/kb-source`
2. `$CLI kb-validate --layout source`

### Expected Result

- Exit code 0
- Validation passes for source layout structure

---

## MT-CP806: Target-layout package rewrites relative link depth

**Priority**: P1
**Preconditions**: MT-CP301 passes (KB installed in `$WORKDIR/project-auto`)
**Category**: Packaging
**Regression**: #187

### Steps

1. `cd $WORKDIR/project-auto`
2. Find a skill file with relative links: `grep -r '\.\./\.\./\.\.' .claude/skills/ --include='*.md' -l | head -1` → `$SKILL_FILE`
3. Note the link depth: `grep -oP '\(\K[^)]+' $SKILL_FILE | grep '^\.\.' | head -3`
4. `$CLI package --layout target -o $WORKDIR/pkg-link-test.zip`
5. `mkdir -p $WORKDIR/pkg-link-extract && cd $WORKDIR/pkg-link-extract && unzip $WORKDIR/pkg-link-test.zip`
6. Find the same skill in extracted package: `find .skills/ -name "$(basename $SKILL_FILE)"` → `$PKG_SKILL`
7. Compare link depth: `grep -oP '\(\K[^)]+' $PKG_SKILL | grep '^\.\.' | head -3`

### Expected Result

- Links in `$PKG_SKILL` have one fewer `../` level than `$SKILL_FILE` (target `.claude/skills/x/` = 3 deep, source `.skills/x/` = 2 deep)
- External links (https://...) and anchors (#...) are unchanged
- `$CLI kb-validate --layout source` passes in `$WORKDIR/pkg-link-extract`

### Notes

- This validates the fix for #187 (off-by-one link depth in target-layout packaging)
- The depth delta depends on the specific registry: `.claude/skills/` → `.skills/` = -1 level

---

## MT-CP807: Source and target packages differ

**Priority**: P2
**Preconditions**: MT-CP801 and MT-CP802 pass
**Category**: Packaging

### Steps

1. `unzip -l $WORKDIR/pkg-target.zip | wc -l`
2. `unzip -l $WORKDIR/pkg-source.zip | wc -l`
3. Compare file paths in both ZIPs

### Expected Result

- Both ZIPs contain valid KB content
- File paths differ (target has prefix/flatten transforms, source has original structure)
- Both ZIPs can be installed via `$CLI install --source <zip>`

### Notes

- This validates that `--layout` actually produces different output, not identical packages
