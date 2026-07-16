/**
 * Determine Version — resolves the release version from three possible sources,
 * in precedence order, then writes it in GITHUB_OUTPUT/GITHUB_ENV format.
 *
 * The LOGIC lives here as individually exported, unit-tested functions (see
 * determine-version.test.ts, white-box). The `main()` block is a thin CLI
 * wrapper run via `tsx src/determine-version.ts` (package script
 * `determine-version`), preserving the same 5 flags and behavior as the
 * bash script it replaces (scripts/workflows/release/determine-version.sh,
 * deleted by this port — see #148).
 *
 * Usage:
 *   pnpm --filter @pair/release-tools determine-version -- \
 *     --input-version "$INPUT" --release-tag "$TAG" --github-ref "$GITHUB_REF" \
 *     --output-file $GITHUB_OUTPUT --env-file $GITHUB_ENV
 */
import { appendFileSync } from 'fs'

const TAG_REF_PREFIX = 'refs/tags/'

export type VersionSource = 'input' | 'release-tag' | 'github-ref'

export interface ResolveVersionInput {
  inputVersion?: string | undefined
  releaseTag?: string | undefined
  githubRef?: string | undefined
}

export interface ResolveVersionResult {
  version: string
  source: VersionSource
}

/**
 * Resolve the release version, in the same precedence order as the original
 * bash script: --input-version > --release-tag > tag extracted from
 * --github-ref (pattern `refs/tags/*`). Throws if none apply — same
 * condition under which the bash script printed its error and exited 1.
 */
export function resolveVersion(input: ResolveVersionInput): ResolveVersionResult {
  const { inputVersion, releaseTag, githubRef } = input

  if (inputVersion) return { version: inputVersion, source: 'input' }
  if (releaseTag) return { version: releaseTag, source: 'release-tag' }
  if (githubRef && githubRef.startsWith(TAG_REF_PREFIX)) {
    return { version: githubRef.slice(TAG_REF_PREFIX.length), source: 'github-ref' }
  }

  throw new Error(
    [
      'Error: Could not determine version from provided inputs',
      `INPUT_VERSION: '${inputVersion ?? ''}'`,
      `RELEASE_TAG: '${releaseTag ?? ''}'`,
      `GITHUB_REF: '${githubRef ?? ''}'`,
    ].join('\n'),
  )
}

/** Append `version=<value>` to outputFile (GITHUB_OUTPUT format), or print it if no file given. */
export function writeGithubOutput(outputFile: string | undefined, version: string): void {
  const line = `version=${version}`
  if (outputFile) {
    appendFileSync(outputFile, `${line}\n`)
  } else {
    console.log(line)
  }
}

/** Append `VERSION=<value>` to envFile (GITHUB_ENV format), or print it if no file given. */
export function writeGithubEnv(envFile: string | undefined, version: string): void {
  const line = `VERSION=${version}`
  if (envFile) {
    appendFileSync(envFile, `${line}\n`)
  } else {
    console.log(line)
  }
}

export interface ParsedArgs {
  inputVersion?: string | undefined
  releaseTag?: string | undefined
  githubRef?: string | undefined
  outputFile?: string | undefined
  envFile?: string | undefined
  help: boolean
}

const USAGE = `Usage: determine-version [options]

Options:
  --input-version VERSION    Version from workflow_dispatch input
  --release-tag TAG          Tag name from release event
  --github-ref REF            GITHUB_REF environment variable
  --output-file FILE          File to write version output (default: stdout)
  --env-file FILE              File to write VERSION env var (default: stdout)`

/**
 * Parse CLI argv into flags. A literal `--` may survive pnpm/tsx argv
 * forwarding from `pnpm --filter @pair/release-tools determine-version -- <args>`
 * invocations (the exact failure mode PR #330 hit for @pair/dev-tools) — it's
 * filtered out before flag parsing so it never gets mistaken for a flag value.
 */
export function parseArgv(argv: string[]): ParsedArgs {
  const args = argv.filter(a => a !== '--')
  const result: ParsedArgs = { help: false }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--input-version':
        result.inputVersion = args[++i]
        break
      case '--release-tag':
        result.releaseTag = args[++i]
        break
      case '--github-ref':
        result.githubRef = args[++i]
        break
      case '--output-file':
        result.outputFile = args[++i]
        break
      case '--env-file':
        result.envFile = args[++i]
        break
      case '-h':
      case '--help':
        result.help = true
        break
      default:
        throw new Error(`Unknown option: ${arg}\nUse -h or --help for usage information`)
    }
  }

  return result
}

/** Thin CLI wrapper: parse argv, resolve version, write outputs, mirror the bash script's exit codes. */
export function main(argv: string[] = process.argv.slice(2)): void {
  let parsed: ParsedArgs
  try {
    parsed = parseArgv(argv)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
    return
  }

  if (parsed.help) {
    console.log(USAGE)
    return
  }

  let result: ResolveVersionResult
  try {
    result = resolveVersion({
      inputVersion: parsed.inputVersion,
      releaseTag: parsed.releaseTag,
      githubRef: parsed.githubRef,
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
    return
  }

  console.log(`Determined version: ${result.version}`)
  writeGithubOutput(parsed.outputFile, result.version)
  writeGithubEnv(parsed.envFile, result.version)
}

if (require.main === module) {
  main()
}
