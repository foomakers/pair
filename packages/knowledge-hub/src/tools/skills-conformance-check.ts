/**
 * Skills Conformance Check — static conformance gate for the dataset skill corpus.
 *
 * Enforces the authoring effectiveness standard (story #313, principle 8 "constraints"
 * of contributing/writing-skills) over packages/knowledge-hub/dataset/.skills/:
 *
 *   1. Frontmatter portability — only agentskills.io-core top-level fields
 *      (name, description, license, compatibility, metadata, allowed-tools)
 *      plus the tolerated Pair extension (version, author, kept top-level for
 *      provenance). Assistant-specific fields (e.g. disable-model-invocation)
 *      are portability violations.
 *   2. Size limits — name <= 64 chars, description <= 1024 chars (spec), and
 *      name+description combined <= 1024 chars (Pair's stricter bound).
 *   3. Pointer resolution — relative file links in SKILL.md bodies resolve to
 *      existing files/dirs in the dataset.
 *   4. Catalog counts — every "N skills"/"N-skill" figure stated in next's
 *      SKILL.md matches the real corpus dir count. Hard error, like every other
 *      check here (promoted from WARN once #313/T1 (#325) regenerated next's
 *      catalog to the real, stable count).
 *   5. Entrypoint depth — every `SKILL.md` sits at the registry's ENTRY depth
 *      (`<category>/<name>/SKILL.md`, or the bare `<name>/SKILL.md` meta skill),
 *      never below it. A `SKILL.md` inside a skill's sub-directory (e.g.
 *      `process/review/references/SKILL.md`) installs as CONTENT under the bounded
 *      flatten (#407, ADR-020): no name prefix, no frontmatter `name:` sync, no
 *      skill-name mapping — a skill nobody can invoke, and until this check nothing
 *      saw it (the corpus walk below only reads `<category>/<name>/SKILL.md`, and
 *      the mirror-equality guard derives the installed path from the same
 *      transform, so it agrees with itself). The convention it enforces:
 *      `skill-conventions/nested-sub-documents.md`, authoring rule 1.
 *   6. Skill-local scripts — a skill is portable as ONE folder: every script a
 *      SKILL.md links under `scripts/` ships beside it in the dataset, and every
 *      shipped script has a byte-identical twin under
 *      `.claude/skills/<prefixed-skill>/scripts/`. The markdown mirror guards
 *      (`skill-md-mirror.ts`) are markdown-only by explicit decision, so a script
 *      edited in one copy and not the other was, until this check, a runtime
 *      surprise rather than a red gate (#482).
 *   7. KB prose counts — the skill-count figures restated in the onboarding KB
 *      prose (way-of-working.md, getting-started.md, skills-guide.md) match the
 *      real corpus, across every restated form: the number-before-noun
 *      "N skills"/"N Agent Skills" total, the "(P process + C capability + N
 *      navigator)" breakdown, and the number-after-noun category forms — the
 *      "### <Category> Skills (N)" catalog heading and the "**<Category>** | N"
 *      Skill-Types table cell (defense-in-depth). Closes the recurrence gap
 *      from story #233: a skill-count sweep that misses these prose files leaves
 *      factually-wrong onboarding docs the docs-staleness gate can't catch (it
 *      scans apps/website only).
 *   8. Approval-round signal — every skill of an obliged family (`assess-*`,
 *      `map-*`) that declares an approval round exposes the `$approval` argument
 *      and declares, ON EACH ASKING LINE, an `<!-- approval-round: kind=…; auto=… -->`
 *      marker whose values come from closed enums and whose prose says the same
 *      thing (`skill-conventions/approval-rounds.md`, ADR-021). A declared marker,
 *      not keywords in a layout-derived window: six review rounds of narrowing that
 *      window left the same defect class alive each time, because a window widens
 *      when the prose changes shape instead of failing. Data-driven per skill
 *      present — a new family member is covered the day it lands, with no edit here
 *      and no count anywhere.
 *   9. Installer-representable layout — the source shapes the registry's bounded
 *      flatten cannot represent are refused HERE too, not only by `pair update`.
 *      `copyDirectoryWithTransforms` validates the layout before writing a single
 *      file, so an unrepresentable corpus does not install partially: it installs
 *      as NOTHING. Two shapes, both refused marker-BLIND, mirroring the two
 *      validators the copy runs: a directory SHALLOWER than the entry depth that
 *      holds files directly AND owns a sub-directory (a bare skill with a
 *      `scripts/` folder, a category with a `README.md` beside its skills), and a
 *      directory DEEPER than it that holds files directly while its ancestor at
 *      the entry depth holds none — nothing owns it as content, so it is an entry
 *      too deep (`workflow/shared/lib/util.mjs` with an empty `workflow/shared`).
 *      Check 5 above overlaps the deep shape on `SKILL.md` offenders only and
 *      cannot see the marker-less ones — the gate must not PASS a corpus the
 *      installer refuses (#483 review, rounds 1-2).
 *
 * Runnable as a CLI via `ts-node src/tools/skills-conformance-check.ts`
 * (package script `skills:conformance`). Exit 0 = conformant, Exit 1 = violations.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'

const ROOT = join(__dirname, '..', '..')
export const SKILLS_DIR = join(ROOT, 'dataset', '.skills')

/**
 * The installed skill corpus (`<repo>/.claude/skills`) — the DERIVED copy the
 * skill-local script check compares against. Exported so the gate and its tests
 * resolve the same tree instead of each re-deriving the hop out of the package.
 */
export const INSTALLED_SKILLS_DIR = resolve(ROOT, '..', '..', '.claude', 'skills')

/** A skill's own script folder — the only directory this check's scope covers. */
export const SCRIPTS_DIR = 'scripts'

/**
 * The skills registry's `prefix` from `apps/pair-cli/config.json`. Pinned to
 * `SKILL_COPY_OPTS.prefix` by test rather than imported, for the same reason as
 * `ENTRY_DEPTH`: this gate runs via ts-node before any build, so it stays
 * dependency-free.
 */
export const INSTALLED_PREFIX = 'pair'

// KB onboarding prose that restates skill counts (relative to ROOT). Kept in
// lockstep with the real .skills corpus so a count sweep can't leave stale prose.
const KB_PROSE_FILES = [
  'dataset/.pair/knowledge/way-of-working.md',
  'dataset/.pair/knowledge/getting-started.md',
  'dataset/.pair/knowledge/skills-guide.md',
]

// agentskills.io spec top-level fields
export const SPEC_FIELDS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]
// Tolerated Pair extension: provenance kept top-level (see writing-skills principle 8)
export const PAIR_EXTENSIONS = ['version', 'author']

const NAME_MAX = 64
const DESCRIPTION_MAX = 1024
const COMBINED_MAX = 1024

export interface Frontmatter {
  keys: string[]
  values: Record<string, string>
  body: string
}

export interface RunResult {
  errors: string[]
  skillCount: number
  /** Non-blocking observations surfaced by the checks (see `SkillLocalScriptsResult`). */
  notes: string[]
}

// --- Frontmatter ---

// YAML block-scalar indicator as a value: `|`, `>`, with optional `-`/`+` chomping.
const BLOCK_SCALAR_RE = /^[|>][+-]?$/

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
    (value.startsWith("'") && value.endsWith("'") && value.length > 1)
  return quoted ? value.slice(1, -1) : value
}

