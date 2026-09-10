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
 *   8. Skill-local scripts — a skill is portable as ONE folder: every script a
 *      SKILL.md links as `./scripts/x` / `scripts/x` exists inside that skill's own
 *      `scripts/` directory, and every dataset skill-local script has a BYTE-identical
 *      twin at the path the registry's bounded flatten installs it to
 *      (`<category>/<name>/scripts/<sub-path>` → `pair-<category>-<name>/scripts/<sub-path>`).
 *      Directional like the SKILL.md mirror guard — dataset canonical, installed derived —
 *      so an orphan installed script is an accepted residual and drift is REPORTED, never
 *      repaired here. A dataset-only checkout (no installed root) skips the twin half.
 *
 * Runnable as a CLI via `ts-node src/tools/skills-conformance-check.ts`
 * (package script `skills:conformance`). Exit 0 = conformant, Exit 1 = violations.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'

const ROOT = join(__dirname, '..', '..')
const SKILLS_DIR = join(ROOT, 'dataset', '.skills')

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

// --- Skill-local scripts ---

/**
 * Directory-name prefix the `skills` registry applies to every installed skill dir
 * (`workflow/red-verify` → `pair-workflow-red-verify`).
 *
 * Same fact as `SKILL_COPY_OPTS.prefix` in `skill-md-mirror.ts`, duplicated as a plain
 * constant for the same reason `ENTRY_DEPTH` is, plus a stronger one: this gate must stay
 * importable and runnable as a SINGLE file (it runs via ts-node before any build, and its
 * CLI exit branch is exercised by spawning a copy of this file alone), so it may not import
 * the mirror module. The derivation is pinned behaviourally rather than by assertion on the
 * constant: the conformance tests assert the literal installed paths this prefix and
 * `ENTRY_DEPTH` produce (`pair-workflow-alpha/scripts/lib/util.mjs`, `pair-next-scripts/`).
 */
export const INSTALLED_PREFIX = 'pair'

/** Installed skills root, derived from this package's location — `<repo>/.claude/skills`. */
const INSTALLED_SKILLS_DIR = resolve(ROOT, '..', '..', '.claude', 'skills')

interface SkillDir {
  /** Absolute path of the skill's own directory. */
  dir: string
  /** Dataset-relative path of that directory (`workflow/red-verify`, `next`). */
  rel: string
  /** Directory segments below the corpus root: `ENTRY_DEPTH`, or 1 for a meta skill. */
  depth: number
}

/**
 * Every skill directory, found by its own `SKILL.md` at either accepted entry depth.
 *
 * Deliberately NOT `collectSkillFiles`: that walk reads a category dir that HAS
 * sub-directories as a category only, so a meta skill owning a `scripts/` folder makes it
 * look for `next/scripts/SKILL.md`, find nothing, and drop the skill from the corpus
 * entirely — and that vanishing act is precisely the layout the mirror check below must
 * REFUSE. A check cannot refuse what its walk cannot see.
 */
function collectSkillDirs(skillsDir: string): SkillDir[] {
  const skills: SkillDir[] = []
  if (!existsSync(skillsDir)) return skills
  for (const top of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!top.isDirectory()) continue
    const topDir = join(skillsDir, top.name)
    if (existsSync(join(topDir, 'SKILL.md'))) skills.push({ dir: topDir, rel: top.name, depth: 1 })
    for (const sub of readdirSync(topDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue
      const subDir = join(topDir, sub.name)
      if (existsSync(join(subDir, 'SKILL.md'))) {
        skills.push({ dir: subDir, rel: join(top.name, sub.name), depth: ENTRY_DEPTH })
      }
    }
  }
  return skills
}

/** `workflow/red-verify` → `pair-workflow-red-verify`, the registry's flatten + prefix. */
function installedSkillDirName(skillRel: string): string {
  return `${INSTALLED_PREFIX}-${skillRel.split(sep).join('-')}`
}

/**
 * A skill-local script reference in a SKILL.md body: `./scripts/x` or the bare
 * `scripts/x`. Both spellings are the same obligation; nothing else is this check's
 * business (a `../` target is a pointer, and `checkLinks` already owns it).
 */
function isSkillLocalScriptTarget(target: string): boolean {
  return /^(\.\/)?scripts\//.test(target)
}

