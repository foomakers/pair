# KB Source Resolution Specification

Technical specification for Knowledge Base (KB) source resolution algorithm in `pair-cli`.

## Overview

The CLI determines KB source location using a precedence-based resolution algorithm. This document defines the formal specification including decision logic, precedence rules, error handling, and exit codes.

## Resolution Algorithm

### Precedence Order

KB source is resolved in the following order (highest to lowest priority):

1. **CLI flag `--source <url|path>`** - Explicit user-provided source
2. **Monorepo default** - `packages/knowledge-hub/dataset` (when running from monorepo)
3. **GitHub release auto-download** - Latest release from configured repository

### Decision Tree

```
┌─────────────────────────────────────┐
│  KB Source Resolution Entry Point  │
└─────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ --source provided? │
        └────────────────────┘
              │         │
          YES │         │ NO
              ▼         ▼
    ┌─────────────┐  ┌──────────────────┐
    │ --offline?  │  │ In monorepo?     │
    └─────────────┘  └──────────────────┘
         │  │              │         │
     YES │  │ NO       YES │         │ NO
         │  │              │         │
         ▼  ▼              ▼         ▼
    ┌────────┐       ┌─────────┐  ┌──────────┐
    │ Validate│       │ Use     │  │ Download │
    │ is local│       │ monorepo│  │ from     │
    │ path    │       │ dataset │  │ GitHub   │
    └────────┘       └─────────┘  └──────────┘
         │  │              │         │
    valid│  │invalid       │         │
         │  │              │         │
         ▼  ▼              ▼         ▼
    ┌─────────┐      ┌─────────────────┐
    │ Use     │      │ SUCCESS         │
    │ local   │      │ KB source ready │
    │ source  │      └─────────────────┘
    └─────────┘
         │
         ▼
    ┌─────────┐
    │ Parse   │
    │ source  │
    │ type    │
    └─────────┘
         │  │
    HTTP │  │ Path
         │  │
         ▼  ▼
    ┌──────────┐
    │ ERROR    │
    │ Exit(1)  │
    └──────────┘
```

## Source Type Detection

### URL Detection

A source is considered a URL if it matches:

```typescript
function isUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://')
}
```

### Local Path Detection

A source is considered a local path if it matches:

```typescript
function isLocalPath(source: string): boolean {
  return (
    source.startsWith('/') || // Absolute Unix path
    source.startsWith('./') || // Relative path
    source.startsWith('../') || // Relative parent path
    /^[A-Za-z]:[/\\]/.test(source) // Windows absolute path
  )
}
```

### Monorepo Detection

Running from monorepo is detected by:

```typescript
function isMonorepo(): boolean {
  // Check if packages/knowledge-hub/dataset exists
  const monorepoKbPath = path.resolve(process.cwd(), 'packages/knowledge-hub/dataset')
  return fs.existsSync(monorepoKbPath)
}
```

## Option Validation

### Constraint: `--offline` + `--source` Combination

| `--source` value | `--offline` | Valid? | Action                                            |
| ---------------- | ----------- | ------ | ------------------------------------------------- |
| Not provided     | `false`     | ✅     | Auto-download or use monorepo                     |
| Not provided     | `true`      | ❌     | ERROR: `--offline requires --source`              |
| HTTP/HTTPS URL   | `false`     | ✅     | Download from URL                                 |
| HTTP/HTTPS URL   | `true`      | ❌     | ERROR: Cannot combine remote URL with `--offline` |
| Local path       | `false`     | ✅     | Use local source                                  |
| Local path       | `true`      | ✅     | Use local source (offline mode)                   |

### Validation Pseudocode

```typescript
function validateCliOptions(options: { source?: string; kb: boolean }): void {
  const offline = options.kb === false // --no-kb means offline

  // Rule 1: --offline requires --source
  if (offline && !options.source) {
    throw new Error('--offline requires --source with local filesystem path')
  }

  // Rule 2: --offline cannot be used with remote URL
  if (offline && options.source && isUrl(options.source)) {
    throw new Error(
      'Cannot use --offline with remote URL. --offline requires local filesystem path.',
    )
  }
}
```

## Resolution Implementation

### Primary Resolution Function