// Fold a YAML block scalar into a single measurable string so its real length is
// counted by the size gate (a raw `description: >` line alone is length ~1 and would
// otherwise bypass the ≤1024 check). Consumes indented continuation lines starting at
// `start`; the block ends at the first line dedented to column 0 (next top-level key)
// or at `end`. Returns the joined text and the index to resume top-level parsing from.
function foldBlockScalar(
  lines: string[],
  start: number,
  end: number,
): { text: string; next: number } {
  const parts: string[] = []
  let i = start
  for (; i < end; i++) {
    const line = lines[i] as string
    if (line.trim() === '') {
      parts.push('')
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent === 0) break // dedented to key level — block ended
    parts.push(line.trimStart())
  }
  return { text: parts.join(' ').trim(), next: i }
}

export function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split('\n')
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  const keys: string[] = []
  const values: Record<string, string> = {}
  let i = 1
  while (i < end) {
    const m = (lines[i] as string).match(/^([A-Za-z][A-Za-z0-9_-]*):(.*)$/)
    if (!m) {
      i++ // continuation or nested (indented) line — not a top-level key
      continue
    }
    const key = m[1] as string
    keys.push(key)
    const inline = (m[2] as string).trim()
    if (BLOCK_SCALAR_RE.test(inline)) {
      const folded = foldBlockScalar(lines, i + 1, end)
      values[key] = folded.text
      i = folded.next
    } else {
      values[key] = unquote(inline)
      i++
    }
  }
  return { keys, values, body: lines.slice(end + 1).join('\n') }
}

export function checkFrontmatterFields(keys: string[]): string[] {
  const errors: string[] = []
  const allowed = new Set([...SPEC_FIELDS, ...PAIR_EXTENSIONS])
  for (const key of keys) {
    if (!allowed.has(key)) {
      errors.push(
        `non-portable frontmatter field "${key}" (allowed: spec fields ${SPEC_FIELDS.join(', ')} + tolerated Pair extension ${PAIR_EXTENSIONS.join(', ')})`,
      )
    }
  }
  for (const required of ['name', 'description']) {
    if (!keys.includes(required)) {
      errors.push(`missing required frontmatter field "${required}"`)
    }
  }
  return errors
}

export function checkSizeLimits(name?: string, description?: string): string[] {
  const errors: string[] = []
  const nameLen = (name || '').length
  const descLen = (description || '').length
  // Attribution per principle 8: agentskills.io spec caps name (64) and description
  // (1024) SEPARATELY (hence "spec max"); the combined ≤1024 is PAIR's stricter bound.
  if (nameLen > NAME_MAX) {
    errors.push(`name is ${nameLen} chars (spec max ${NAME_MAX})`)
  }
  if (descLen > DESCRIPTION_MAX) {
    errors.push(`description is ${descLen} chars (spec max ${DESCRIPTION_MAX})`)
  }
  if (nameLen + descLen > COMBINED_MAX) {
    errors.push(
      `name+description is ${nameLen + descLen} chars combined (Pair max ${COMBINED_MAX})`,
    )
  }
  return errors
}

// --- Pointer resolution ---

export function extractLinkTargets(body: string): string[] {
  // Markdown links, excluding fenced code blocks (examples often contain template paths)
  const withoutFences = body.replace(/```[\s\S]*?```/g, '')
  const targets: string[] = []
  for (const m of withoutFences.matchAll(/\]\(([^)]+)\)/g)) {
    targets.push((m[1] as string).split(' ')[0]!.trim())
  }
  return targets
}

export function isCheckableTarget(target: string): boolean {
  if (!target) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false // URL scheme (http:, mailto:, …)
  if (target.startsWith('#')) return false // in-document anchor
  if (target.startsWith('/')) return false // absolute path — install-time, not dataset-relative
  if (/[<>{}*[\]]/.test(target)) return false // placeholder/template path
  if (/\bNNN\b|\bYYYY\b/.test(target)) return false // pattern path (adr-NNN-…, YYYY-MM-DD-…)
  return true
}

export function checkLinks(filePath: string, body: string): string[] {
  const errors: string[] = []
  const dir = dirname(filePath)
  for (const target of extractLinkTargets(body)) {
    if (!isCheckableTarget(target)) continue
    const resolved = resolve(dir, target.split('#')[0]!)
    if (!existsSync(resolved)) {
      errors.push(`broken relative reference "${target}"`)
    }
  }
  return errors
}

// --- Catalog counts ---

export function checkCatalogCounts(nextContent: string, actualCount: number): string[] {
  const mismatches: string[] = []
  for (const m of nextContent.matchAll(/(\d+)[-\s]skills?\b/g)) {
    const stated = parseInt(m[1] as string, 10)
    if (stated !== actualCount) {
      mismatches.push(`next/SKILL.md states "${m[0]}" but the corpus has ${actualCount} skills`)
    }
  }
  return mismatches
}

export interface CategoryCounts {
  total: number
  process: number
  capability: number
  workflow: number
  navigator: number
}

// Bucket the corpus by top-level category dir (process/, capability/, workflow/ —
// the delivery-phase skills the batch engine dispatches to, US-479 — and everything
// else = the navigator meta skills), matching the KB's "P process + C capability +
// W workflow + N navigator" phrasing.
export function countByCategory(files: string[], skillsDir: string): CategoryCounts {
  let process = 0
  let capability = 0
  let workflow = 0
  let navigator = 0
  for (const f of files) {
    const top = relative(skillsDir, f).split(sep)[0]
    if (top === 'process') process++
    else if (top === 'capability') capability++
    else if (top === 'workflow') workflow++
    else navigator++
  }
  return { total: files.length, process, capability, workflow, navigator }
}

// Validates skill-count figures restated in KB onboarding prose against the real
// corpus: the "N skills"/"N Agent Skills" total (never the "(P process + …)"
// component numbers, which are followed by a category word, not "skill") and the
// "(P process + C capability + N navigator)" breakdown.
export function checkProseCounts(rel: string, content: string, counts: CategoryCounts): string[] {
  const errors: string[] = []
  for (const m of content.matchAll(/(\d+)\s+(?:Agent\s+)?[Ss]kills?\b/g)) {
    const stated = parseInt(m[1] as string, 10)
    if (stated !== counts.total) {
      errors.push(`${rel}: states "${m[0]}" but the corpus has ${counts.total} skills`)
    }
  }
  // The workflow term is optional in the phrasing only while the corpus has none: a
  // three-part breakdown against a corpus with workflow skills silently omits a category.
  for (const b of content.matchAll(
    /\((\d+)\s+process\s*\+\s*(\d+)\s+capability\s*(?:\+\s*(\d+)\s+workflow\s*)?\+\s*(\d+)\s+navigator\)/g,
  )) {
    const p = parseInt(b[1] as string, 10)
    const c = parseInt(b[2] as string, 10)
    const w = b[3] === undefined ? 0 : parseInt(b[3] as string, 10)
    const n = parseInt(b[4] as string, 10)
    if (
      p !== counts.process ||
      c !== counts.capability ||
      w !== counts.workflow ||
      n !== counts.navigator
    ) {
      const wPart = counts.workflow ? ` + ${counts.workflow} workflow` : ''
      errors.push(
        `${rel}: breakdown "${b[0]}" does not match corpus (${counts.process} process + ${counts.capability} capability${wPart} + ${counts.navigator} navigator)`,
      )
    }
  }
  return errors
}