/**
 * Whether `abs` is the directory `root` or lives inside it, decided on the RESOLVED
 * path — never by looking for `..` in the spelling, which would refuse the legal
 * `scripts/lib/../helper.mjs` while a symlinked-looking escape slipped through.
 */
function isWithin(root: string, abs: string): boolean {
  const rel = relative(root, abs)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

/**
 * What a path IS once symlinks are followed — and never a throw.
 *
 * `readdirSync(…, { withFileTypes: true })` and `existsSync` disagree about symlinks in
 * opposite directions: the dirent reports lstat semantics (a symlink is neither
 * `isFile()` nor `isDirectory()`, so a symlinked script is silently dropped), while
 * `existsSync` follows the link (so a DANGLING one reads as absent and skips a whole
 * skill). `statSync` follows too, but throws `ENOENT` on a dangling entry — an unhandled
 * exception there takes the entire conformance run down with no report at all. Following
 * inside a `try` is the only reading that keeps both halves: a linked file is compared,
 * an entry that resolves to nothing is `unresolvable` and gets named.
 */
type EntryKind = 'file' | 'directory' | 'unresolvable'

function resolvedKind(path: string): EntryKind {
  try {
    const st = statSync(path)
    if (st.isDirectory()) return 'directory'
    if (st.isFile()) return 'file'
    return 'unresolvable'
  } catch {
    return 'unresolvable'
  }
}

/** Whether a path exists as an entry of ANY kind, a dangling symlink included. */
function entryExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** One entry of a skill's `scripts/` tree: a comparable file, or one nothing can read. */
interface LocalScriptEntry {
  /** Path relative to the skill's `scripts/` directory. */
  rel: string
  kind: 'file' | 'unresolvable'
}

/**
 * Every entry under a skill's `scripts/`, RECURSIVELY, with symlinks FOLLOWED.
 *
 * A linked file or sub-directory really ships with the skill, so it is walked like any
 * other; an entry that resolves to nothing is returned as `unresolvable` rather than
 * dropped, because silence over a shipped artifact is the one answer the mirror guard
 * may not give.
 *
 * The descent is bounded by its own ANCESTOR CHAIN, not by a walk-global visited set,
 * and the difference is the whole guarantee. A directory reachable under two names —
 * `scripts/lib/` and a sibling symlink `scripts/alias -> scripts/lib` — really ships
 * under BOTH: the registry's flatten installs a twin at each mirrored path, so each is
 * independently guardable. A global set keyed on the resolved path silently drops
 * whichever name `readdirSync` yields SECOND, leaving a drifted twin of a shipped path
 * unreported and making the corpus's answer depend on directory order. Recording only
 * the paths currently being descended keeps both names emitted (an ALIAS to a sibling is
 * walked twice, once per relative path) while still refusing to re-enter a directory that
 * is its own ancestor (a true CYCLE, `scripts/lib/loop -> scripts`), which is the only
 * shape that can spin the walk.
 */
function collectLocalScriptEntries(scriptsDir: string): LocalScriptEntry[] {
  const entries: LocalScriptEntry[] = []
  const ancestors = new Set<string>()
  const walk = (dir: string, prefix: string): void => {
    const key = resolvedRealPath(dir)
    // Already open further up THIS descent: following it would re-enter the same
    // directory forever. Anything else — including a second name for a directory
    // already closed — is a distinct shipped path and is walked.
    if (ancestors.has(key)) return
    ancestors.add(key)
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? e.name : join(prefix, e.name)
      const kind = resolvedKind(join(dir, e.name))
      if (kind === 'directory') walk(join(dir, e.name), rel)
      else entries.push({ rel, kind })
    }
    ancestors.delete(key)
  }
  walk(scriptsDir, '')
  return entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
}

/** The identity of a directory: its real path, or its own path when that cannot be read. */
function resolvedRealPath(dir: string): string {
  try {
    return realpathSync(dir)
  } catch {
    return dir
  }
}

/** Index of the first differing byte of two buffers, for a diagnostic that keeps both sides. */
function firstDifference(a: Buffer, b: Buffer): number {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i++) if (a[i] !== b[i]) return i
  return shared
}

