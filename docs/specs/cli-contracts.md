# CLI Contracts Specification

Technical specification for `pair-cli` command contracts, TypeScript types, validation rules, and error handling.

## Overview

This document defines the formal contracts for all CLI commands including:

- TypeScript discriminated union types for command options
- Validation error catalog with exit codes
- Command input/output contracts
- Test matrices for validation scenarios

---

## Command Option Types

### Base Types

```typescript
// Shared across all commands
export interface CommandOptions {
  datasetRoot?: string
  customConfigPath?: string
  baseTarget?: string // Target resolution: INIT_CWD (pnpm) > [target] arg > CWD
  useDefaults?: boolean
  minLogLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}

// KB source resolution options (install, update)
export interface CliOptions {
  url?: string // --source <url|path> (renamed internally from --url)
  kb: boolean // --no-kb flag (true=download, false=offline)
}
```

### Install Command

```typescript
export interface InstallOptions extends CommandOptions, CliOptions {
  listTargets?: boolean // --list-targets
  config?: string // --config <file>
  source?: string // --source <url|path>
  offline?: boolean // --offline (derived from kb: false)
}

// Validation constraints
interface InstallConstraints {
  // Cannot combine --list-targets with other operations
  listTargets: boolean
  mutuallyExclusive: ['listTargets', 'baseTarget']

  // Offline constraints (see KB Source Resolution spec)
  offlineRequiresSource: true
  offlineRequiresLocalPath: true
}
```

### Update Command

```typescript
export interface UpdateOptions extends CommandOptions, CliOptions {
  config?: string // --config <file>
  source?: string // --source <url|path>
  offline?: boolean // --offline (derived from kb: false)
}

// Inherits same offline constraints as InstallOptions
```

### Update-Link Command

```typescript
export interface UpdateLinkOptions extends CommandOptions {
  url?: string // --url <url|path> (KB source for link validation)
  dryRun?: boolean // --dry-run (preview mode)
  verbose?: boolean // --verbose (detailed output)
}

// Validation constraints
interface UpdateLinkConstraints {
  // url is optional - if not provided, scans target directory only
  urlOptional: true
  // dryRun and verbose can be combined
  compatibleFlags: ['dryRun', 'verbose']
}
```

### Package Command

```typescript
export interface PackageOptions {
  output?: string // -o, --output <path>
  sourceDir?: string // -s, --source-dir <path>
  config?: string // -c, --config <path>
  verbose?: boolean // -v, --verbose
  name?: string // --name <name>
  version?: string // --version <version>
  description?: string // --description <description>
  author?: string // --author <author>
  skipRegistries?: string[] // --skip-registries <list> (comma-separated)
  root?: string // --root <path> (default: .pair/)
}

// Validation constraints
interface PackageConstraints {
  // sourceDir must exist if provided
  sourceDirExists: true
  // output directory must be writable
  outputDirWritable: true
  // KB structure validation required before packaging
  requiresValidKBStructure: true
  // root must be relative path within KB
  rootMustBeRelative: true
}
```

### KB Validate Command

```typescript
export interface KbValidateOptions {
  path?: string // KB directory path (default: cwd)
  layout?: 'source' | 'target' // Layout mode (default: target)
  strict?: boolean // Enable external link checking via HTTP HEAD
  ignoreConfig?: boolean // Skip config-based registry structure checks
  skipRegistries?: string[] // --skip-registries <list> (comma-separated)
}

// Validation constraints
interface KbValidateConstraints {
  // path must contain .pair directory
  requiresPairDirectory: true
  // layout must be 'source' or 'target'
  layoutEnum: ['source', 'target']
  // strict mode performs HTTP HEAD on external links (slow)
  strictRequiresNetwork: true
  // skipRegistries names must exist in config
  skipRegistriesValidated: true
}
```

### Validate-Config Command

```typescript
export interface ValidateConfigOptions {
  config?: string // -c, --config <file>
}

// Validation constraints
interface ValidateConfigConstraints {
  // config file must exist and be valid JSON
  configMustExist: true
  configMustBeJSON: true
}
```

