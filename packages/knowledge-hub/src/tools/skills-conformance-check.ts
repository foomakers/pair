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
 *   6. KB prose counts — the skill-count figures restated in the onboarding KB
 *      prose (way-of-working.md, getting-started.md, skills-guide.md) match the
 *      real corpus, across every restated form: the number-before-noun
 *      "N skills"/"N Agent Skills" total, the "(P process + C capability + N
 *      navigator)" breakdown, and the number-after-noun category forms — the
 *      "### <Category> Skills (N)" catalog heading and the "**<Category>** | N"
 *      Skill-Types table cell (defense-in-depth). Closes the recurrence gap
 *      from story #233: a skill-count sweep that misses these prose files leaves
 *      factually-wrong onboarding docs the docs-staleness gate can't catch (it
 *      scans apps/website only).
 *   7. Approval-round signal — every skill of an obliged family (`assess-*`,
 *      `map-*`) that declares an approval round exposes the `$approval` argument
 *      and declares, ON EACH ASKING LINE, an `<!-- approval-round: kind=…; auto=… -->`
 *      marker whose values come from closed enums and whose prose says the same
 *      thing (`skill-conventions/approval-rounds.md`, ADR-021). A declared marker,
 *      not keywords in a layout-derived window: six review rounds of narrowing that
 *      window left the same defect class alive each time, because a window widens
 *      when the prose changes shape instead of failing. Data-driven per skill
 *      present — a new family member is covered the day it lands, with no edit here
 *      and no count anywhere.
 *
 * Runnable as a CLI via `ts-node src/tools/skills-conformance-check.ts`
 * (package script `skills:conformance`). Exit 0 = conformant, Exit 1 = violations.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { basename, dirname, join, relative, resolve, sep } from 'path'

const ROOT = join(__dirname, '..', '..')
const SKILLS_DIR = join(ROOT, 'dataset', '.skills')

// KB onboarding prose that restates skill counts (relative to ROOT). Kept in
// lockstep with the real .skills corpus so a count sweep can't leave stale prose.
const STEP_CATALOGUE_FILE =
  'dataset/.pair/knowledge/guidelines/technical-standards/ai-development/step-catalogue.md'
const PROCESS_PROFILES_FILE =
  'dataset/.pair/knowledge/guidelines/technical-standards/ai-development/process-profiles.md'
const HOW_TO_DIR = 'dataset/.pair/knowledge/how-to'
const WOW_TEMPLATE_FILE = 'dataset/.pair/adoption/tech/way-of-working.md'

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
  navigator: number
}