/** AC 1: every script a SKILL.md links under its own `scripts/` exists beside it. */
function checkLinkedLocalScripts(skill: SkillDir, skillsDir: string): string[] {
  const errors: string[] = []
  // Malformed frontmatter is `runChecks`'s report to make, not this check's.
  const fm = parseFrontmatter(readFileSync(join(skill.dir, 'SKILL.md'), 'utf-8'))
  if (!fm) return errors
  for (const target of extractLinkTargets(fm.body)) {
    if (!isCheckableTarget(target)) continue
    const withoutFragment = target.split('#')[0] as string
    if (!isSkillLocalScriptTarget(withoutFragment)) continue
    const abs = resolve(skill.dir, withoutFragment)
    const scriptsRoot = join(skill.dir, 'scripts')
    // The `scripts/` prefix CLAIMS the target, so this check owes it an answer even when
    // the path resolves — `checkLinks` accepts an escape precisely because it resolves,
    // under a sibling skill or at the skill root. The boundary is the skill's OWN
    // scripts/ directory (not the skill folder): a link that leaves it is a script this
    // skill does not ship, and packaging or moving the skill alone breaks it.
    if (!isWithin(scriptsRoot, abs)) {
      errors.push(
        `${join(skill.rel, 'SKILL.md')}: links "${target}" as a skill-local script but it ` +
          `resolves to ${relative(skillsDir, abs)}, OUTSIDE the skill's own ` +
          `${join(skill.rel, 'scripts')} directory. A skill must ship the scripts it links ` +
          `inside its own scripts/ directory, so it stays portable as one folder.`,
      )
      continue
    }
    if (existsSync(abs)) continue
    errors.push(
      `${join(skill.rel, 'SKILL.md')}: links "${target}" but no such skill-local script ` +
        `exists — expected ${relative(skillsDir, abs)}. A skill must ship the scripts it ` +
        `links inside its own scripts/ directory, so it stays portable as one folder.`,
    )
  }
  return errors
}

/** The single dataset↔installed comparison, as the error it produces or `null` for equal. */
function compareInstalledTwin(
  datasetRel: string,
  canonicalPath: string,
  installedRel: string,
  installedPath: string,
): string | null {
  if (!existsSync(installedPath)) {
    return (
      `${datasetRel}: skill-local script is MISSING from the installed mirror — expected a ` +
      `byte-identical twin at ${installedRel}. The dataset copy is canonical: re-run \`pair update\`.`
    )
  }
  let canonical: Buffer
  let installed: Buffer
  try {
    canonical = readFileSync(canonicalPath)
    installed = readFileSync(installedPath)
  } catch (err) {
    return (
      `${datasetRel}: skill-local script could not be compared with its installed twin ` +
      `${installedRel} — UNREADABLE (${(err as Error).message}). ` +
      `An unreadable twin is never assumed identical.`
    )
  }
  if (canonical.equals(installed)) return null
  return (
    `${datasetRel}: skill-local script has DRIFTED from its installed twin ${installedRel} ` +
    `(${canonical.length} vs ${installed.length} bytes, first difference at byte ` +
    `${firstDifference(canonical, installed)}). The dataset copy is canonical: re-run \`pair update\`.`
  )
}

/** AC 2: every dataset skill-local script has a byte-identical twin at its mirrored path. */
function checkMirroredLocalScripts(skill: SkillDir, installedSkillsDir: string): string[] {
  const scriptsDir = join(skill.dir, 'scripts')
  // `entryExists`, not `existsSync`: the latter FOLLOWS the link, so a dangling `scripts`
  // symlink reads as "this skill has no scripts" and its whole twin half disappears
  // without a word.
  if (!entryExists(scriptsDir)) return []
  // A `scripts` entry that is not a directory — a file, or a symlink resolving to nothing
  // — would make the walk below throw and take the whole gate down with no report. The
  // dataset-side twin of the unreadable-twin class, answered the same way: name the path,
  // keep checking the rest of the corpus.
  if (resolvedKind(scriptsDir) !== 'directory') {
    return [
      `${join(skill.rel, 'scripts')}: expected the skill's scripts/ directory but found an ` +
        `entry that is not one (a file, or a symlink that resolves to nothing). Skill-local ` +
        `scripts live in a scripts/ folder inside the skill.`,
    ]
  }
  if (skill.depth < ENTRY_DEPTH) {
    return [
      `${skill.rel}: a meta skill (SKILL.md at depth 1) cannot own a scripts/ directory — ` +
        `the registry's bounded flatten (depth ${ENTRY_DEPTH}) installs ` +
        `${join(skill.rel, 'scripts')}/<file> as ${INSTALLED_PREFIX}-${skill.rel}-scripts/<file>, ` +
        `a separate top-level skill directory instead of a file inside ` +
        `${installedSkillDirName(skill.rel)}/, and the corpus walk then stops finding ` +
        `${skill.rel} at all. Move it to <category>/${skill.rel}/ before giving it scripts.`,
    ]
  }
  // A dataset-only checkout has nothing to compare against: skip, never report the corpus missing.
  if (!existsSync(installedSkillsDir)) return []
  return compareScriptsTree(skill, scriptsDir, installedSkillsDir)
}