// Validates the number-after-noun category-count forms restated in KB prose —
// the "### <Category> Skills (N)" catalog heading and the "**<Category>** | N"
// Skill-Types table cell — against the real per-category corpus counts. This is
// the defense-in-depth complement to checkProseCounts (which covers the
// number-before-noun "N skills" total and the "(P process + …)" breakdown). Only
// the three top-level category labels are matched; subcategory groupings (e.g.
// "Assessment Skills (9)") carry no corpus counterpart and are left untouched.
export function checkCategoryLabelCounts(
  rel: string,
  content: string,
  counts: CategoryCounts,
): string[] {
  const errors: string[] = []
  const expected: Record<string, number> = {
    Process: counts.process,
    Capability: counts.capability,
    Workflow: counts.workflow,
    Navigator: counts.navigator,
  }
  const forms: Array<{ re: RegExp; kind: string }> = [
    { re: /\b(Process|Capability|Workflow|Navigator)\s+Skills\s*\((\d+)\)/g, kind: 'heading' },
    { re: /\*\*(Process|Capability|Workflow|Navigator)\*\*\s*\|\s*(\d+)\b/g, kind: 'table cell' },
  ]
  for (const { re, kind } of forms) {
    for (const m of content.matchAll(re)) {
      const category = m[1] as string
      const stated = parseInt(m[2] as string, 10)
      const want = expected[category] as number
      if (stated !== want) {
        errors.push(
          `${rel}: ${kind} "${m[0]}" states ${stated} but the corpus has ${want} ${category.toLowerCase()} skills`,
        )
      }
    }
  }
  return errors
}

// --- Approval-round signal ($approval) ---

/**
 * The composable families the approval-rounds convention obliges
 * (`skill-conventions/approval-rounds.md`): a skill whose directory name starts
 * with one of these prefixes must honour `$approval` for every approval round it
 * declares, so a caller that cannot ask states its depth ONCE instead of
 * enumerating, per composed skill, a round it happens to know about.
 *
 * A LIST OF PREFIXES, deliberately — not a list of skills and not a count. A new
 * `assess-…`/`map-…` member is covered the day it lands, with no edit here; a
 * third family adopting the convention is one entry.
 */
export const APPROVAL_SIGNAL_FAMILIES = ['assess-', 'map-']

/**
 * Phrasings that mean "this step stops and asks a human to accept or pick
 * something" — an APPROVAL round and a CHOICE round alike. Both block an
 * autonomous run identically, and a tie the skill presents without resolving is
 * the same hang as a confirmation it waits on.
 *
 * A HEURISTIC OVER PROSE, and the one soft spot of this check (recorded as such
 * in ADR-021's trade-offs): a round phrased outside this set is invisible here.
 * Kept deliberately narrow instead of matching a bare /approval/, which would
 * flag every sentence merely MENTIONING one — `/assess-stack`'s "on approval,
 * /review persists…" describes the caller's act, and `/map-contexts`' "gate at
 * approval" is the judgement gate the signal must NOT suppress.
 *
 * The choice half (last three) closes a real hole rather than a hypothetical: the
 * first pass shipped three skills whose tie-break round said "present top 2 with
 * trade-off analysis" / "ask developer to choose", and the gate stayed green over
 * all three. Matched on the VERB, never the noun — "Returns the developer
 * decision" reports a decision, it does not ask for one, and a guard that flags
 * prose nobody can qualify only teaches authors to route around it.
 */
export const APPROVAL_ROUND_PATTERNS: RegExp[] = [
  /\bdevelopers?\s+(?:approves?|confirms?)\b/i,
  /\bconfirm[a-z]*\b[^.\n]{0,60}?\bwith the developer\b/i,
  /\bask\w*\s+(?:the developer\s+)?for confirmation\b/i,
  /\bconfirmation prompt\b/i,
  /^\s*>?\s*Approve\b[^\n]*\?/,
  /\brequires?\s+human approval\b/i,
  /\bask\w*\s+(?:the\s+)?developers?\s+to\s+(?:choose|pick|decide|select)\b/i,
  /\bpresent\w*\b[^.\n]{0,60}\b(?:top\s*\d+|both)\b[^.\n]{0,80}\btrade-?off/i,
  /\bdevelopers?\s+(?:chooses?|decides?|picks?|selects?)\b/i,
]

// The `$approval` token used to BE the qualification, read out of the step block.
// It is prose now, not a contract: the marker below qualifies a round, per line.

/**
 * THE DECLARED MARKER — the contract that replaced six rounds of text windows.
 *
 * Every approval round carries, ON ITS OWN LINE, a marker naming what kind of
 * round it is and how `auto` resolves it:
 *
 *     <!-- approval-round: kind=choice; auto=project-state-then-unresolved -->
 *
 * Why a marker rather than a seventh, narrower window: every previous guard read
 * keywords out of a span computed from markdown LAYOUT — the file, the step block,
 * a character window, a sentence. Layout is not contract, so when the prose changed
 * shape the guard did not fail, it widened, and an unrelated line satisfied it. The
 * same defect class survived rounds 5, 6 and 7. Here attachment is LINE IDENTITY
 * and `auto` is a CLOSED ENUM, which changes the failure mode: a tie resolved by
 * document order is not "a phrasing the regex missed", it is a resolution that
 * cannot be spelled. See `skill-conventions/approval-rounds.md` § Declared marker.
 */
export const ROUND_KINDS = ['confirm', 'keep-or-redo', 'choice', 'gate'] as const
export const AUTO_RESOLUTIONS = [
  'accept',
  'keep',
  'project-state-then-unresolved',
  'hand-back',
  'halt',
] as const

export type RoundKind = (typeof ROUND_KINDS)[number]
export type AutoResolution = (typeof AUTO_RESOLUTIONS)[number]

export interface RoundMarker {
  kind: RoundKind | undefined
  auto: AutoResolution | undefined
  /** The offending `field=value` when one is present but outside its enum. */
  malformed?: string
}

const MARKER = /<!--\s*approval-round:\s*([^>]*?)\s*-->/

/**
 * The marker declared on `line`, or `undefined` when the line carries none.
 *
 * A field present but outside its enum yields `malformed` — never a silent
 * pass-through and never an empty result. Fail closed: a guard whose parser
 * degrades to "nothing to check" is not a guard (the family invariant this module
 * already applies to `alternatives()` in the shape tests).
 */
export function parseRoundMarker(line: string): RoundMarker | undefined {
  const body = MARKER.exec(line)?.[1]
  if (body === undefined) return undefined

  const field = (name: string): string | undefined =>
    new RegExp(`\\b${name}=([a-z-]+)`).exec(body)?.[1]

  const rawKind = field('kind')
  const rawAuto = field('auto')
  const kind = ROUND_KINDS.find(k => k === rawKind)
  const auto = AUTO_RESOLUTIONS.find(a => a === rawAuto)

  const malformed =
    rawKind !== undefined && kind === undefined
      ? `kind=${rawKind}`
      : rawAuto !== undefined && auto === undefined
        ? `auto=${rawAuto}`
        : undefined

  return malformed ? { kind, auto, malformed } : { kind, auto }
}

/** A claim that a tie is settled by where something appears in a document. */
const DOCUMENT_ORDER_CLAIM = /\b(?:listed first|first listed|lists? first|reaches first)\b/i

export interface ApprovalRound {
  /** 1-based line number in the file the content came from. */
  line: number
  text: string
  /**
   * True iff THIS LINE declares a complete marker. Round 7's Major was that this
   * used to be read off the step block, so one qualified round granted immunity to
   * every other round in the same block — a continuation line adding a fresh choice
   * round inherited a green. Per line, no inheritance.
   */
  qualified: boolean
  /** The marker declared on this line, when there is one. */
  marker?: RoundMarker
}