// Bucket the corpus by top-level category dir (process/, capability/, everything
// else = the navigator meta skill), matching the KB's "P process + C capability +
// N navigator" phrasing.
export function countByCategory(files: string[], skillsDir: string): CategoryCounts {
  let process = 0
  let capability = 0
  let navigator = 0
  for (const f of files) {
    const top = relative(skillsDir, f).split(sep)[0]
    if (top === 'process') process++
    else if (top === 'capability') capability++
    else navigator++
  }
  return { total: files.length, process, capability, navigator }
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
  for (const b of content.matchAll(
    /\((\d+)\s+process\s*\+\s*(\d+)\s+capability\s*\+\s*(\d+)\s+navigator\)/g,
  )) {
    const p = parseInt(b[1] as string, 10)
    const c = parseInt(b[2] as string, 10)
    const n = parseInt(b[3] as string, 10)
    if (p !== counts.process || c !== counts.capability || n !== counts.navigator) {
      errors.push(
        `${rel}: breakdown "${b[0]}" does not match corpus (${counts.process} process + ${counts.capability} capability + ${counts.navigator} navigator)`,
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
    Navigator: counts.navigator,
  }
  const forms: Array<{ re: RegExp; kind: string }> = [
    { re: /\b(Process|Capability|Navigator)\s+Skills\s*\((\d+)\)/g, kind: 'heading' },
    { re: /\*\*(Process|Capability|Navigator)\*\*\s*\|\s*(\d+)\b/g, kind: 'table cell' },
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

// --- Process-step catalogue and profiles (#251) ---

/**
 * A process STEP: the unit a `## Process Profile` whitelists.
 *
 * Not a skill and not a how-to guide — BOTH of those are representations of the
 * same step, and the two sets do not coincide. Keying the profile on either one
 * makes a real case inexpressible: on skills, "a PoC never does DDD mapping"
 * cannot be said (its steps are capabilities, not `process/*` skills); on how-to
 * guides, `brainstorm` cannot be said (it has none). So the step is the unit and
 * the catalogue carries the two representations as NULLABLE fields — which is
 * exactly what turns the three asymmetries into data instead of conditionals in
 * `/next` and in every step skill.
 */
export interface StepEntry {
  /** Stable id — what a whitelist names. */
  id: string
  /** How-to filename (manual path), or null when the step has no guide. */
  howTo: string | null
  /** Unprefixed skill command (`/refine-story`), or null when there is none. */
  executable: string | null
  /**
   * Prerequisite step ids, satisfied when the list is EMPTY or at least ONE
   * member is enabled — an any-of, not an all-of.
   *
   * Any-of is what the corpus actually is, not a generalisation for its own
   * sake: `brainstorm` and the strategic chain are alternative producers of the
   * same input (a story tree), so `plan-stories` requires `plan-epics` OR
   * `brainstorm`. All-of would make the shipped `poc` profile — which drops the
   * strategic chain and keeps discovery — permanently self-inconsistent.
   */
  requires: string[]
}

/**
 * The declared marker a step's executable representation carries.
 *
 * A marker, not a prose window, for the reason `approval-round` is one: layout is
 * not contract, so a check keyed on a section heading widens when the prose
 * changes shape instead of failing.
 */
export const STEP_MARKER = /<!--\s*process-step:\s*id=([a-z0-9-]+)\s*-->/

/** The convention every step's executable representation must point at. */
export const STEP_GATE_CONVENTION = 'process-profile-gate.md'

/** Everything under the `## <heading>` section, up to the next `## ` heading. */
function sectionOf(content: string, heading: string): string {
  const start = content.indexOf(`## ${heading}`)
  if (start === -1) return ''
  const rest = content.slice(start + heading.length + 3)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

/** Markdown table rows of a section, as trimmed cell arrays (header/rule dropped). */
function tableRows(section: string): string[][] {
  const rows: string[][] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue // alignment rule
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map(c => c.trim())
    rows.push(cells)
  }
  return rows
}

/** Every backticked token in a cell (`—` / prose yields none). */
function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map(m => (m[1] as string).trim())
}

/**
 * The catalogue's `## The Catalogue` table, as data.
 *
 * Deliberately tolerant of the surrounding prose and strict about the row shape:
 * a row whose first cell is not a single backticked id is not a step (the file
 * also carries a "capabilities that are NOT steps" table, which must never be
 * read as one).
 */
export function parseStepCatalogue(content: string): StepEntry[] {
  const entries: StepEntry[] = []
  for (const cells of tableRows(sectionOf(content, 'The Catalogue'))) {
    if (cells.length < 4) continue
    const ids = backticked(cells[0] as string)
    if (ids.length !== 1) continue
    const id = ids[0] as string
    if (!/^[a-z][a-z0-9-]*$/.test(id)) continue
    entries.push({
      id,
      howTo: backticked(cells[1] as string)[0] ?? null,
      executable: backticked(cells[2] as string)[0] ?? null,
      requires: backticked(cells[3] as string),
    })
  }
  return entries
}

/** `'*'` = every catalogue step (the `default` profile). */
export type ProfileWhitelist = string[] | '*'

/** The built-in profiles table, as data. */
export function parseProcessProfiles(content: string): Record<string, ProfileWhitelist> {
  const profiles: Record<string, ProfileWhitelist> = {}
  for (const cells of tableRows(sectionOf(content, 'Built-in Profiles'))) {
    if (cells.length < 2) continue
    const names = backticked(cells[0] as string)
    if (names.length !== 1) continue
    const name = names[0] as string
    if (!/^[a-z][a-z0-9-]*$/.test(name)) continue
    const tokens = backticked(cells[1] as string)
    profiles[name] = tokens.includes('*') ? '*' : tokens
  }
  return profiles
}

/** The how-to guides actually on disk, as filenames. */
export function collectHowToGuides(howToDir: string): string[] {
  if (!existsSync(howToDir)) return []
  return readdirSync(howToDir)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort()
}

/**
 * Every skill directory in the corpus, as `<category>/<name>` (or the bare
 * `<name>` meta skill) — the same entry granularity `collectSkillFiles` walks.
 */
export function collectProcessSkillDirs(skillsDir: string): string[] {
  return collectSkillFiles(skillsDir).map(f => relative(skillsDir, dirname(f)).split(sep).join('/'))
}

/** The unprefixed command a skill dir is invoked by (`process/review` → `/review`). */
function commandOf(skillDir: string): string {
  const parts = skillDir.split('/')
  return `/${parts[parts.length - 1] as string}`
}

export interface CorpusSets {
  howToGuides: string[]
  skillDirs: string[]
}

/**
 * The catalogue↔corpus binding, BOTH directions — the guard that stops the
 * catalogue becoming a third, silently-drifting list alongside the skills tree
 * and the how-to directory.
 *
 * Forward: every representation a row names must resolve. Reverse: every how-to
 * guide and every `process/*` skill must be reachable from some row. The reverse
 * half is the load-bearing one — without it a step added to the corpus is simply
 * absent from the profile, which reads as "enabled" and is exactly the silent
 * ungoverned step the profile exists to prevent.
 */
/** A claim ledger: who owns a representation, and whether two rows fight over it. */
class Claims {
  private readonly owners = new Map<string, string>()
  constructor(private readonly noun: string) {}

  claim(key: string, by: string): string[] {
    const owner = this.owners.get(key)
    this.owners.set(key, by)
    return owner === undefined
      ? []
      : [`step-catalogue: ${this.noun} \`${key}\` is claimed by both \`${owner}\` and \`${by}\``]
  }

  has(key: string): boolean {
    return this.owners.has(key)
  }
}

/** Forward direction, one row: every representation it names must resolve. */
function checkCatalogueRow(
  entry: StepEntry,
  ids: Set<string>,
  commands: Map<string, string>,
  claimed: { guides: Claims; skills: Claims },
): string[] {
  const errors: string[] = []
  if (entry.howTo === null && entry.executable === null) {
    errors.push(
      `step-catalogue: step \`${entry.id}\` declares neither a how-to nor an executable — ` +
        `a step with no representation at all cannot be run by any path`,
    )
  }
  if (entry.howTo !== null) {
    errors.push(...claimed.guides.claim(entry.howTo, entry.id))
  }
  if (entry.executable !== null) {
    const dir = commands.get(entry.executable)
    if (dir === undefined) {
      errors.push(
        `step-catalogue: step \`${entry.id}\` names executable \`${entry.executable}\`, which resolves to no skill in the corpus`,
      )
    } else {
      errors.push(...claimed.skills.claim(dir, entry.id))
    }
  }
  for (const required of entry.requires) {
    if (!ids.has(required)) {
      errors.push(
        `step-catalogue: step \`${entry.id}\` requires \`${required}\`, which is not a catalogued step id`,
      )
    }
  }
  return errors
}

/** Reverse direction: a representation in the corpus that no row claims. */
function checkCatalogueOrphans(
  corpus: CorpusSets,
  claimed: { guides: Claims; skills: Claims },
): string[] {
  const errors: string[] = []
  for (const guide of corpus.howToGuides) {
    if (claimed.guides.has(guide)) continue
    errors.push(
      `step-catalogue: how-to \`${guide}\` appears in no catalogue row — the manual path of an ` +
        `uncatalogued step is ungoverned by every profile`,
    )
  }
  for (const dir of corpus.skillDirs) {
    if (dir.split('/')[0] !== 'process' || claimed.skills.has(dir)) continue
    errors.push(
      `step-catalogue: process skill \`${commandOf(dir)}\` appears in no catalogue row — a ` +
        `process skill IS a step, so a profile could never disable it`,
    )
  }
  return errors
}

/** Ids are unique — a duplicate would make a whitelist entry ambiguous. */
function checkUniqueStepIds(entries: StepEntry[]): { ids: Set<string>; errors: string[] } {
  const ids = new Set<string>()
  const errors: string[] = []
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      errors.push(
        `step-catalogue: duplicate step id \`${entry.id}\` — a whitelist entry would be ambiguous`,
      )
    }
    ids.add(entry.id)
  }
  return { ids, errors }
}

export function checkStepCatalogue(entries: StepEntry[], corpus: CorpusSets): string[] {
  const { ids, errors } = checkUniqueStepIds(entries)
  const guides = new Set(corpus.howToGuides)
  const commands = new Map(corpus.skillDirs.map(d => [commandOf(d), d]))
  const claimed = { guides: new Claims('how-to'), skills: new Claims('skill') }

  for (const entry of entries) {
    if (entry.howTo !== null && !guides.has(entry.howTo)) {
      errors.push(
        `step-catalogue: step \`${entry.id}\` names how-to \`${entry.howTo}\`, which is not in the how-to corpus`,
      )
    }
    errors.push(...checkCatalogueRow(entry, ids, commands, claimed))
  }

  // The reverse half is the load-bearing one: a step present in the corpus and
  // absent from the catalogue reads as "enabled" to every profile, silently.
  errors.push(...checkCatalogueOrphans(corpus, claimed))
  return errors
}

/** The convention pointer may sit in the SKILL.md or in any file disclosed beside it. */
function pointsAtGateConvention(skillsDir: string, dir: string): boolean {
  // The MARKER is the entrypoint's obligation — an assistant loads SKILL.md and
  // must be able to tell which step it is holding. The POINTER may be disclosed:
  // progressive disclosure is a shipped layout here, and a skill under a byte
  // budget puts its half of this convention in the sibling that already owns
  // "a composition is missing". Resolving the obligation over the skill's whole
  // directory is the rule `checkApprovalSignalInSubDocs` applies in reverse.
  return collectSkillMarkdownFiles(join(skillsDir, ...dir.split('/'))).some(f =>
    readFileSync(f, 'utf-8').includes(STEP_GATE_CONVENTION),
  )
}

/** One skill's marker obligations, resolved against the catalogue. */
function checkOneStepMarker(
  skillsDir: string,
  dir: string,
  content: string,
  entry: StepEntry | undefined,
): string[] {
  const declared = STEP_MARKER.exec(content)?.[1]
  const command = commandOf(dir)

  if (entry === undefined) {
    return declared === undefined
      ? []
      : [
          `${dir}/SKILL.md: declares \`process-step: id=${declared}\` but \`${command}\` is not a ` +
            `catalogued step's executable — either catalogue the step or drop the marker`,
        ]
  }
  if (declared === undefined) {
    return [
      `${dir}/SKILL.md: is the executable of step \`${entry.id}\` and declares no ` +
        `\`<!-- process-step: id=${entry.id} -->\` marker (skill-conventions/${STEP_GATE_CONVENTION})`,
    ]
  }

  const errors: string[] = []
  if (declared !== entry.id) {
    errors.push(
      `${dir}/SKILL.md: declares \`process-step: id=${declared}\` but the catalogue maps ` +
        `\`${command}\` to step \`${entry.id}\``,
    )
  }
  if (!pointsAtGateConvention(skillsDir, dir)) {
    errors.push(
      `${dir}/SKILL.md: represents step \`${entry.id}\` but neither it nor any file disclosed ` +
        `beside it points at skill-conventions/${STEP_GATE_CONVENTION} — the gate is written once ` +
        `and referenced, never re-implemented per skill`,
    )
  }
  return errors
}

export function checkStepMarkers(entries: StepEntry[], skillsDir: string): string[] {
  const byCommand = new Map<string, StepEntry>()
  for (const entry of entries) {
    if (entry.executable !== null) byCommand.set(entry.executable, entry)
  }

  const errors: string[] = []
  for (const file of collectSkillFiles(skillsDir)) {
    const dir = relative(skillsDir, dirname(file)).split(sep).join('/')
    errors.push(
      ...checkOneStepMarker(
        skillsDir,
        dir,
        readFileSync(file, 'utf-8'),
        byCommand.get(commandOf(dir)),
      ),
    )
  }
  return errors
}

/**
 * A built-in profile must name only catalogued steps, must not be empty, and must
 * be PREREQUISITE-CLOSED — the same consistency `/next` reports on a custom
 * whitelist, applied to the profiles the KB itself ships so a shipped profile
 * cannot be the thing that trips the check.
 */
export function checkProcessProfiles(
  profiles: Record<string, ProfileWhitelist>,
  entries: StepEntry[],
): string[] {
  const allIds = entries.map(e => e.id)
  const known = new Set(allIds)
  const errors: string[] = []

  for (const [name, whitelist] of Object.entries(profiles)) {
    const enabled = whitelist === '*' ? allIds : whitelist
    const at = `process-profiles: built-in profile \`${name}\``
    if (enabled.length === 0) {
      errors.push(
        `${at} enables no step — an empty whitelist is a misconfiguration, never "everything disabled"`,
      )
      continue
    }
    for (const id of enabled) {
      if (!known.has(id)) errors.push(`${at} names \`${id}\`, which is not a catalogued step id`)
    }
    for (const warning of prerequisiteWarnings(enabled, entries)) {
      errors.push(`${at}: ${warning}`)
    }
  }
  return errors
}

/** The adoption section that declares a project's profile. */
export const WOW_PROFILE_SECTION = 'Process Profile'

export interface ProfileDeclaration {
  /** Declared profile name, or null when the section is absent / declares none. */
  profile: string | null
  /** Declared whitelist, or null when no `whitelist` key is present. */
  whitelist: string[] | null
  /** True when a `## Process Profile` section exists at all. */
  present: boolean
}

/**
 * The `## Process Profile` section of a way-of-working file, as data.
 *
 * Fenced blocks are skipped: the shipped template carries worked EXAMPLES of the
 * very keys this reads, and an example is not a declaration.
 */
export function parseWowProfileSection(content: string): ProfileDeclaration {
  const section = sectionOf(content, WOW_PROFILE_SECTION)
  if (section === '') return { profile: null, whitelist: null, present: false }

  let profile: string | null = null
  let whitelist: string[] | null = null
  let fenced = false
  for (const line of section.split('\n')) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const key = /^\s*[-*]\s*`(profile|whitelist)`\s*:(.*)$/.exec(line)
    if (!key) continue
    const values = backticked(key[2] as string)
    if (key[1] === 'profile') profile = values[0] ?? null
    else whitelist = values
  }
  return { profile, whitelist, present: true }
}