---

## Validation Error Catalog

### Error Categories

| Category              | Exit Code | Description                                           |
| --------------------- | --------- | ----------------------------------------------------- |
| **Option Validation** | 1         | Invalid option combination or missing required option |
| **File System**       | 1         | Path not found, permission denied, not writable       |
| **Network**           | 2         | Download failure, connection timeout, DNS error       |
| **Checksum**          | 2         | SHA256 validation failure                             |
| **Configuration**     | 1         | Invalid config.json structure or values               |
| **KB Structure**      | 1         | Invalid KB directory structure                        |

### Option Validation Errors

#### V001: Conflicting Options

```text
Error: Cannot use --list-targets with target arguments

Usage: pair install --list-targets
   OR  pair install [target]
```

**Exit Code:** 1  
**Trigger:** `--list-targets` combined with positional arguments  
**Resolution:** Use `--list-targets` alone

#### V002: Offline Requires Source

```text
Error: --offline requires --source with local filesystem path

Example:
  pair install --offline --source ./local-kb
```

**Exit Code:** 1  
**Trigger:** `--offline` without `--source`  
**Resolution:** Provide `--source` with local path  
**See:** [KB Source Resolution Spec](./kb-source-resolution.md#e001)

#### V003: Offline Cannot Use URL

```text
Error: Cannot use --offline with remote URL

--offline requires local filesystem path.

Example:
  pair install --offline --source ./local-kb
```

**Exit Code:** 1  
**Trigger:** `--offline` with HTTP/HTTPS URL in `--source`  
**Resolution:** Use local path or remove `--offline`  
**See:** [KB Source Resolution Spec](./kb-source-resolution.md#e002)

#### V004: Invalid Config File

```text
Error: Config file not found: ./missing-config.json

Ensure:
  • Path is correct
  • File exists and is readable
```

**Exit Code:** 1  
**Trigger:** `--config` points to non-existent file  
**Resolution:** Verify file path

#### V005: Malformed Config JSON

```text
Error: Failed to parse config file: Unexpected token } in JSON at position 125

Config file: ./config.json
```

**Exit Code:** 1  
**Trigger:** Invalid JSON syntax in config file  
**Resolution:** Fix JSON syntax errors

### File System Errors

#### FS001: Path Not Found

```text
Error: Target path does not exist: /path/to/missing

Ensure:
  • Path is correct
  • Path is accessible
  • You have read permissions
```

**Exit Code:** 1  
**Trigger:** Target path doesn't exist  
**Resolution:** Create directory or fix path

#### FS002: Permission Denied

```text
Error: Permission denied: /protected/path

Suggestions:
  • Check file/directory permissions
  • Run with appropriate user privileges
  • Use different target directory
```

**Exit Code:** 1  
**Trigger:** Insufficient permissions for path access  
**Resolution:** Fix permissions or use different path

#### FS003: Not Writable

```text
Error: Target directory is not writable: /readonly/path

Ensure:
  • Directory permissions allow writing
  • Filesystem is not read-only
  • Sufficient disk space available
```

**Exit Code:** 1  
**Trigger:** Cannot write to target directory  
**Resolution:** Fix write permissions

#### FS004: Disk Full

```text
Error: Insufficient disk space

Required: 150 MB
Available: 42 MB

Suggestions:
  • Free up disk space
  • Use different target directory
```

**Exit Code:** 3  
**Trigger:** Insufficient disk space for operation  
**Resolution:** Free disk space

### KB Structure Errors

#### KB001: Missing .pair Directory

```text
Error: Invalid KB structure - .pair directory not found

Source: /path/to/kb-content

KB must contain:
  • .pair/ directory
  • Valid config.json in KB root
```

**Exit Code:** 1  
**Trigger:** KB source missing `.pair` directory  
**Resolution:** Use valid KB source with `.pair` directory

#### KB002: Invalid Asset Registry

```text
Error: Asset registry 'github' has invalid configuration

Issues:
  • Missing required field: behavior
  • Invalid behavior value: 'sync' (must be: mirror, add, overwrite, skip)

Config file: config.json
```

**Exit Code:** 1  
**Trigger:** Asset registry validation failure  
**Resolution:** Fix config.json registry definition

---

## Validation Logic

### Install/Update Option Validation

```typescript
function validateInstallUpdateOptions(options: InstallOptions | UpdateOptions): void {
  // Offline mode validation
  const offline = options.kb === false

  if (offline && !options.source) {
    throw new ValidationError('V002', '--offline requires --source with local filesystem path')
  }

  if (offline && options.source && isUrl(options.source)) {
    throw new ValidationError(
      'V003',
      'Cannot use --offline with remote URL. --offline requires local filesystem path.',
    )
  }

  // Config validation
  if (options.config && !fileExists(options.config)) {
    throw new ValidationError('V004', `Config file not found: ${options.config}`)
  }

  // List targets exclusivity
  if ('listTargets' in options && options.listTargets && options.baseTarget) {
    throw new ValidationError('V001', 'Cannot use --list-targets with target arguments')
  }
}
```

### Package Option Validation

```typescript
function validatePackageOptions(options: PackageOptions): void {
  // Source directory validation
  if (options.sourceDir) {
    const resolved = path.resolve(options.sourceDir)
    if (!fs.existsSync(resolved)) {
      throw new ValidationError('FS001', `Source directory not found: ${options.sourceDir}`)
    }
  }

  // Output path validation
  if (options.output) {
    const outputDir = path.dirname(path.resolve(options.output))
    if (!fs.existsSync(outputDir)) {
      throw new ValidationError('FS001', `Output directory does not exist: ${outputDir}`)
    }
    if (!isWritable(outputDir)) {
      throw new ValidationError('FS003', `Output directory is not writable: ${outputDir}`)
    }
  }

  // KB structure validation
  const kbPath = options.sourceDir || process.cwd()
  const pairDir = path.join(kbPath, '.pair')
  if (!fs.existsSync(pairDir)) {
    throw new ValidationError(
      'KB001',
      `Invalid KB structure - .pair directory not found in ${kbPath}`,
    )
  }
}
```

### Config File Validation

```typescript
interface ConfigValidationResult {
  valid: boolean
  errors: string[]
}

function validateConfig(config: Config): ConfigValidationResult {
  const errors: string[] = []

  // Validate asset registries
  if (!config.asset_registries || typeof config.asset_registries !== 'object') {
    errors.push('Config must have asset_registries object')
    return { valid: false, errors }
  }

  for (const [name, registry] of Object.entries(config.asset_registries)) {
    // Required fields
    if (!registry.behavior) {
      errors.push(`Asset registry '${name}': missing required field 'behavior'`)
    }
    if (!registry.target_path) {
      errors.push(`Asset registry '${name}': missing required field 'target_path'`)
    }
    if (!registry.description) {
      errors.push(`Asset registry '${name}': missing required field 'description'`)
    }

    // Behavior value validation
    const validBehaviors = ['mirror', 'add', 'overwrite', 'skip']
    if (registry.behavior && !validBehaviors.includes(registry.behavior)) {
      errors.push(
        `Asset registry '${name}': invalid behavior '${
          registry.behavior
        }' (must be: ${validBehaviors.join(', ')})`,
      )
    }

    // Source path validation (if specified)
    if (registry.source && !fs.existsSync(registry.source)) {
      errors.push(`Asset registry '${name}': source path not found: ${registry.source}`)
    }

    // Include pattern validation (if specified)
    if (registry.include && !Array.isArray(registry.include)) {
      errors.push(`Asset registry '${name}': include must be an array`)
    }

    // Target transform validation (if specified)
    if (registry.targets && Array.isArray(registry.targets)) {
      for (const target of registry.targets) {
        if (target.transform) {
          if (typeof target.transform !== 'object' || Array.isArray(target.transform)) {
            errors.push(`Asset registry '${name}': transform must be an object`)
          } else if (!target.transform.prefix || typeof target.transform.prefix !== 'string') {
            errors.push(`Asset registry '${name}': transform.prefix must be a non-empty string`)
          }
          if (target.mode === 'symlink') {
            errors.push(`Asset registry '${name}': transform is incompatible with symlink mode`)
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
```

---

## Exit Code Contract

### Standard Exit Codes

All commands follow this exit code contract:

| Code | Meaning                | Examples                                                            |
| ---- | ---------------------- | ------------------------------------------------------------------- |
| `0`  | Success                | Command completed successfully                                      |
| `1`  | Validation Error       | Invalid options, config errors, KB structure errors, path not found |
| `2`  | Download/Network Error | Network timeout, checksum mismatch, HTTP errors                     |
| `3`  | File System Error      | Disk full, permission denied (during operation, not validation)     |

### Per-Command Exit Codes

#### Install Command

```typescript
enum InstallExitCode {
  SUCCESS = 0,
  VALIDATION_ERROR = 1, // Invalid options, config error, path not found
  DOWNLOAD_ERROR = 2, // KB download failure, checksum error
  FS_ERROR = 3, // Disk full, permission denied during copy
}
```

#### Update Command

```typescript
enum UpdateExitCode {
  SUCCESS = 0,
  VALIDATION_ERROR = 1,
  DOWNLOAD_ERROR = 2,
  FS_ERROR = 3,
}
```

#### Update-Link Command

```typescript
enum UpdateLinkExitCode {
  SUCCESS = 0, // All links valid or successfully fixed
  VALIDATION_ERROR = 1, // Invalid target path, KB not found
  // Note: Broken links that cannot be fixed do NOT cause non-zero exit
  // They are reported but command still succeeds
}
```

#### Package Command

```typescript
enum PackageExitCode {
  SUCCESS = 0, // Package created successfully
  VALIDATION_ERROR = 1, // Invalid KB structure, config error
  PACKAGING_ERROR = 2, // ZIP creation failure
}
```

#### Validate-Config Command

```typescript
enum ValidateConfigExitCode {
  SUCCESS = 0, // Config valid
  VALIDATION_ERROR = 1, // Config has errors
}
```

#### KB Validate Command

```typescript
enum KbValidateExitCode {
  SUCCESS = 0, // KB structure, links, and metadata valid
  VALIDATION_ERROR = 1, // Structure errors, broken links, or metadata issues
  STRUCTURE_ERROR = 2, // Critical structure validation failure
}
```

---

## Test Matrices

### Install/Update Option Validation Matrix

| `--source`    | `--offline` | Monorepo | Expected Result      | Exit Code | Error Code         |
| ------------- | ----------- | -------- | -------------------- | --------- | ------------------ |
| -             | -           | ✅       | Use monorepo dataset | 0         | -                  |
| -             | -           | ❌       | Auto-download        | 0 or 2    | -                  |
| `https://...` | -           | -        | Download from URL    | 0 or 2    | -                  |
| `./local`     | -           | -        | Use local path       | 0 or 1    | FS001 if not found |
| `./local`     | ✅          | -        | Use local (offline)  | 0 or 1    | FS001 if not found |
| -             | ✅          | -        | ERROR                | 1         | V002               |
| `https://...` | ✅          | -        | ERROR                | 1         | V003               |
| `/missing`    | -           | -        | ERROR                | 1         | FS001              |

### Package Option Validation Matrix

| `--source-dir` | `--output`         | KB Structure | Expected Result  | Exit Code | Error Code |
| -------------- | ------------------ | ------------ | ---------------- | --------- | ---------- |
| -              | -                  | ✅           | Package cwd      | 0         | -          |
| `./kb`         | -                  | ✅           | Package ./kb     | 0         | -          |
| -              | `dist/kb.zip`      | ✅           | Package to dist/ | 0         | -          |
| `./missing`    | -                  | -            | ERROR            | 1         | FS001      |
| -              | `/readonly/kb.zip` | -            | ERROR            | 1         | FS003      |
| `./no-pair`    | -                  | ❌           | ERROR            | 1         | KB001      |

### Validate-Config Matrix

| Config File    | JSON Valid | Structure Valid | Expected Result   | Exit Code |
| -------------- | ---------- | --------------- | ----------------- | --------- |
| `config.json`  | ✅         | ✅              | Success           | 0         |
| `config.json`  | ✅         | ❌              | Validation errors | 1         |
| `config.json`  | ❌         | -               | Parse error       | 1         |
| `missing.json` | -          | -               | File not found    | 1         |

---

## TypeScript Discriminated Unions

### Command Type Union

```typescript
type CommandName = 'install' | 'update' | 'update-link' | 'package' | 'validate-config'

type CommandConfig =
  | { command: 'install'; options: InstallOptions }
  | { command: 'update'; options: UpdateOptions }
  | { command: 'update-link'; options: UpdateLinkOptions }
  | { command: 'package'; options: PackageOptions }
  | { command: 'validate-config'; options: ValidateConfigOptions }

// Type-safe command execution
function executeCommand(config: CommandConfig): Promise<number> {
  switch (config.command) {
    case 'install':
      return installCommand(config.options)
    case 'update':
      return updateCommand(config.options)
    case 'update-link':
      return updateLinkCommand(config.options)
    case 'package':
      return packageCommand(config.options)
    case 'validate-config':
      return validateConfigCommand(config.options)
  }
}
```

### Validation Error Union

```typescript
type ValidationErrorCode =
  | 'V001' // Conflicting options
  | 'V002' // Offline requires source
  | 'V003' // Offline cannot use URL
  | 'V004' // Invalid config file
  | 'V005' // Malformed JSON

type FileSystemErrorCode =
  | 'FS001' // Path not found
  | 'FS002' // Permission denied
  | 'FS003' // Not writable
  | 'FS004' // Disk full

type KBStructureErrorCode =
  | 'KB001' // Missing .pair directory
  | 'KB002' // Invalid asset registry

type ErrorCode = ValidationErrorCode | FileSystemErrorCode | KBStructureErrorCode

class ValidationError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
```

---

## Testing Strategy

### Unit Tests

Test validation functions in isolation:

```typescript
describe('validateInstallUpdateOptions', () => {
  it('should throw V002 for --offline without --source', () => {
    expect(() => {
      validateInstallUpdateOptions({ kb: false })
    }).toThrow('V002')
  })

  it('should throw V003 for --offline with URL', () => {
    expect(() => {
      validateInstallUpdateOptions({
        kb: false,
        source: 'https://example.com/kb.zip',
      })
    }).toThrow('V003')
  })

  it('should allow --offline with local path', () => {
    expect(() => {
      validateInstallUpdateOptions({
        kb: false,
        source: './local-kb',
      })
    }).not.toThrow()
  })
})
```

### Integration Tests

Test complete command execution with validation:

```typescript
describe('install command', () => {
  it('should exit with code 1 for invalid options', async () => {
    const exitCode = await installCommand({ kb: false })
    expect(exitCode).toBe(1)
  })

  it('should exit with code 0 for valid local install', async () => {
    const exitCode = await installCommand({
      kb: false,
      source: './fixtures/kb',
    })
    expect(exitCode).toBe(0)
  })
})
```

### E2E Tests

Test CLI execution via child process:

```typescript
describe('pair install CLI', () => {
  it('should fail with --offline and no --source', async () => {
    const result = await exec('pair install --offline')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('--offline requires --source')
  })
})
```

---

## Related Documentation

- [CLI Commands Reference](../cli/commands.md) - User-facing command documentation
- [KB Source Resolution Spec](./kb-source-resolution.md) - KB source resolution algorithm
- [CLI Help Examples](../cli/help-examples.md) - Practical usage examples
