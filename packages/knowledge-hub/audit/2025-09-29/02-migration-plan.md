# Knowledge Hub Migration Plan

**Date:** September 29, 2025  
**Migration Type:** Guidelines 3-Level Reorganization  
**Method:** transfer-dataset.ts automation  
**Target:** Single PR with systematic commits

## Migration Strategy

Use `transfer-dataset.ts` for all moves to ensure:

- Automatic link updates
- Consistent operation logging
- Rollback capability via git
- Audit Trail for review

**Scope:** ONLY the `guidelines/` folder will be reorganized into 3-level structure. All other content (`how-to/`, `assets/`, root files) remains in current flat structure.

## Current → Target Structure

**UNCHANGED (Keep Current Structure):**

- `getting-started.md` - stays as root file
- `way-of-working.md` - stays as root file
- `how-to/` folder - entire folder stays as-is (13 files)
- `assets/` folder - entire folder stays as-is (3 files)

**CHANGED (3-Level Reorganization):**
Only `guidelines/` folder (26 files) → reorganized into themed structure

**Target Structure:**

```
packages/knowledge-hub/dataset/.pair/knowledge/
├── getting-started.md (unchanged)
├── way-of-working.md (unchanged)
├── how-to/ (unchanged - 13 files)
├── assets/ (unchanged - 3 files)
└── guidelines/ (REORGANIZED)
    ├── architecture/
    │   ├── README.md (Level 2)
    │   └── architectural-guidelines.md (from 01-architectural-guidelines.md)
    ├── development/
    │   ├── README.md (Level 2)
    │   ├── code-design-guidelines.md (from 02-code-design-guidelines.md)
    │   ├── technical-guidelines.md (from 03-technical-guidelines.md)
    │   └── testing-strategy.md (from 07-testing-strategy.md)
    ├── collaboration/
    │   ├── README.md (Level 2)
    │   └── project-management/ (from 12-collaboration-and-process-guidelines/)
    ├── quality/
    │   ├── README.md (Level 2)
    │   ├── definition-of-done.md (from 06-definition-of-done.md)
    │   ├── accessibility-guidelines.md (from 08-accessibility-guidelines.md)
    │   ├── performance-guidelines.md (from 09-performance-guidelines.md)
    │   └── security-guidelines.md (from 10-security-guidelines.md)
    ├── operations/
    │   ├── README.md (Level 2)
    │   ├── infrastructure-guidelines.md (from 04-infrastructure-guidelines.md)
    │   ├── observability-guidelines.md (from 11-observability-guidelines.md)
    │   └── ux-guidelines.md (from 05-ux-guidelines.md)
    └── README.md (Level 1 - guidelines overview)
```

## Migration Commands

**Working Directory:** `packages/knowledge-hub/`

### Step 1: Create Guidelines Theme Directories

```bash
# Create theme directories within guidelines folder only
mkdir -p dataset/.pair/knowledge/guidelines/architecture
mkdir -p dataset/.pair/knowledge/guidelines/development
mkdir -p dataset/.pair/knowledge/guidelines/collaboration
mkdir -p dataset/.pair/knowledge/guidelines/quality
mkdir -p dataset/.pair/knowledge/guidelines/operations
```

### Step 2: Move Guidelines Files by Theme

**Architecture Guidelines:**

```bash
ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/01-architectural-guidelines.md" \
  ".pair/knowledge/guidelines/architecture/architectural-guidelines.md" \
  move
```

**Development Guidelines:**

```bash
ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/02-code-design-guidelines.md" \
  ".pair/knowledge/guidelines/development/code-design-guidelines.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/03-technical-guidelines.md" \
  ".pair/knowledge/guidelines/development/technical-guidelines.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/07-testing-strategy.md" \
  ".pair/knowledge/guidelines/development/testing-strategy.md" \
  move
```

**Collaboration Guidelines:**

```bash
# Move entire collaboration directory
ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/12-collaboration-and-process-guidelines" \
  ".pair/knowledge/guidelines/collaboration/project-management" \
  move \
  packages/knowledge-hub/audit/2025-09-29/sync-options-mirror.json
```

**Quality Guidelines:**

```bash
ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/06-definition-of-done.md" \
  ".pair/knowledge/guidelines/quality/definition-of-done.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/08-accessibility-guidelines.md" \
  ".pair/knowledge/guidelines/quality/accessibility-guidelines.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/09-performance-guidelines.md" \
  ".pair/knowledge/guidelines/quality/performance-guidelines.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/10-security-guidelines.md" \
  ".pair/knowledge/guidelines/quality/security-guidelines.md" \
  move
```

**Operations Guidelines:**

```bash
ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/04-infrastructure-guidelines.md" \
  ".pair/knowledge/guidelines/operations/infrastructure-guidelines.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/05-ux-guidelines.md" \
  ".pair/knowledge/guidelines/operations/ux-guidelines.md" \
  move

ts-node src/transfer-dataset.ts \
  ".pair/knowledge/guidelines/11-observability-guidelines.md" \
  ".pair/knowledge/guidelines/operations/observability-guidelines.md" \
  move
```

### Step 3: Create Level 2 README Files

Create theme README files that list practices and provide navigation:

- `guidelines/architecture/README.md`
- `guidelines/development/README.md`
- `guidelines/collaboration/README.md`
- `guidelines/quality/README.md`
- `guidelines/operations/README.md`
- `guidelines/README.md` (Level 1 overview)

## Rollback Plan

If migration needs rollback:

```bash
git checkout HEAD~1 -- packages/knowledge-hub/dataset/.pair/knowledge/
```

## Validation Steps

1. **Link Check:** `pnpm --filter @pair/knowledge-hub run check:links`
2. **File Count:** Verify all 38 files moved correctly
3. **Content Integrity:** Spot check key files for content preservation
4. **Build Test:** Ensure package builds correctly

## Next Steps After Migration

1. Create Level 2 README files for each theme
2. Add assistant context hints to practice files
3. Create AGENTS.md registry
4. Sync to root `.pair` directory
5. Update monorepo references

---

**Execution Note:** Each command should be run individually with git commit after success to enable granular rollback.