export interface ProfileResolution {
  /** The profile actually in force (`default` when nothing is declared). */
  profile: string
  /** Enabled step ids — the whole catalogue under `default`. */
  enabled: string[]
  /** Conditions that must stop the run: a typo must never silently disable a step. */
  halts: string[]
  /** Inconsistencies reported with their minimal fix, never silently repaired. */
  warnings: string[]
}

/**
 * The reference resolution of a `## Process Profile` section — the executable
 * statement of the schema `/next` and the gate convention describe in prose.
 *
 * Every failure mode here is a HALT rather than a silent narrowing, for one
 * reason: the cost of a mistake is asymmetric. A misread whitelist does not throw
 * an error a user sees — it removes a step from every suggestion, which is
 * indistinguishable from that step simply not being due yet.
 *
 * The one non-HALT is the prerequisite inconsistency: the configuration is
 * readable, so the run continues and reports the minimal fix.
 */
export function resolveProcessProfile(
  declaration: ProfileDeclaration,
  entries: StepEntry[],
  builtIns: Record<string, ProfileWhitelist>,
): ProfileResolution {
  const allIds = entries.map(e => e.id)
  const known = [...Object.keys(builtIns), 'custom']
  const halt = (message: string): ProfileResolution => ({
    profile: 'default',
    enabled: allIds,
    halts: [message],
    warnings: [],
  })
  const resolved = (profile: string, enabled: string[]): ProfileResolution => ({
    profile,
    enabled,
    halts: [],
    warnings: prerequisiteWarnings(enabled, entries),
  })

  // Absent section ⇒ `default` ⇒ today's behaviour, byte for byte (D21).
  if (!declaration.present || declaration.profile === null) {
    if (declaration.present && declaration.whitelist !== null) {
      return halt(
        `\`## ${WOW_PROFILE_SECTION}\` declares a \`whitelist\` but no \`profile\` — a whitelist ` +
          `only applies to \`profile: custom\``,
      )
    }
    return { profile: 'default', enabled: allIds, halts: [], warnings: [] }
  }

  const name = declaration.profile
  if (!known.includes(name)) {
    return halt(
      `unknown process profile \`${name}\` — known profiles: ${known.map(k => `\`${k}\``).join(', ')}`,
    )
  }
  if (name !== 'custom') {
    if (declaration.whitelist !== null) {
      return halt(
        `profile \`${name}\` is a built-in and carries its own step set — a \`whitelist\` here would ` +
          `be silently ignored. Use \`profile: custom\` to name steps explicitly`,
      )
    }
    const builtIn = builtIns[name] as ProfileWhitelist
    return resolved(name, builtIn === '*' ? allIds : builtIn)
  }
  return resolveCustomWhitelist(declaration.whitelist ?? [], allIds, halt, resolved)
}

