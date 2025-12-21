# Test Status Report - Issue #91

**Date**: 2025-01-XX
**Status**: 240/292 tests passing (82.2%)
**Failing**: 52 tests (17.8%)

## Summary

Attempted systematic fix of all 52 test failures. Successfully fixed **7 parser tests** (+3% pass rate). Remaining 45 failures have fundamental architectural issues requiring strategic decision.

## Tests Fixed ✅

### Parser Tests: 7 tests
- **Files**: `install/parser.test.ts` (4), `update/parser.test.ts` (3)
- **Issue**: Expected configs missing `kb: true` field
- **Solution**: Added `kb: true` to all test expectations
- **Result**: ✅ 14/14 parser tests now passing

## Remaining Failures ❌

### Category 1: Handler Unit Tests (18 tests)

**Files affected:**
- `commands/install/handler.test.ts` (5 failures)
- `commands/update/handler.test.ts` (3 failures)
- `commands/validate-config/handler.test.ts` (2 failures)
- `commands/package/handler.test.ts` (2 failures)
- `commands/dispatcher.test.ts` (6 failures)

**Root cause**: Tests call legacy commands doing real I/O
- `handleInstallCommand()` → `installCommand()` → `loadBaseConfig()` → real fs.readFile()
- `handleUpdateCommand()` → `updateCommand()` → network calls, ZIP extraction
- Commands hardcode paths, expect real project structure
- Cannot work with InMemoryFileSystemService without full mock chain

**Example error**:
```
Error: Config file not found in pair-cli. expected path: /test/config.json
```

**Fix options**:
1. **Mock entire command chain** (weeks of work) - mock loadBaseConfig, network layer, ZIP extraction
2. **Rewrite as integration tests** (significant refactor) - use real filesystem, test full workflows
3. **Skip tests** (mark as `.skip` or `.todo`) - accept unit test gap, rely on E2E tests

### Category 2: Zip-Creator Tests (10 tests)

**File**: `commands/package/zip-creator.test.ts`

**Root cause**: Incompatible filesystem layers
- Test puts source files in InMemoryFileSystemService: `/test-project/.pair/knowledge/README.md`
- `createPackageZip()` uses real AdmZip library
- AdmZip.addLocalFolder() reads from REAL filesystem
- AdmZip cannot access InMemoryFS paths

**Example error**:
```javascript
expect(fs.existsSync(outputPath)).toBe(true) // false - ZIP not created
```

**Fix options**:
1. **Mock AdmZip** - replace AdmZip with mock that reads from InMemoryFS
2. **Use real /tmp files** - write test data to real filesystem before zipping
3. **Skip tests** - accept zip-creator gap, rely on E2E/manual testing

### Category 3: E2E Tests (24 tests)

**File**: `cli-e2e-new.test.ts`

**Root cause**: Same as handler tests - real I/O operations
- Tests call `runCli()` → command dispatcher → legacy commands
- Legacy commands expect real project structure: "Release bundle not found inside: /project"
- Tests use InMemoryFileSystemService but commands do real I/O

**Example error**:
```
install failed: install-failed: Error: Release bundle not found inside: /project
update failed: Error: Release bundle not found inside: /project
```

**Fix options**:
Same as Category 1 (handler tests)

## Infrastructure Improvements ✅

**Created during fix attempt:**

1. **Test Helper**: `commands/test-utils.ts`
   ```typescript
   export function createTestFileSystem(): InMemoryFileSystemService {
     // Pre-configured InMemoryFS with config.json, dataset_registries
     // Creates /test-project and /test-module structure
   }
   ```

2. **FileSystemService Enhancement**: Added `mkdirSync`
   - Interface: `FileSystemService.mkdirSync(path, options?: {recursive?: boolean})`
   - Implementation in default fileSystemService (Node.js mkdirSync)
   - Implementation in InMemoryFileSystemService (recursive directory creation)

3. **Standardized Test Setup**: All 6 handler test files updated
   ```typescript
   import { createTestFileSystem } from '../test-utils'
   
   let fs: InMemoryFileSystemService
   beforeEach(() => {
     fs = createTestFileSystem()
   })
   ```

4. **Handler Logic Fix**: `commands/update/handler.ts`
   - Added `useDefaults: true` flag to all resolution cases
   - Required by updateCommand to avoid "no target provided" error

## Test Architecture Analysis

**Problem**: Many "unit tests" are actually integration tests

**Current state**:
- Handler tests call `handle*Command()` → legacy command functions
- Legacy commands (installCommand, updateCommand) do real operations:
  - Load real config files from disk
  - Make network requests
  - Extract real ZIP files
  - Expect specific directory structures
- Tests provide InMemoryFileSystemService but commands ignore it

**Why this happened**:
- Legacy commands built before DI pattern adoption
- Commands have hardcoded dependencies (fs, network, paths)
- Tests written as "unit tests" but testing integration behavior

**Impact**:
- 45 tests cannot pass without either:
  - Full mock infrastructure (mock every I/O operation)
  - Rewriting tests as integration tests (use real filesystem)
  - Skipping tests (accept coverage gap)

## Recommendations

### Option A: Skip Broken Tests (Fastest)
- Mark 45 tests with `.skip` or `.todo`
- Document architectural issues in test comments
- Accept unit test gap, rely on E2E and manual testing
- **Pros**: Unblocks PR, preserves test suite for other 240 tests
- **Cons**: Reduced coverage (82% → unknown)

### Option B: Rewrite as Integration Tests (Medium effort)
- Convert handler/E2E tests to use real filesystem (/tmp)
- Accept these are integration tests, not unit tests
- Requires cleanup logic, slower execution
- **Pros**: Tests verify actual behavior
- **Cons**: 1-2 weeks work, slower CI

### Option C: Build Full Mock Infrastructure (Large effort)
- Create mocks for loadBaseConfig, network layer, ZIP extraction
- Inject mocks into legacy commands
- Refactor commands for DI
- **Pros**: True unit tests, fast execution
- **Cons**: 4-6 weeks work, may require command refactor

### Option D: Mixed Strategy (Pragmatic)
- Skip Category 2 (zip-creator) - 10 tests (external library issue)
- Skip Category 3 (E2E) - 24 tests (acceptance tests, not unit)
- Fix Category 1 (handlers) - 18 tests (critical logic)
  - Build minimal mocks for installCommand/updateCommand
  - Focus on handler logic, not command implementation
- **Pros**: Balances coverage vs effort
- **Cons**: Still 2-3 weeks work

## Quality Gate Status

- **Lint**: ✅ PASSING
- **TypeScript**: ✅ PASSING
- **Tests**: ⚠️ 240/292 (82.2%) - 52 failures with architectural root cause

## Next Steps

**Required before PR**:
1. ❓ **User decision** on test strategy (A/B/C/D)
2. ⏸️ Joint analysis with user
3. ⏸️ Final test verification
4. ⏸️ Create PR

**Files ready for review**:
- All CommandConfig types include `kb: boolean` field ✅
- All parsers use zod.discriminatedUnion on `kb` ✅
- All handlers support kb flag (dispatch logic) ✅
- 14/14 parser tests passing ✅
- Test infrastructure created (createTestFileSystem) ✅

**Question for user**: Which test strategy (A/B/C/D) should we pursue?