/**
 * True iff this dataset-relative markdown path belongs to an obliged family.
 *
 * Keyed on the segment at the registry's ENTRY depth — the skill's own directory
 * name — not on the immediate parent, so a **sub-doc** resolves to its skill
 * (`capability/assess-x/references/deep.md` → `assess-x`) instead of to
 * `references`, which would silently exempt every disclosed detail file.
 */
export function isApprovalSignalFamily(rel: string): boolean {
  const parts = rel.split(sep).join('/').split('/')
  const skillDirName = parts.length >= 2 ? (parts[1] as string) : (parts[0] as string)
  return APPROVAL_SIGNAL_FAMILIES.some(prefix => skillDirName.startsWith(prefix))
}

/**
 * Which lines sit inside a fenced block — the ONLY layout fact these checks still
 * consult, and only to exclude a printed sample from being read as a step that asks.
 *
 * The step-block span (`blockStart`/`blockAt`) that used to live here is gone with
 * the windows that needed it: every check is now per line, keyed on the declared
 * marker. That deletion is the point, not a side effect — a span this module no
 * longer computes is a span a future guard cannot silently widen.
 */
function scanFences(lines: string[]): boolean[] {
  const inFence: boolean[] = []
  let fence = false
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fence = !fence
    inFence[i] = fence
  })
  return inFence
}

/**
 * Every approval round in `content`, each tagged with whether the step it sits in
 * names `$approval`. Fenced code blocks are skipped — an Output Format sample is
 * not a step that asks.
 */
export function findApprovalRounds(content: string): ApprovalRound[] {
  const lines = content.split('\n')
  const inFence = scanFences(lines)

  const rounds: ApprovalRound[] = []
  lines.forEach((line, i) => {
    if (inFence[i]) return
    // A line is a round if it ASKS (phrase detector, the safety net for an unmarked
    // ask) or if it DECLARES one (marker, the contract). The second half matters:
    // it lets a round the phrase set does not recognise still be governed, so the
    // heuristic's blind spots no longer decide what is checked.
    const marker = parseRoundMarker(line)
    if (!APPROVAL_ROUND_PATTERNS.some(p => p.test(line)) && marker === undefined) return
    rounds.push({
      line: i + 1,
      text: line.trim(),
      // Per LINE, never inherited from the step: see ApprovaRound.qualified.
      qualified: marker?.kind !== undefined && marker.auto !== undefined,
      ...(marker ? { marker } : {}),
    })
  })
  return rounds
}

/**
 * Vocabulary that describes what `auto` does, and therefore belongs INSIDE a
 * round's `Under auto` clause — never in the part a guided run reads.
 *
 * Kept to phrases that are directives about the non-interactive resolution, not to
 * every word the clause happens to use: the test of a candidate here is "would a
 * guided reader change what they do after reading it?".
 */
export const AUTO_ONLY_DIRECTIVES: RegExp[] = [
  /\bname the leader\b/i,
  /\bresolved deterministically\b/i,
  /\baccepted as-is\b/i,
  /\bkept and reported\b/i,
  /\bnever asked\b/i,
]

/** Where a round's non-interactive branch begins. */
const AUTO_CLAUSE = /under\s+`?\$?approval:?\s*auto`?|`\$approval:\s*auto`|under\s+`auto`/i

export interface GuidedDrift {
  /** 1-based line of the approval round whose guided half drifted. */
  line: number
  /** The guided-half text that carries the directive. */
  text: string
  /** The offending phrase. */
  directive: string
}

/**
 * Rounds whose GUIDED half carries `auto`-only text — the AC2 regression class.
 *
 * Qualifying a round is supposed to be behaviour-preserving for a caller that
 * passes nothing: `interactive` is what an omitted `$approval` resolves to, so the
 * qualified step must still say exactly what the step said before. That property
 * is easy to lose by putting the new sentence on the wrong side of the clause, and
 * it happened: a near-tie round gained "name the leader" ahead of its `Under auto`
 * clause, which changed the question the guided interview asks — a proposal to
 * approve instead of two options to choose between.
 *
 * Read per ROUND BLOCK, not per line, so a clause continued on the next line (the
 * `map-*` shape: prompt blockquote, then the `auto` paragraph) is correctly seen as
 * part of the same step. A block with no `Under auto` clause at all is checked
 * whole — auto-only text with nothing scoping it is the same defect, unscoped.
 */
export function findGuidedDrift(content: string): GuidedDrift[] {
  const drifts: GuidedDrift[] = []
  for (const round of findApprovalRounds(content)) {
    // PER LINE, and fail-closed. Round 7: reading the STEP BLOCK and cutting at its
    // FIRST `auto` clause left everything after that clause unexamined — a second
    // round added as a continuation line was invisible to this check as well as to
    // the marker one. A round's guided half is the part of ITS OWN line before ITS
    // OWN `auto` clause; a line with auto-only vocabulary and no clause on it has
    // nothing scoping that vocabulary, which is the same defect unscoped.
    const line = round.text
    const clauseAt = line.search(AUTO_CLAUSE)
    const guidedHalf = clauseAt === -1 ? line : line.slice(0, clauseAt)
    for (const directive of AUTO_ONLY_DIRECTIVES) {
      const hit = guidedHalf.match(directive)
      if (hit) {
        drifts.push({ line: round.line, text: guidedHalf.trim(), directive: hit[0] })
        break
      }
    }
  }
  return drifts
}

/**
 * The prose on a round's own line must describe the resolution its marker declares.
 *
 * This is the half a marker alone cannot give: an enum stops a bad resolution being
 * *declarable*, and this stops a declared one being *contradicted* by the sentence
 * next to it. Anchored to the marker — the contract — never to a window around it,
 * which is what made every earlier version of these checks satisfiable by a
 * neighbour.
 */
const RESOLUTION_PROSE: Record<AutoResolution, (line: string) => string[]> = {
  accept: () => [],
  keep: line => (/keep|kept/i.test(line) ? [] : ['the line never says the recorded value is kept']),
  'project-state-then-unresolved': line => {
    const missing: string[] = []
    if (!/project state/i.test(line)) {
      missing.push('the line never names project state as what settles the tie')
    }
    if (!/no proposal|unresolved/i.test(line)) {
      missing.push(
        'the line never says what happens when project state is silent (no proposal / ' +
          'reported unresolved)',
      )
    }
    const order = DOCUMENT_ORDER_CLAIM.exec(line)
    if (order) {
      missing.push(
        `"${order[0]}" resolves a tie by DOCUMENT ORDER, which is not a resolution this ` +
          `convention has — two enumerations of the same candidates routinely disagree, so the ` +
          `same tie would settle two ways`,
      )
    }
    return missing
  },
  'hand-back': line =>
    /caller/i.test(line) ? [] : ['the line never names the caller the question goes back to'],
  halt: line => (/HALT/.test(line) ? [] : ['the line does not say the run HALTs']),
}

function checkDeclaredResolution(
  rel: string,
  round: ApprovalRound,
  auto: AutoResolution,
): string[] {
  return RESOLUTION_PROSE[auto](round.text).map(
    problem => `${rel}:${round.line}: declares \`auto=${auto}\` but ${problem}`,
  )
}

/**
 * One round's marker obligations: present, well-formed, complete, and matched by the
 * prose on its own line. Fail closed at each step — an absent, malformed or partial
 * marker is a violation, never an unknown that resolves to "fine".
 */