```typescript
interface KbSource {
  type: 'url' | 'local' | 'monorepo' | 'github-release'
  location: string
  requiresDownload: boolean
}

async function resolveKbSource(options: { source?: string; offline?: boolean }): Promise<KbSource> {
  // Precedence 1: Explicit --source flag
  if (options.source) {
    if (isUrl(options.source)) {
      if (options.offline) {
        throw new Error('Cannot use --offline with remote URL')
      }
      return {
        type: 'url',
        location: options.source,
        requiresDownload: true,
      }
    } else if (isLocalPath(options.source)) {
      const resolvedPath = path.resolve(options.source)
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`KB source path does not exist: ${resolvedPath}`)
      }
      return {
        type: 'local',
        location: resolvedPath,
        requiresDownload: false,
      }
    } else {
      throw new Error(`Invalid source format: ${options.source}`)
    }
  }

  // Precedence 2: Monorepo default
  if (isMonorepo()) {
    const monorepoPath = path.resolve('packages/knowledge-hub/dataset')
    return {
      type: 'monorepo',
      location: monorepoPath,
      requiresDownload: false,
    }
  }

  // Precedence 3: GitHub release auto-download
  if (options.offline) {
    throw new Error('Cannot auto-download KB in offline mode. Use --source with local path.')
  }

  return {
    type: 'github-release',
    location: await getLatestReleaseUrl(),
    requiresDownload: true,
  }
}
```

## Error Catalog

### Exit Codes

| Code | Category          | Description                          |
| ---- | ----------------- | ------------------------------------ |
| `0`  | Success           | KB source resolved successfully      |
| `1`  | Validation Error  | Invalid options or source not found  |
| `2`  | Download Error    | Network failure or checksum mismatch |
| `3`  | File System Error | Permission denied or disk full       |

### Error Scenarios

#### E001: Offline Without Source

```
Error: --offline requires --source with local filesystem path

Example:
  pair install --offline --source ./local-kb
```

**Exit Code:** 1  
**Cause:** `--offline` flag used without `--source`  
**Resolution:** Provide `--source` with local path

#### E002: Offline With Remote URL

```
Error: Cannot use --offline with remote URL

--offline requires local filesystem path.

Example:
  pair install --offline --source ./local-kb
```

**Exit Code:** 1  
**Cause:** `--offline` flag used with HTTP/HTTPS URL  
**Resolution:** Use local path or remove `--offline` flag

#### E003: Source Path Not Found

```
Error: KB source path does not exist: /path/to/missing

Please verify:
  • Path is correct
  • Path is accessible
  • Path contains valid KB content
```

**Exit Code:** 1  
**Cause:** `--source` points to non-existent path  
**Resolution:** Verify path exists and is accessible

#### E004: Invalid Source Format

```
Error: Invalid source format: invalid-source

Source must be:
  • HTTP/HTTPS URL: https://example.com/kb.zip
  • Absolute path: /absolute/path/to/kb
  • Relative path: ./relative/path/to/kb
```

**Exit Code:** 1  
**Cause:** `--source` value is neither URL nor valid path  
**Resolution:** Use valid URL or path format

#### E005: Download Network Error

```
Error: Failed to download KB from https://example.com/kb.zip

Network error: Connection timeout after 30s

Suggestions:
  • Check internet connection
  • Verify firewall settings
  • Try different mirror with --source
  • Use offline mode with local KB
```

**Exit Code:** 2  
**Cause:** Network failure during download  
**Resolution:** Check connectivity or use local source

#### E006: Checksum Validation Failed

```
Error: KB checksum validation failed

Downloaded file may be corrupted or tampered with.

Suggestions:
  • Retry download
  • Clear cache: rm -rf ~/.pair/kb/
  • Verify source integrity
```

**Exit Code:** 2  
**Cause:** SHA256 checksum mismatch  
**Resolution:** Retry download or verify source

#### E007: Auto-Download in Offline Mode

```
Error: Cannot auto-download KB in offline mode

Use --source with local filesystem path:
  pair install --offline --source ./local-kb
```

**Exit Code:** 1  
**Cause:** No source provided and offline mode prevents auto-download  
**Resolution:** Provide local source path

## Download Process

### HTTP Download Flow

When `requiresDownload: true` for URL sources:

