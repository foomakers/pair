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
 * Auth for an HTTPS git clone, added to the CHILD PROCESS ENVIRONMENT rather than argv
 * or the URL's userinfo (US-291 review round 2 escalation of #448).
 *
 * The prior scheme built `https://<token>@host/…` and passed that URL as a `git clone`
 * argument: readable by any local user through `/proc/<pid>/cmdline` on Linux for the
 * whole duration of the clone, and `kb-info`'s READ-ONLY version check newly reaches this
 * same path. The prior scheme DID authenticate — git answers a `401` challenge with Basic
 * auth built from the URL's userinfo — so the argv exposure, not broken auth, is the whole
 * reason for this change.
 *
 * `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n` (git >= 2.31 — an OLDER
 * git silently ignores all of these and the clone runs unauthenticated, whose resulting
 * failure recommends `PAIR_GIT_TOKEN`, already set) set a one-shot, child-process-scoped
 * `http.<origin>.extraheader` carrying a Basic auth header WITHOUT ever putting the token
 * on the command line or in the URL. `<origin>` is the scheme+host(+port) git config
 * subsection form, bounding which origin the header is sent to on the request that
 * ORIGINATES there.
 *
 * **A same-clone HTTP redirect reaches a host the caller never named, and origin-scoping
 * alone does not stop it** (rounds 5-8: two prior "this is fine" claims here were both
 * measured false and reverted — see the `cloneGitRepo — auth` describe block in
 * `git-clone.test.ts` for the trace). git resolves `http.<url>.*` ONCE, against the
 * remote's own URL; curl strips a custom `Authorization` header only on the ONE follow-hop
 * of a redirect, but git then adopts the redirect target as the clone's new base URL, and
 * every request AFTER that is a FRESH request to the new origin — not a redirect curl
 * would touch. Measured against a real `git http-backend` with a redirect mid-clone: the
 * token reaches the redirect target's `git-upload-pack` request regardless of scoping.
 *
 * **`http.followRedirects=false` closes it**: refusing to follow at all fails the clone
 * outright on a redirect instead of silently continuing against an unverified origin —
 * measured: `fatal: … The requested URL returned error: 302`, one request, the token never
 * leaves the origin it was scoped to. Trade-off, accepted: a git host that legitimately
 * redirects (moved org, forced HTTPS) now fails a token-authenticated clone instead of
 * following it — consistent with this story's own trust-boundary stance of failing closed
 * on unverified content rather than trusting it silently.
 *
 * `http://` is excluded because `http.extraheader` has no transport guard: unlike the
 * prior scheme's challenge/response (which happens over whatever transport the URL names,
 * so cleartext there was already a problem, just not a NEW one), this header would go out
 * on every plaintext request without git treating that as anything unusual.
 */
function gitAuthEnv(repoUrl: string): Record<string, string> {
  const token = process.env['PAIR_GIT_TOKEN']
  if (!token || !/^https:\/\//i.test(repoUrl)) return {}
  // A malformed URL cannot be scoped safely — fail closed (no header) rather than send it
  // unscoped, which would reintroduce the cross-host leak this function exists to close.
  let origin: string
  try {
    origin = new URL(repoUrl).origin
  } catch {
    return {}
  }
  const basic = Buffer.from(`${token}:`).toString('base64')
  return {
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: `http.${origin}.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    // Refuses ANY redirect once an auth header is attached — see the docstring above for
    // why origin-scoping alone does not stop a redirect from reaching the token.
    GIT_CONFIG_KEY_1: 'http.followRedirects',
    GIT_CONFIG_VALUE_1: 'false',
  }
}

/**
 * Remove any credential from a git message before it is shown to a user or written to a
 * CI log. Two shapes are stripped: the literal `PAIR_GIT_TOKEN` value wherever it lands
 * (stderr, a bare `token X rejected`), and a `scheme://<userinfo>@` segment — the token no
 * longer travels in a URL this module builds, but a caller may still name a source URL
 * that carries its OWN embedded credential (`--git https://user:pass@host/...`), and that
 * is exactly as much a credential as one this module injected.
 *
 * ORDER IS LOAD-BEARING — literal value first, userinfo regex second. A token may legally
 * contain `@` (a password, a `user:pass` pair). Embedded in a URL, it yields TWO `@`
 * (`https://p@ssw0rd-secret@host/org/kb.git`); the userinfo regex stops at the FIRST one and
 * would leave `ssw0rd-secret` — the token's tail — in the surfaced message, after which a
 * literal pass can no longer find the token as one contiguous string. Stripping the literal
 * value first collapses the URL to `https://***@host/…` and the regex then only normalizes
 * whatever userinfo remains.
 */
export function redactGitCredentials(message: string): string {
  const token = process.env['PAIR_GIT_TOKEN']
  const withoutToken = token ? message.split(token).join(REDACTED) : message
  // `git@` is NOT a credential: it is the fixed SSH login user, never a PAIR_GIT_TOKEN
  // carrier — `ssh://git@host/org/kb.git` is the one shape guaranteed credential-free, and
  // redacting it would only hide the repo from a debug message.
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
/**
 * Turns a failed `execFileSync('git', ...)` into the user-visible reason, keyed on the
 * REAL failure rather than git's stderr text (split out of `cloneGitRepo` to stay under
 * this repo's max-lines-per-function — no behaviour change).
 */
function throwCloneError(err: unknown, repoUrl: string): never {
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
  // The url no longer carries a credential, but redact anyway before the message exists
  // as an Error — every caller (version check, install, update) inherits it, and a
  // caller-supplied source URL may still embed its own credential.
  const msg = redactGitCredentials(err instanceof Error ? err.message : String(err))
  // A redirect refused by `gitAuthEnv`'s http.followRedirects=false surfaces as git's
  // generic "returned error: 3xx" — indistinguishable, to the branch below, from any
  // other failure, so it fell through to "set PAIR_GIT_TOKEN", the ONE thing already
  // done and the ONE thing that caused this failure (US-291 review round 9). Only fires
  // when the auth header was actually attached (`gitAuthEnv` returns fields only for a
  // token'd https:// source) — an unauthenticated clone follows redirects normally and
  // hits this generic "3xx" text for an unrelated reason far less often.
  if (Object.keys(gitAuthEnv(repoUrl)).length > 0 && /returned error: 3\d\d\b/.test(msg)) {
    throw new Error(
      'Git clone failed: the source redirected to a different location, and pair refuses ' +
        'to follow a redirect while PAIR_GIT_TOKEN is attached, so the token cannot reach ' +
        'a host you did not name.\n\n' +
        "Point --source at the repository's current URL, or clone it yourself and install " +
        'from the local path.',
    )
  }
  throw new Error(
    `Git clone failed: ${msg}\n\nFor private repos, set PAIR_GIT_TOKEN or configure SSH keys.`,
  )
}

export function cloneGitRepo(source: string, destDir: string): void {
  const { repoUrl, ref } = parseGitRef(source)

  const args = ['clone', '--depth', '1']
  if (ref) args.push('--branch', ref)
  args.push(repoUrl, destDir)

  try {
    execFileSync('git', args, {
      stdio: 'pipe',
      timeout: CLONE_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...gitAuthEnv(repoUrl) },
    })
  } catch (err) {
    // Clean up partial clone on failure
    try {
      rmSync(destDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
    throwCloneError(err, repoUrl)
  }
}