function checkRoundMarker(rel: string, round: ApprovalRound): string[] {
  const at = `${rel}:${round.line}`
  const marker = round.marker
  if (marker === undefined) {
    return [
      `${at}: "${round.text.slice(0, 90)}" asks for approval and carries no approval-round ` +
        `marker — add \`<!-- approval-round: kind=…; auto=… -->\` to THIS line ` +
        `(skill-conventions/approval-rounds.md § Declared marker). A marker on a neighbouring ` +
        `line does not cover it.`,
    ]
  }
  if (marker.malformed !== undefined) {
    return [
      `${at}: \`${marker.malformed}\` is not one of the declared values — ` +
        `kind ∈ {${ROUND_KINDS.join(', ')}}, auto ∈ {${AUTO_RESOLUTIONS.join(', ')}}`,
    ]
  }
  if (marker.kind === undefined || marker.auto === undefined) {
    return [
      `${at}: the approval-round marker is incomplete — both \`kind=\` and \`auto=\` are ` +
        `required, got kind=${marker.kind ?? '(none)'} auto=${marker.auto ?? '(none)'}`,
    ]
  }
  return checkDeclaredResolution(rel, round, marker.auto)
}

/**
 * The obliged family's two mechanical obligations, checked per skill PRESENT:
 * an `$approval` argument row, and every approval round qualified with the signal.
 *
 * Defect-driven, not name-driven: a family member with no approval round owes
 * nothing (`/assess-cost` and `/assess-coupling` have none), so the corpus never
 * carries an argument no step honours. The day either grows a round, both
 * obligations apply to it with no edit here.
 *
 * `ownerContent` is where the ARGUMENT-level obligations are checked, and it
 * differs from `content` for a **sub-doc**: a disclosed detail file
 * (`references/*.md`, `quick-mode-defaults.md`-style siblings) can declare a round
 * but has no Arguments table of its own — the owning `SKILL.md` carries it. Rounds
 * are checked in the file they live in, the argument row in the file that declares
 * arguments. Defaults to `content`, so a `SKILL.md` is its own owner.
 */
export function checkApprovalSignal(
  rel: string,
  content: string,
  ownerContent: string = content,
): string[] {
  if (!isApprovalSignalFamily(rel)) return []
  const rounds = findApprovalRounds(content)
  if (rounds.length === 0) return []

  const errors: string[] = []
  if (!/\|\s*`\$approval`/.test(ownerContent)) {
    errors.push(
      `${rel}: declares ${rounds.length} approval round(s) but no \`$approval\` argument row — ` +
        `a caller cannot pass the signal it is obliged to honour ` +
        `(skill-conventions/approval-rounds.md)`,
    )
  }
  if (!ownerContent.includes('approval-rounds.md')) {
    errors.push(
      `${rel}: declares an approval round but never points at ` +
        `skill-conventions/approval-rounds.md — the convention is the single statement of the signal`,
    )
  }
  for (const round of rounds) errors.push(...checkRoundMarker(rel, round))
  for (const drift of findGuidedDrift(content)) {
    errors.push(
      `${rel}:${drift.line}: "${drift.directive}" sits in the GUIDED half of an approval ` +
        `round — move it inside the \`Under \`auto\`\` clause. Qualifying a round must not ` +
        `change what a caller that passes nothing reads`,
    )
  }
  return errors
}

/**
 * The same check over a family skill's **sub-docs** — every markdown the skill's
 * directory contributes besides its `SKILL.md`.
 *
 * Needed because progressive disclosure is a shipped layout in this corpus
 * (`bootstrap/quick-mode-defaults.md`, `review/merge-and-cascade.md`, a skill's
 * `references/`): a family member could otherwise move its round into a sub-doc
 * and pass the gate, which is precisely the "the family grows and the guarantee
 * quietly stops holding" failure the convention exists to prevent.
 *
 * Takes the RECURSIVE walk, like `checkEntrypointDepth`, and resolves each
 * sub-doc's OWNING `SKILL.md` so the argument-row obligation is checked where
 * arguments are declared — a sub-doc has no Arguments table of its own.
 */
export function checkApprovalSignalInSubDocs(skillsDir: string, markdownFiles: string[]): string[] {
  const errors: string[] = []
  for (const file of markdownFiles) {
    if (basename(file) === 'SKILL.md') continue
    const rel = relative(skillsDir, file).split(sep).join('/')
    if (!isApprovalSignalFamily(rel)) continue
    const parts = rel.split('/')
    const owner = join(skillsDir, parts[0] as string, parts[1] as string, 'SKILL.md')
    if (!existsSync(owner)) continue // an orphan sub-doc: the depth check owns that
    errors.push(
      ...checkApprovalSignal(rel, readFileSync(file, 'utf-8'), readFileSync(owner, 'utf-8')),
    )
  }
  return errors
}

// --- Entrypoint depth ---

/**
 * The `skills` registry's ENTRY depth in directory segments: `<category>/<name>`
 * (2) or the bare meta skill `<name>` (1). Same fact as `flattenDepth` in the
 * registry config, pinned to `SKILL_COPY_OPTS` by test rather than imported, so
 * this gate script stays dependency-free (it runs via ts-node before any build).
 */
export const ENTRY_DEPTH = 2

/**
 * Every `SKILL.md` must sit AT the entry depth, never below it.
 *
 * A `SKILL.md` inside a skill's sub-directory (`process/review/references/SKILL.md`)
 * is legitimately-shaped CONTENT for the copy pipeline's layout guards — telling it
 * apart would need the marker-file knowledge ADR-020 keeps out of a transform four
 * non-skill registries share. So it installs at
 * `pair-process-review/references/SKILL.md`: no prefix, frontmatter `name:` left
 * unsynced, absent from the skill-name map — a skill nobody can invoke, with no
 * signal anywhere. Static corpus knowledge is the right layer for it; this is that
 * check (`nested-sub-documents.md`, authoring rule 1).
 *
 * Takes the RECURSIVE markdown walk, not `collectSkillFiles`: the whole point is
 * to see files the entry walk never reaches.
 */
export function checkEntrypointDepth(skillsDir: string, markdownFiles: string[]): string[] {
  const errors: string[] = []
  for (const file of markdownFiles) {
    if (basename(file) !== 'SKILL.md') continue
    const rel = relative(skillsDir, file)
    const depth = rel.split(sep).length - 1
    if (depth >= 1 && depth <= ENTRY_DEPTH) continue
    const where =
      depth > ENTRY_DEPTH
        ? `below the entry depth, so it installs as content inside another skill`
        : `at the registry root, so it installs as a loose file with no skill directory`
    errors.push(
      `${rel}: SKILL.md is ${depth} directory level(s) deep — ${where}. ` +
        `A skill entrypoint must sit at the entry depth (1..${ENTRY_DEPTH}: '<category>/<name>/SKILL.md', ` +
        `or '<name>/SKILL.md' for the meta skill): no prefix, no frontmatter name sync and no ` +
        `skill-name mapping are applied anywhere else, so the skill would be non-invocable. ` +
        `Move it to the skill root, or rename it if it is a sub-document.`,
    )
  }
  return errors
}

// --- Installer-representable layout (bounded-flatten parity) ---

/**
 * Whether a symlinked entry is one the installer would copy — the local
 * reduction of content-ops' `entryIsCopyable` + `resolvesWithin`, whose four
 * outcomes this reproduces: a link escaping the corpus, a link to a directory
 * and a link that cannot be dereferenced are all SKIPPED; a contained link to a
 * file is copied, and (because `readdir` never follows a link to classify it)
 * counts as a FILE, never as a directory to descend into.
 *
 * Order differs from the producer's — stat first, containment second — because
 * `statSync` throwing already covers the broken/ELOOP case the producer reaches
 * via `statOrNull`; the verdict is identical on every one of the four.
 */