```
┌──────────────────┐
│ Fetch URL        │
│ HEAD request     │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Fetch .sha256    │
│ checksum file    │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Download KB      │
│ GET request      │
│ with progress    │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Validate SHA256  │
│ (if available)   │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Extract to cache │
│ ~/.pair/kb/{ver} │
└──────────────────┘
```

### Cache Strategy

Downloaded KBs are cached to avoid redundant downloads:

**Cache Location:** `~/.pair/kb/{version}/`

**Cache Key:** SHA256 of download URL or version string

**Cache Hit Logic:**

```typescript
function getCachedKb(source: KbSource): string | null {
  const cacheKey = generateCacheKey(source.location)
  const cachePath = path.join(os.homedir(), '.pair', 'kb', cacheKey)

  if (fs.existsSync(cachePath)) {
    return cachePath
  }
  return null
}
```

## Testing Scenarios

### Test Matrix

| Scenario               | `--source`    | `--offline` | Monorepo | Expected Result                      |
| ---------------------- | ------------- | ----------- | -------- | ------------------------------------ |
| Default (monorepo)     | -             | -           | ✅       | Use `packages/knowledge-hub/dataset` |
| Default (release)      | -             | -           | ❌       | Auto-download from GitHub            |
| Custom URL             | `https://...` | -           | -        | Download from URL                    |
| Custom local path      | `./kb`        | -           | -        | Use local path                       |
| Offline with local     | `./kb`        | ✅          | -        | Use local path (offline)             |
| Offline without source | -             | ✅          | -        | ERROR: E001                          |
| Offline with URL       | `https://...` | ✅          | -        | ERROR: E002                          |
| Invalid source         | `invalid`     | -           | -        | ERROR: E004                          |
| Missing path           | `/missing`    | -           | -        | ERROR: E003                          |

### Unit Test Example

```typescript
describe('KB Source Resolution', () => {
  it('should use --source URL when provided', async () => {
    const result = await resolveKbSource({
      source: 'https://example.com/kb.zip',
    })
    expect(result.type).toBe('url')
    expect(result.requiresDownload).toBe(true)
  })

  it('should throw error for --offline without --source', async () => {
    await expect(resolveKbSource({ offline: true })).rejects.toThrow('--offline requires --source')
  })

  it('should use monorepo default when available', async () => {
    // Mock fs.existsSync to simulate monorepo
    jest.spyOn(fs, 'existsSync').mockReturnValue(true)

    const result = await resolveKbSource({})
    expect(result.type).toBe('monorepo')
    expect(result.requiresDownload).toBe(false)
  })
})
```

## Integration with Commands

### Install Command Integration

```typescript
async function installCommand(options: InstallOptions) {
  // Step 1: Validate options
  validateCliOptions(options)

  // Step 2: Resolve KB source
  const kbSource = await resolveKbSource(options)

  // Step 3: Download if required
  let kbPath: string
  if (kbSource.requiresDownload) {
    kbPath = await downloadKb(kbSource.location)
  } else {
    kbPath = kbSource.location
  }

  // Step 4: Perform installation
  await performInstall(kbPath, options.target)
}
```

### Update Command Integration

Same resolution logic applies - both `install` and `update` share the KB source resolution algorithm.

## Configuration

### Environment Variables

| Variable              | Description                         | Default               |
| --------------------- | ----------------------------------- | --------------------- |
| `PAIR_KB_CACHE_DIR`   | Override KB cache directory         | `~/.pair/kb`          |
| `PAIR_KB_DEFAULT_URL` | Override default GitHub release URL | GitHub latest release |
| `PAIR_DIAG`           | Enable diagnostic logging           | `0` (disabled)        |

### Example Configuration

```bash
# Use custom cache directory
export PAIR_KB_CACHE_DIR=/tmp/pair-kb-cache

# Use custom default KB source
export PAIR_KB_DEFAULT_URL=https://internal-mirror.company.com/kb.zip

# Enable diagnostic logging
export PAIR_DIAG=1

pair install
```

## Related Documentation

- [CLI Commands Reference](../cli/commands.md) - Complete command documentation
- [CLI Contracts Spec](./cli-contracts.md) - Command contracts and validation
- [CLI Help Examples](../cli/help-examples.md) - Practical usage examples
