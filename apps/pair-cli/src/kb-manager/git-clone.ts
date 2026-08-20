import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { rmSync } from 'fs'

/** Placeholder written over any credential removed from a surfaced git message. */
const REDACTED = '***'

export interface GitRef {
  repoUrl: string
  ref?: string
}

/** Split `url#ref` into repo URL and optional ref (branch or tag — not a commit SHA). */
export function parseGitRef(source: string): GitRef {
  const hashIndex = source.indexOf('#')
  if (hashIndex === -1) return { repoUrl: source }
  return {
    repoUrl: source.slice(0, hashIndex),
    ref: source.slice(hashIndex + 1),
  }
}

/**
 * Inject PAIR_GIT_TOKEN into HTTPS URLs for private repo auth.
 * SSH URLs are not modified (they use SSH keys).
 *
 * KNOWN LIMITATION (stated, not silently carried): the token ends up in the `git clone`
 * argv, so it is readable by any local user through /proc/<pid>/cmdline on Linux for the
 * duration of the clone. Moving it out of argv (GIT_ASKPASS / credential helper /
 * `-c http.extraHeader`) changes how install and update authenticate against every private
 * source, so it is tracked as its own card (#448) rather than smuggled into a version-check
 * story.
 */
export function injectToken(repoUrl: string): string {
  const token = process.env['PAIR_GIT_TOKEN']
  if (!token) return repoUrl
  const match = repoUrl.match(/^(https?:\/\/)(.+)$/i)
  if (!match) return repoUrl
  return `${match[1]}${token}@${match[2]}`
}

/**
 * Remove any credential from a git message before it is shown to a user or written to a
 * CI log. Two shapes are stripped: the literal `PAIR_GIT_TOKEN` value wherever it lands
 * (argv echoed by execFileSync, stderr, a bare `token X rejected`), and the
 * `scheme://<userinfo>@` segment `injectToken` builds. Inverse of `injectToken`, kept in the
 * same module so the only place that knows how a credential enters a URL is the only place
 * that removes it.
 *
 * ORDER IS LOAD-BEARING — literal value first, userinfo regex second. A token may legally
 * contain `@` (a password, a `user:pass` pair). Injected, it yields TWO `@` in one URL
 * (`https://p@ssw0rd-secret@host/org/kb.git`); the userinfo regex stops at the FIRST one and
 * would leave `ssw0rd-secret` — the token's tail — in the surfaced message, after which a
 * literal pass can no longer find the token as one contiguous string. Stripping the literal
 * value first collapses the URL to `https://***@host/…` and the regex then only normalizes
 * whatever userinfo remains.
 */
export function redactGitCredentials(message: string): string {
  const token = process.env['PAIR_GIT_TOKEN']
  const withoutToken = token ? message.split(token).join(REDACTED) : message
  // `git@` is NOT a credential: `injectToken` only rewrites http(s) URLs, so an SSH URL can
  // never carry an injected token — `ssh://git@host/org/kb.git` is the one shape guaranteed
  // credential-free, and redacting it would only hide the repo from a debug message.
  return withoutToken.replace(
    /([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi,
    (whole: string, scheme: string, userinfo: string) =>
      userinfo === 'git' ? whole : `${scheme}${REDACTED}@`,
  )
}

/** Deterministic cache key from a git source URL (including optional #ref). */
export function gitCacheKey(source: string): string {
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 12)
  return `git-${hash}`
}

/**
 * How a git source is materialized on disk. Injected wherever a clone must be exercised
 * without a real `git` binary or a network (the version check), defaulting to
 * `cloneGitRepo`. Async-tolerant so an implementation is free to be either.
 */
export type GitCloner = (source: string, destDir: string) => void | Promise<void>

/**
 * Upper bound on a single clone. `kb-info`'s read-only version check reaches this function,
 * and a read-only info command must never block a terminal forever on a slow or huge repo.
 */
const CLONE_TIMEOUT_MS = 5 * 60_000

/**
 * Shallow-clone a git repository into destDir.
 *
 * destDir must NOT already exist, or must be EMPTY: `git clone` creates its destination and
 * refuses only a NON-empty one (that is the install path's second-run failure — a populated
 * cache slot — not a freshly created empty directory).
 *
 * Never interactive: `GIT_TERMINAL_PROMPT=0` turns a missing credential into an error instead
 * of a `Username for 'https://…':` prompt git would open on /dev/tty, so a private repo
 * without credentials degrades to a reported reason instead of hanging.
 */
export function cloneGitRepo(source: string, destDir: string): void {
  const { repoUrl, ref } = parseGitRef(source)
  const authedUrl = injectToken(repoUrl)

  const args = ['clone', '--depth', '1']
  if (ref) args.push('--branch', ref)
  args.push(authedUrl, destDir)

  try {
    execFileSync('git', args, {
      stdio: 'pipe',
      timeout: CLONE_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
  } catch (err) {
    // Clean up partial clone on failure
    try {
      rmSync(destDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
    // ONLY a failed spawn means the binary is missing. Keying on git's stderr instead would
    // rewrite `fatal: Remote branch <ref> not found in upstream origin` (bad #ref) and
    // `remote: Repository not found.` (private repo, no credentials) into "install git" —
    // and this message is now the user-visible reason of a read-only version check.
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new Error('git executable not found. Install git to use git repository sources.')
    }
    // spawnSync reports its own timeout kill as ETIMEDOUT with the opaque message
    // `spawnSync git ETIMEDOUT`. Left to the generic branch it reaches the user as an
    // authentication suggestion for what is a duration problem, and never names the bound
    // that was hit — so the one actionable fact (a 5-minute limit exists) is stated here.
    if (code === 'ETIMEDOUT') {
      throw new Error(
        `Git clone exceeded the ${CLONE_TIMEOUT_MS / 60_000}-minute limit and was aborted.\n\n` +
          'Clone the repository yourself and install from the local path, or point at a smaller ref.',
      )
    }
    // git echoes the AUTHENTICATED url back in its stderr, so redact before the message
    // exists as an Error — every caller (version check, install, update) inherits it.
    const msg = redactGitCredentials(err instanceof Error ? err.message : String(err))
    throw new Error(
      `Git clone failed: ${msg}\n\nFor private repos, set PAIR_GIT_TOKEN or configure SSH keys.`,
    )
  }
}
