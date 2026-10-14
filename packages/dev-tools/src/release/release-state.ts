/**
 * Release state — pure: tags + pending changeset bumps + main HEAD + channel
 * → version/plan or refusal. Shared by `pnpm release` and the CI workflows.
 */
export type Channel = 'pre' | 'rc' | 'final'
export type Bump = 'major' | 'minor' | 'patch'

export interface PlanInput {
  channel: Channel
  /** every `v*` tag → the commit it points at */
  tags: Record<string, string>
  /** tag → first parent of the commit it points at (pre/rc tags sit on an ephemeral release commit) */
  tagParents?: Record<string, string> | undefined
  /** bump of each pending changeset */
  bumps: Bump[]
  head: string
  override?: string | undefined
}

export type Plan =
  | { ok: true; version: string; tag: string; base: string; predecessors: string[] }
  | { ok: false; error: string }

const RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 }
const ORDER: Record<Channel, number> = { pre: 0, rc: 1, final: 2 }
const TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-(pre|rc)\.(\d+))?$/

type Parsed = { base: string; channel: Channel; n: number }
const parseTag = (tag: string): Parsed | null => {
  const m = TAG.exec(tag)
  if (!m) return null
  return {
    base: `${m[1]}.${m[2]}.${m[3]}`,
    channel: (m[4] as Channel) ?? 'final',
    n: Number(m[5] ?? 0),
  }
}
const nums = (v: string) => v.split('.').map(Number) as [number, number, number]
const cmp = (a: string, b: string) => {
  const [x, y] = [nums(a), nums(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

export function parseChangesetBump(md: string): Bump | null {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? ''
  const found = [...fm.matchAll(/:\s*(major|minor|patch)\s*$/gm)].map(m => m[1] as Bump)
  return found.length ? highestBump(found, '1.0.0') : null
}

/** Highest bump; below 1.0 breaking = minor. */
export function highestBump(bumps: Bump[], lastFinal: string): Bump | null {
  if (!bumps.length) return null
  const top = bumps.reduce((a, b) => (RANK[b] > RANK[a] ? b : a))
  return top === 'major' && nums(lastFinal)[0] === 0 ? 'minor' : top
}

function bumpVersion(v: string, bump: Bump): string {
  const [a, b, c] = nums(v)
  return bump === 'major'
    ? `${a + 1}.0.0`
    : bump === 'minor'
      ? `${a}.${b + 1}.0`
      : `${a}.${b}.${c + 1}`
}

/** pre/rc tags the successful publish of `version` makes obsolete (never finals). */
export function predecessors(version: string, tags: string[]): string[] {
  const me = parseTag(`v${version}`)
  if (!me) return []
  return tags.filter(t => {
    const p = parseTag(t)
    if (!p || p.channel === 'final' || t === `v${version}`) return false
    if (p.base !== me.base) return cmp(p.base, me.base) < 0
    return me.channel === 'final' || (p.channel === me.channel && p.n < me.n)
  })
}

export function planRelease(i: PlanInput): Plan {
  const refuse = (error: string): Plan => ({ ok: false, error })
  const parsed = Object.keys(i.tags).map(t => [t, parseTag(t)] as const)
  const finals = parsed.filter(([, p]) => p?.channel === 'final').map(([, p]) => p!.base)
  const lastFinal = finals.sort(cmp).pop() ?? '0.0.0'

  let base: string
  if (i.override !== undefined) {
    if (!/^\d+\.\d+\.\d+$/.test(i.override))
      return refuse(`invalid version '${i.override}' (X.Y.Z)`)
    if (cmp(i.override, lastFinal) <= 0)
      return refuse(`version ${i.override} not greater than last final ${lastFinal}`)
    base = i.override
  } else {
    const bump = highestBump(i.bumps, lastFinal)
    if (!bump) return refuse('nothing to release: no pending changeset and no --version')
    base = bumpVersion(lastFinal, bump)
  }

  const mine = parsed.filter(([, p]) => p && p.base === base)
  const highest = Math.max(-1, ...mine.map(([, p]) => ORDER[p!.channel]))
  if (highest > ORDER[i.channel])
    return refuse(`backward: ${base} already has a later channel than ${i.channel}`)

  const same = mine.filter(([, p]) => p!.channel === i.channel)
  if (same.some(([t]) => i.tags[t] === i.head || i.tagParents?.[t] === i.head))
    return refuse(`no new commits on main since the last ${i.channel} of ${base}`)

  const n = Math.max(0, ...same.map(([, p]) => p!.n)) + 1
  const version = i.channel === 'final' ? base : `${base}-${i.channel}.${n}`
  return {
    ok: true,
    version,
    tag: `v${version}`,
    base,
    predecessors: predecessors(version, Object.keys(i.tags)),
  }
}