function symlinkIsInstallable(path: string, root: string): boolean {
  try {
    if (statSync(path).isDirectory()) return false
  } catch {
    return false // broken link, or an ELOOP cycle: never copied
  }
  let physicalRoot = root
  try {
    physicalRoot = realpathSync(root)
  } catch {
    /* an unreadable root is compared unresolved, as the producer does */
  }
  const rel = relative(physicalRoot, realpathSync(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Every file `pair update` would copy out of `skillsDir`, as POSIX paths
 * relative to it, collected in the producer's own traversal order.
 *
 * Deliberately NOT the `SKILL.md` walk (`collectSkillFiles`) and not the
 * markdown walk: the layout rule below is marker-BLIND and extension-blind, so
 * it has to see the same flat file list `copyDirectoryWithTransforms` validates
 * — a `scripts/go.mjs` is what makes `loop/` ambiguous, and a walk that only
 * knows about `SKILL.md` cannot see it.
 */
export function collectInstallableDatasetFiles(skillsDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isSymbolicLink() && !symlinkIsInstallable(p, skillsDir)) continue
      if (e.isDirectory()) walk(p)
      else files.push(relative(skillsDir, p).split(sep).join('/'))
    }
  }
  walk(skillsDir)
  return files
}

/**
 * Two facts about the tree's shape, read off the flat installable file list
 * exactly as the producer's `collectDirShapes` does: which directories hold
 * files DIRECTLY, and for each directory one example sub-directory (ancestors
 * included, since a file list only ever names leaf directories). The registry
 * ROOT is exempt, as it is there (`dir === '.'`).
 *
 * Its own function only to keep each rule below under the 50-line / complexity
 * ceilings the lint gate enforces — both rules read the SAME shape, so
 * collecting it twice would be the real duplication.
 */
function collectLayoutShapes(skillsDir: string): {
  dirsWithOwnFiles: Set<string>
  firstChildDirOf: Map<string, string>
} {
  const dirsWithOwnFiles = new Set<string>()
  const firstChildDirOf = new Map<string, string>()
  for (const file of collectInstallableDatasetFiles(skillsDir)) {
    const cut = file.lastIndexOf('/')
    if (cut === -1) continue // a ROOT file: never an entry, hence exempt
    const dir = file.slice(0, cut)
    dirsWithOwnFiles.add(dir)
    const segments = dir.split('/')
    for (let i = 1; i < segments.length; i++) {
      const parent = segments.slice(0, i).join('/')
      if (!firstChildDirOf.has(parent)) {
        firstChildDirOf.set(parent, segments.slice(0, i + 1).join('/'))
      }
    }
  }
  return { dirsWithOwnFiles, firstChildDirOf }
}

/** The SHALLOW rule — the gate's half of `validateNoShallowEntryWithSubdir`. */
function shallowEntryWithSubdirErrors(
  dirsWithOwnFiles: Set<string>,
  firstChildDirOf: Map<string, string>,
): string[] {
  const errors: string[] = []
  for (const dir of dirsWithOwnFiles) {
    const depth = dir.split('/').length
    if (depth >= ENTRY_DEPTH) continue
    const child = firstChildDirOf.get(dir)
    if (child === undefined) continue
    errors.push(
      `${dir}: Ambiguous layout for a bounded flatten (flattenDepth=${ENTRY_DEPTH}): ` +
        `'${dir}' is ${depth} segment(s) deep, holds files directly AND owns the sub-directory ` +
        `'${child}'. '${child}' is ${child.split('/').length} segment(s) deep, so it cannot be ` +
        `told apart from a real entry and would install as a sibling entry instead of inside ` +
        `'${dir}'. Move '${dir}' ${ENTRY_DEPTH - depth} level(s) deeper (e.g. under a category ` +
        `directory), or move/remove the file(s) held directly by '${dir}' (a category directory ` +
        `must hold sub-directories only), or drop the sub-directory. ` +
        `\`pair update\` refuses this layout before copying anything, so the corpus installs as ` +
        `NOTHING — not even the skills that are shaped correctly.`,
    )
  }
  return errors
}

/**
 * The DEEP rule — the gate's half of `validateNoDeepEntry`: a directory below
 * the entry depth holding files directly is CONTENT iff its ancestor at exactly
 * the entry depth holds files of its own. Marker-BLIND on both the offender and
 * the ancestor, so it catches the ones `checkEntrypointDepth` cannot see.
 */
function deepEntryErrors(dirsWithOwnFiles: Set<string>): string[] {
  const errors: string[] = []
  for (const dir of dirsWithOwnFiles) {
    const segments = dir.split('/')
    if (segments.length <= ENTRY_DEPTH) continue
    const ancestor = segments.slice(0, ENTRY_DEPTH).join('/')
    if (dirsWithOwnFiles.has(ancestor)) continue // content of a real entry
    errors.push(
      `${dir}: Ambiguous layout for a bounded flatten (flattenDepth=${ENTRY_DEPTH}): ` +
        `'${dir}' is ${segments.length} segment(s) deep and holds files directly, but its ` +
        `ancestor at depth ${ENTRY_DEPTH} ('${ancestor}') holds none — so nothing owns it as ` +
        `content and it is an entry too deep. It would install at a path with no entry root, ` +
        `invisible to the skill loader, with an unsynced frontmatter name and no skill-name ` +
        `mapping. Move it to depth ${ENTRY_DEPTH}, or give '${ancestor}' files of its own IF ` +
        `'${dir}' is meant to be CONTENT of it — note that an entrypoint file inside content ` +
        `installs as content, not as an entry, i.e. with exactly the symptoms above. ` +
        `\`pair update\` refuses this layout before copying anything, so the corpus installs as ` +
        `NOTHING — not even the skills that are shaped correctly.`,
    )
  }
  return errors
}

/**
 * Refuses the source layouts the bounded flatten cannot represent — the gate's
 * half of a parity the installer already enforces, on BOTH sides of the entry
 * depth.
 *
 * `pair update` installs this corpus through `copyDirectoryWithTransforms` under
 * the registry's `flatten: true, flattenDepth: 2, prefix: 'pair'`, and that copy
 * VALIDATES the source layout before writing a single file
 * (`content-ops/src/ops/copy/layout-validation.ts`,
 * `validateNoShallowEntryWithSubdir` and `validateNoDeepEntry`). So a layout it
 * cannot represent is not partially installed: it throws, and the WHOLE corpus —
 * every skill — installs as nothing. A gate that PASSes such a corpus is a green
 * light on an install that yields nothing for anyone, which is why this check
 * exists rather than being left to the installer: the gate is what a maintainer
 * runs before the corpus ever reaches a user.
 *
 * The two rules, re-derived here, both marker-BLIND by construction (ADR-020
 * keeps `SKILL.md` knowledge out of a transform four non-skill registries share):
 *
 *   SHALLOW — a directory shallower than the entry depth that holds files
 *   DIRECTLY and also owns a sub-directory is ambiguous, because that
 *   sub-directory sits at exactly the entry depth and would install as a sibling
 *   entry instead of as content. A category directory holding a `README.md`
 *   beside its skills is refused too, and a bare skill (`loop/SKILL.md`) may
 *   therefore own no sub-directory at all, `scripts/` included.
 *
 *   DEEP — a directory DEEPER than the entry depth that holds files DIRECTLY is
 *   legitimate CONTENT of an entry iff its ancestor at EXACTLY the entry depth
 *   holds files of its own; that ancestor is the entry the content belongs to.
 *   With no such owner, nothing installs it as content and it is an entry too
 *   deep. Neither side of that test may consult a marker: `capability/x/sub`
 *   under an entry holding only a `notes.md` is legal content, and
 *   `capability/sub/foo/notes.md` with an empty `capability/sub` is refused even
 *   though no `SKILL.md` is anywhere near it. Nor may it test the immediate
 *   PARENT instead of the ancestor at the entry depth —
 *   `capability/loop/references/deep` is fine while `capability/loop/references`
 *   itself holds no file. `checkEntrypointDepth` above overlaps this rule on
 *   marker-BEARING offenders only (`if (basename(file) !== 'SKILL.md') continue`)
 *   and is not its owner: it cannot see the marker-less ones at all.
 *
 * The registry ROOT is exempt from both: its files are copied straight to the
 * destination root and are never entries (`collectDirShapes`' `dir === '.'`).
 *
 * Re-implemented rather than imported, for the same reason as `ENTRY_DEPTH` and
 * `INSTALLED_PREFIX`: this gate runs via ts-node before any build, so it stays
 * dependency-free. What is pinned by test is therefore the VERDICT, not the
 * wording — the suite drives the real `copyDirectoryWithTransforms` over the
 * same fixtures and asserts `runChecks(...).errors.length > 0` IFF that pipeline
 * throws, in both directions, so neither an under- nor an over-correction here
 * can pass.
 *
 * ADDITIVE on purpose: the layout is reported, never un-collected. Dropping the
 * offending entrypoints from the corpus walk instead would reinstate the silent
 * drop #482 set out to close — the same skills unchecked, with no error at all.
 */