/** The `custom` arm: its two HALTs, then the resolution. */
function resolveCustomWhitelist(
  whitelist: string[],
  allIds: string[],
  halt: (message: string) => ProfileResolution,
  resolved: (profile: string, enabled: string[]) => ProfileResolution,
): ProfileResolution {
  if (whitelist.length === 0) {
    return halt(
      `profile \`custom\` declares an empty whitelist — read as a misconfiguration, never as ` +
        `"every step disabled". Name the steps to keep, or remove the section to run \`default\``,
    )
  }
  const unknown = whitelist.filter(id => !allIds.includes(id))
  if (unknown.length > 0) {
    return halt(
      `unknown step id(s) ${unknown.map(u => `\`${u}\``).join(', ')} in the custom whitelist — ` +
        `valid ids: ${allIds.map(i => `\`${i}\``).join(', ')}`,
    )
  }
  return resolved('custom', whitelist)
}

/** An enabled step whose prerequisites are all disabled, with the minimal fix. */
function prerequisiteWarnings(enabled: string[], entries: StepEntry[]): string[] {
  const enabledSet = new Set(enabled)
  const byId = new Map(entries.map(e => [e.id, e]))
  const warnings: string[] = []
  for (const id of enabled) {
    const entry = byId.get(id)
    if (entry === undefined || entry.requires.length === 0) continue
    if (entry.requires.some(r => enabledSet.has(r))) continue
    warnings.push(
      `\`${id}\` is enabled but none of its prerequisites are — minimal fix: enable ` +
        `${entry.requires.map(r => `\`${r}\``).join(' or ')}, or drop \`${id}\``,
    )
  }
  return warnings
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
    const subdirs = readdirSync(catDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    if (subdirs.length > 0) {
      for (const sub of subdirs) {
        const f = join(catDir, sub, 'SKILL.md')
        if (existsSync(f)) files.push(f)
      }
    } else if (existsSync(join(catDir, 'SKILL.md'))) {
      // Meta skill: category dir itself contains SKILL.md (e.g. next)
      files.push(join(catDir, 'SKILL.md'))
    }
  }
  return files
}