/** Every entry of one skill's `scripts/` tree against its twin under the installed root. */
function compareScriptsTree(
  skill: SkillDir,
  scriptsDir: string,
  installedSkillsDir: string,
): string[] {
  const errors: string[] = []
  const installedDir = installedSkillDirName(skill.rel)
  for (const entry of collectLocalScriptEntries(scriptsDir)) {
    const datasetRel = join(skill.rel, 'scripts', entry.rel)
    // Neither a file nor a directory once followed: a dangling symlink, a socket, a
    // device. It cannot be compared and it cannot ship — but it is named, because the
    // one answer a mirror guard may never give over a dataset entry is silence.
    if (entry.kind === 'unresolvable') {
      errors.push(
        `${datasetRel}: skill-local script entry cannot be read — it resolves to nothing ` +
          `(a dangling symlink) or is not a regular file. An entry that cannot be compared ` +
          `is never assumed identical to its installed twin.`,
      )
      continue
    }
    const installedRel = join(installedDir, 'scripts', entry.rel)
    const error = compareInstalledTwin(
      datasetRel,
      join(scriptsDir, entry.rel),
      installedRel,
      join(installedSkillsDir, installedRel),
    )
    if (error !== null) errors.push(error)
  }
  return errors
}

/**
 * A skill is portable as ONE folder: every script it links ships inside it, and the
 * installed copy is the dataset copy.
 *
 * Two obligations over the same corpus:
 *
 *   1. every `[…](./scripts/x)` / `[…](scripts/x)` a SKILL.md links exists in that skill's
 *      own `scripts/` directory — delegated to `extractLinkTargets`/`isCheckableTarget` and
 *      the same `#fragment` strip `checkLinks` does, so a fenced authoring example, a
 *      `<placeholder>` and an `adr-NNN-` pattern path stay examples rather than becoming
 *      phantom missing scripts;
 *   2. every dataset skill-local script has a BYTE-identical twin at the path the registry's
 *      bounded flatten installs it to — `<category>/<name>/scripts/<sub-path>` →
 *      `pair-<category>-<name>/scripts/<sub-path>`, sub-directories preserved, because a
 *      nested script really does ship inside the skill and would otherwise be unguarded.
 *
 * Directional by design, exactly like the SKILL.md mirror guard: the dataset copy is
 * canonical, the installed copy derived. An installed script with no dataset source is an
 * accepted residual of a rename, not a violation, and this check REPORTS drift — `pair
 * update` repairs it. When the installed root is absent (a dataset-only checkout) the twin
 * half is skipped rather than reporting the whole corpus missing.
 */
export function checkSkillLocalScripts(skillsDir: string, installedSkillsDir: string): string[] {
  const errors: string[] = []
  for (const skill of collectSkillDirs(skillsDir)) {
    errors.push(...checkLinkedLocalScripts(skill, skillsDir))
    errors.push(...checkMirroredLocalScripts(skill, installedSkillsDir))
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
  errors.push(...checkSkillLocalScripts(skillsDir, INSTALLED_SKILLS_DIR))
  errors.push(...checkApprovalSignalInSubDocs(skillsDir, collectSkillMarkdownFiles(skillsDir)))

  const nextFile = files.find(f => basename(dirname(f)) === 'next')
  if (nextFile) {
    errors.push(...checkCatalogCounts(readFileSync(nextFile, 'utf-8'), files.length))
  }

  const counts = countByCategory(files, skillsDir)
  const proseRoot = resolve(skillsDir, '..', '..')
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
      `PASS — ${skillCount} skills conformant (frontmatter portability, size limits, pointer resolution, entrypoint depth, skill-local scripts, catalog counts, KB prose counts incl. category headings/table cells, approval-round signal)`,
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