export function checkInstallableLayout(skillsDir: string): string[] {
  const { dirsWithOwnFiles, firstChildDirOf } = collectLayoutShapes(skillsDir)
  return [
    ...shallowEntryWithSubdirErrors(dirsWithOwnFiles, firstChildDirOf),
    ...deepEntryErrors(dirsWithOwnFiles),
  ]
}

// --- Skill-local scripts ---

export interface SkillLocalScriptsResult {
  /** Conformance violations. Non-empty ⇒ the gate exits 1. */
  errors: string[]
  /** Non-blocking observations (today: a checkout with no installed corpus). */
  notes: string[]
}

/**
 * Installed directory name for a dataset skill dir
 * (`workflow/red-seal` → `pair-workflow-red-seal`, `next` → `pair-next`).
 *
 * The registry flattens with `flattenDepth: 2` and prefixes with `pair`, and
 * `checkEntrypointDepth` already guarantees no skill dir is deeper than
 * `ENTRY_DEPTH` — so joining every segment with `-` IS the bounded flatten here,
 * not an approximation of it. A test pins this against the real
 * `transformPath`-backed `installedSkillDir` for every dir in the live corpus,
 * so a change to the copy pipeline's naming fails loudly instead of drifting.
 */
export function installedSkillDirName(datasetSkillDir: string): string {
  return `${INSTALLED_PREFIX}-${datasetSkillDir.split('/').join('-')}`
}

/** Every file under a skill's `scripts/`, recursively, as posix paths relative to it. */
function collectScriptFiles(scriptsRoot: string): string[] {
  const found: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(join(dir, e.name), rel)
      else found.push(rel)
    }
  }
  walk(scriptsRoot, '')
  return found.sort()
}

/** The skill-relative target of a `scripts/…` link, or null when out of scope. */
function skillLocalScriptTarget(target: string): string | null {
  if (!isCheckableTarget(target)) return null
  const withoutAnchor = (target.split('#')[0] as string).replace(/^\.\//, '')
  if (withoutAnchor === SCRIPTS_DIR || withoutAnchor === `${SCRIPTS_DIR}/`) return null
  return withoutAnchor.startsWith(`${SCRIPTS_DIR}/`) ? withoutAnchor : null
}

/** 1. Every `scripts/…` target a SKILL.md links must EXIST beside it in the dataset. */
function checkLinkedScriptsShip(skillFile: string, skillDir: string, skillRel: string): string[] {
  const errors: string[] = []
  const fm = parseFrontmatter(readFileSync(skillFile, 'utf-8'))
  for (const target of fm ? extractLinkTargets(fm.body) : []) {
    const scriptRel = skillLocalScriptTarget(target)
    if (scriptRel === null) continue
    if (existsSync(resolve(skillDir, scriptRel))) continue
    errors.push(
      `${skillRel}/SKILL.md: links skill-local script "${target}" but ` +
        `${skillRel}/${scriptRel} does not exist — a skill must ship every script it links.`,
    )
  }
  return errors
}

/**
 * One side of the pair: its bytes, or the reason THIS side could not be read.
 * Kept per-side because the errno cannot identify the side on its own — `EISDIR`
 * ("illegal operation on a directory, read") carries no path at all, and `EACCES`
 * carries an absolute one, not the skill-relative path a maintainer greps for.
 */
type SideRead = { readonly bytes: Buffer } | { readonly failure: string }

function readSide(file: string): SideRead {
  try {
    return { bytes: readFileSync(file) }
  } catch (e) {
    return { failure: e instanceof Error ? e.message : String(e) }
  }
}

/** The failing side leads the row; the other is still named, so the pair stays legible. */
function unreadableRow(failedRel: string, otherRel: string, reason: string): string {
  return `${failedRel}: unreadable — cannot compare with ${otherRel}: ${reason}`
}

/** The one comparison, kept apart so the walk above stays a walk. */
function compareTwin(
  datasetFile: string,
  installedFile: string,
  names: [string, string],
): string[] {
  const [datasetRel, installedRel] = names
  if (!existsSync(installedFile)) {
    return [
      `${datasetRel}: installed twin missing — ${installedRel} is not installed. ` +
        `The dataset copy is canonical; re-run the skills sync to derive it.`,
    ]
  }
  // Each side is read in its own try so the row names the copy that ACTUALLY
  // threw: sending a maintainer to the readable canonical script while the
  // broken derived twin goes unnamed is worse than no message at all. Both
  // unreadable ⇒ ONE row for the pair, led by the first side that threw.
  const datasetRead = readSide(datasetFile)
  if ('failure' in datasetRead) {
    return [unreadableRow(datasetRel, installedRel, datasetRead.failure)]
  }
  const installedRead = readSide(installedFile)
  if ('failure' in installedRead) {
    return [unreadableRow(installedRel, datasetRel, installedRead.failure)]
  }
  if (datasetRead.bytes.equals(installedRead.bytes)) return []
  return [
    `${datasetRel}: installed twin drifted — ${installedRel} differs byte-for-byte. ` +
      `The dataset copy is canonical; re-run the skills sync to derive it.`,
  ]
}

/** 2. Every script the dataset ships must have a byte-identical installed twin. */
function checkScriptTwins(
  skillDir: string,
  skillRel: string,
  installedSkillsDir: string,
): string[] {
  const scriptsDir = join(skillDir, SCRIPTS_DIR)
  if (!existsSync(scriptsDir)) return []

  const errors: string[] = []
  for (const rel of collectScriptFiles(scriptsDir)) {
    const installedRel = `${installedSkillDirName(skillRel)}/${SCRIPTS_DIR}/${rel}`
    errors.push(
      ...compareTwin(
        resolve(scriptsDir, rel),
        join(installedSkillsDir, ...installedRel.split('/')),
        [`${skillRel}/${SCRIPTS_DIR}/${rel}`, installedRel],
      ),
    )
  }
  return errors
}

/**
 * A skill must be portable as ONE folder, in both directions:
 *
 *   1. every script a `SKILL.md` links under `scripts/` EXISTS beside it in the
 *      dataset — a skill whose runbook points at a script it does not ship is a
 *      runtime failure at the worst moment, not an authoring typo;
 *   2. every script the dataset ships has a BYTE-IDENTICAL twin under
 *      `.claude/skills/<prefixed-skill>/scripts/` — the dataset copy is
 *      canonical, the installed one derived, and a script edited in one copy
 *      only is silent drift the markdown mirror guards cannot see (they are
 *      markdown-only by construction — `skill-md-mirror.ts`'s ACCEPTED RESIDUAL).
 *
 * Reports drift, never repairs it. Scope is a skill's OWN `scripts/` dir: a
 * `references/scripts/` folder, a link outside `scripts/` (left to `checkLinks`)
 * and an installed script with no dataset source are all out of it.
 */
export function checkSkillLocalScripts(
  skillsDir: string,
  installedSkillsDir: string,
): SkillLocalScriptsResult {
  const errors: string[] = []
  const installedRootExists = existsSync(installedSkillsDir)

  for (const skillFile of collectSkillFiles(skillsDir)) {
    const skillDir = dirname(skillFile)
    const skillRel = relative(skillsDir, skillDir).split(sep).join('/')
    errors.push(...checkLinkedScriptsShip(skillFile, skillDir, skillRel))
    if (installedRootExists) {
      errors.push(...checkScriptTwins(skillDir, skillRel, installedSkillsDir))
    }
  }

  const notes = installedRootExists
    ? []
    : [
        `installed skills dir not found (${installedSkillsDir}) — skill-local script ` +
          `mirroring not checked (dataset-only checkout).`,
      ]

  return { errors, notes }
}

// --- Corpus walk ---

/**
 * Every Markdown file under the skills corpus — SKILL.md AND auxiliary composed
 * files (e.g. `merge-and-cascade.md`, `post-review-merge.md`) that a SKILL.md
 * discloses to. Instruction lives in these files too, so template-link/pointer
 * invariants must scan them, not just SKILL.md (story #314).
 */
export function collectSkillMarkdownFiles(skillsDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) files.push(p)
    }
  }
  walk(skillsDir)
  return files
}