/**
 * Process-step catalogue ↔ corpus, the markers, the built-in profiles, and the
 * shipped way-of-working template read through the same resolver an adopting
 * project's file goes through.
 *
 * Fails CLOSED on a missing catalogue: skipping it would make "no catalogue" the
 * one state in which no step is governed and nothing says so.
 */
export function checkProcessStepCorpus(skillsDir: string, proseRoot: string): string[] {
  const cataloguePath = join(proseRoot, STEP_CATALOGUE_FILE)
  if (!existsSync(cataloguePath)) {
    return [
      `${STEP_CATALOGUE_FILE}: missing — every process step is ungoverned and no profile can name one`,
    ]
  }

  const entries = parseStepCatalogue(readFileSync(cataloguePath, 'utf-8'))
  const errors = [
    ...checkStepCatalogue(entries, {
      howToGuides: collectHowToGuides(join(proseRoot, HOW_TO_DIR)),
      skillDirs: collectProcessSkillDirs(skillsDir),
    }),
    ...checkStepMarkers(entries, skillsDir),
  ]

  const profilesPath = join(proseRoot, PROCESS_PROFILES_FILE)
  if (!existsSync(profilesPath)) {
    errors.push(`${PROCESS_PROFILES_FILE}: missing — the catalogue has no profile schema to serve`)
    return errors
  }

  const builtIns = parseProcessProfiles(readFileSync(profilesPath, 'utf-8'))
  errors.push(...checkProcessProfiles(builtIns, entries))

  // A shipped TEMPLATE that carries a section no reader accepts teaches the wrong
  // shape to every project that copies it — so read it with the real reader.
  const wowPath = join(proseRoot, WOW_TEMPLATE_FILE)
  if (existsSync(wowPath)) {
    const wow = resolveProcessProfile(
      parseWowProfileSection(readFileSync(wowPath, 'utf-8')),
      entries,
      builtIns,
    )
    for (const problem of [...wow.halts, ...wow.warnings]) {
      errors.push(`${WOW_TEMPLATE_FILE}: ${problem}`)
    }
  }
  return errors
}