export function collectSkillFiles(skillsDir: string): string[] {
  const files: string[] = []
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const cat of categories) {
    const catDir = join(skillsDir, cat.name)
    // A dir that holds its OWN SKILL.md is a bare/meta skill (`next`, `loop`),
    // never a category — decided by that marker file and NOT by "has no
    // subdirectories". The old shape asked the second question, so the day a
    // bare skill grew ANY sub-directory it dropped out of the corpus entirely:
    // no frontmatter/size/link/approval check, and a skillCount short by one
    // that fails the catalog counts somewhere unrelated. That drop was silent,
    // and silence is the defect: the layout is not one this registry can
    // install either (see `checkInstallableLayout` — a bare skill that needs a
    // `scripts/` folder must move one level deeper, under a category directory),
    // and a corpus the installer refuses must be REPORTED, not made invisible.
    // So the marker is what decides membership, and the layout check is what
    // decides acceptance.
    //
    // The two markers are INDEPENDENT, so neither shadows the other: a dir may
    // hold its own SKILL.md AND nested skill dirs. That layout does not install
    // — measured at the producer, `pair update` REFUSES a depth-1 directory that
    // holds files and owns a sub-directory, and refuses it before writing
    // anything, so the whole corpus installs as nothing (`checkInstallableLayout`
    // above is what reports it). But refusing is a job for a check that can
    // SPEAK; returning early on the bare marker here would instead make the
    // nested entrypoint invisible to every check in this gate, with no error
    // anywhere — the silent drop #482 set out to close, merely moved. Hence:
    // collect the marker, then keep walking, and let the layout check report the
    // corpus as unrepresentable. Walk/install parity is pinned on the real corpus
    // and, per layout, against the real copy pipeline.
    if (existsSync(join(catDir, 'SKILL.md'))) files.push(join(catDir, 'SKILL.md'))
    const subdirs = readdirSync(catDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    for (const sub of subdirs) {
      const f = join(catDir, sub, 'SKILL.md')
      if (existsSync(f)) files.push(f)
    }
  }
  return files
}

/**
 * The skill-count figures restated in the onboarding KB prose, checked against
 * the real corpus. Its own function only to keep `runChecks` under the 50-line
 * ceiling the lint gate enforces — the KB prose files are a self-contained
 * input, unlike every other block there, which reads the corpus itself.
 */
function checkKbProseCounts(skillsDir: string, files: string[]): string[] {
  const errors: string[] = []
  const counts = countByCategory(files, skillsDir)
  const proseRoot = resolve(skillsDir, '..', '..')
  for (const rel of KB_PROSE_FILES) {
    const abs = join(proseRoot, rel)
    if (!existsSync(abs)) continue
    const proseContent = readFileSync(abs, 'utf-8')
    errors.push(...checkProseCounts(rel, proseContent, counts))
    errors.push(...checkCategoryLabelCounts(rel, proseContent, counts))
  }
  return errors
}

export function runChecks(
  skillsDir: string,
  installedSkillsDir: string = INSTALLED_SKILLS_DIR,
): RunResult {
  const errors: string[] = []
  const notes: string[] = []
  const files = collectSkillFiles(skillsDir)

  for (const file of files) {
    const rel = relative(skillsDir, file)
    const content = readFileSync(file, 'utf-8')
    const fm = parseFrontmatter(content)
    if (!fm) {
      errors.push(`${rel}: missing or malformed YAML frontmatter`)
      continue
    }
    for (const e of checkFrontmatterFields(fm.keys)) errors.push(`${rel}: ${e}`)
    for (const e of checkSizeLimits(fm.values['name'], fm.values['description'])) {
      errors.push(`${rel}: ${e}`)
    }
    for (const e of checkLinks(file, fm.body)) errors.push(`${rel}: ${e}`)
    // Already prefixed with the file — this check reports line numbers too.
    errors.push(...checkApprovalSignal(rel.split(sep).join('/'), content))
  }

  errors.push(...checkEntrypointDepth(skillsDir, collectSkillMarkdownFiles(skillsDir)))
  errors.push(...checkInstallableLayout(skillsDir))

  const scripts = checkSkillLocalScripts(skillsDir, installedSkillsDir)
  errors.push(...scripts.errors)
  notes.push(...scripts.notes)
  errors.push(...checkApprovalSignalInSubDocs(skillsDir, collectSkillMarkdownFiles(skillsDir)))

  const nextFile = files.find(f => basename(dirname(f)) === 'next')
  if (nextFile) {
    errors.push(...checkCatalogCounts(readFileSync(nextFile, 'utf-8'), files.length))
  }

  errors.push(...checkKbProseCounts(skillsDir, files))

  return { errors, skillCount: files.length, notes }
}

if (require.main === module) {
  const { errors, skillCount, notes } = runChecks(SKILLS_DIR, INSTALLED_SKILLS_DIR)

  console.log('Skills Conformance Check')
  console.log('========================')

  for (const n of notes) console.log(`  ℹ ${n}`)

  if (errors.length === 0) {
    console.log(
      `PASS — ${skillCount} skills conformant (frontmatter portability, size limits, pointer resolution, entrypoint depth, installer-representable layout, skill-local scripts shipped and mirrored, catalog counts, KB prose counts incl. category headings/table cells, approval-round signal)`,
    )
    process.exit(0)
  } else {
    console.log(`FAIL — ${errors.length} violation${errors.length > 1 ? 's' : ''}\n`)
    for (const e of errors) console.log(`  • ${e}`)
    console.log()
    process.exit(1)
  }
} else {
  // allow importing the module without executing
}