export function runChecks(skillsDir: string): RunResult {
  const errors: string[] = []
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
  errors.push(...checkApprovalSignalInSubDocs(skillsDir, collectSkillMarkdownFiles(skillsDir)))

  const nextFile = files.find(f => basename(dirname(f)) === 'next')
  if (nextFile) {
    errors.push(...checkCatalogCounts(readFileSync(nextFile, 'utf-8'), files.length))
  }

  const counts = countByCategory(files, skillsDir)
  const proseRoot = resolve(skillsDir, '..', '..')

  errors.push(...checkProcessStepCorpus(skillsDir, proseRoot))

  for (const rel of KB_PROSE_FILES) {
    const abs = join(proseRoot, rel)
    if (existsSync(abs)) {
      const proseContent = readFileSync(abs, 'utf-8')
      errors.push(...checkProseCounts(rel, proseContent, counts))
      errors.push(...checkCategoryLabelCounts(rel, proseContent, counts))
    }
  }

  return { errors, skillCount: files.length }
}

if (require.main === module) {
  const { errors, skillCount } = runChecks(SKILLS_DIR)

  console.log('Skills Conformance Check')
  console.log('========================')

  if (errors.length === 0) {
    console.log(
      `PASS — ${skillCount} skills conformant (frontmatter portability, size limits, pointer resolution, entrypoint depth, catalog counts, KB prose counts incl. category headings/table cells, approval-round signal)`,
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
