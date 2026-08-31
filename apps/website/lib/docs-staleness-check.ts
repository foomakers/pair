/**
 * Docs Staleness Check — verifies the published docs site matches source-of-truth
 * code artifacts (skills corpus, CLI commands, how-to guides) and has no dead
 * internal links.
 *
 * This is the website-docs integrity gate. The LOGIC lives here as individually
 * exported, unit-tested functions (see docs-staleness-check.test.ts, white-box).
 * The `main()` block is a thin CLI wrapper run via `tsx lib/docs-staleness-check.ts`
 * (package script `docs:staleness`); it prints the same output and exit codes as
 * before. Exit 0 = in sync, Exit 1 = drift detected.
 *
 * DOCS_STALENESS_ROOT overrides the repo root (used to point the checks at a
 * fixture tree). Absent, the repo root is resolved from this file's location:
 * apps/website/lib -> apps/website -> apps -> <repo root> (up 3).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** Resolve the repo root, honouring the DOCS_STALENESS_ROOT override. */
export function resolveRoot(): string {
  const override = process.env['DOCS_STALENESS_ROOT']
  return override ? resolve(override) : resolve(MODULE_DIR, '../../..')
}

// --- Regexes (exported so their intent is documented and directly testable) ---

// Skill total-count phrasings across docs. Narrow to avoid prose false positives
// but covers "N skills", "N+ skills" (trailing plus), and an optional total-count
// adjective — "N pair/composable/agent/idempotent skills". Subset counts
// ("9 process skills") do NOT match: the adjective, when present, must be one of
// the whitelisted total-count words.
export const SKILL_COUNT_RE =
  /(\d+)\+?\s+(?:declared\s+)?(?:pair\s+|composable\s+|agent\s+|idempotent\s+)?skills/g

// A quoted `claude plugin details` transcript: `Skills (1)`. Pinned because it is an
// assertion about our OWN plugin manifest, not a third-party observation — and because
// the marketplace docs quoted a stale count while the manifest held another, drift no
// phrasing above could catch. Anchored on the literal capitalized `Skills (`, so the
// sibling `Agents (0)` / `Hooks (0)` counts in the same transcript never match.
//
// It is checked against the count the PLUGIN MANIFEST declares, NOT against the dataset
// skill count: since the payload shrank to the bootstrap corpus, the plugin declares one
// skill while the dataset holds 41, and conflating the two would demand a number that is
// wrong on both readings.
export const SKILL_COUNT_PROBE_RE = /\bSkills \((\d+)\)/g

// How-to guide count phrasings. Requires a how-to qualifier so arbitrary
// "N guides" prose ("5 guides at the museum") never false-positives: a match
// needs EITHER a recognized adjective (sequential/step-by-step) OR a
// how-to/process word. Bare "N guides" does not match. Covers "9 how-to guides",
// "9 process guides", "9 sequential guides", "9 step-by-step guides",
// "9 sequential how-to guides", "9 step-by-step process guides".
export const GUIDE_COUNT_RE =
  /(\d+)\s+(?:(?:sequential|step-by-step)\s+(?:how-to\s+|process\s+)?|(?:how-to|process)\s+)guides/g

// Internal /docs targets: markdown links `](/docs/...)` and JSX card
// `href="/docs/..."` attributes (Fumadocs <Card>/<Cards>).
export const LINK_RE = /\]\((\/docs[^)\s]*)\)/g
export const HREF_RE = /href="(\/docs[^"]*)"/g

// --- Filesystem helpers ---

/** Skill names under a category dir: its subdirs, or the category itself if it's a meta skill (SKILL.md at the category root). */
export function getSkillNames(categoryDir: string): string[] {
  const entries = readdirSync(categoryDir, { withFileTypes: true })
  const subdirs = entries.filter(d => d.isDirectory()).map(d => d.name)
  if (subdirs.length > 0) return subdirs
  if (existsSync(join(categoryDir, 'SKILL.md'))) return [basename(categoryDir)]
  return []
}

/** Every skill name across all category dirs under skillsDir. */
export function collectSkills(skillsDir: string): string[] {
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  const all: string[] = []
  for (const cat of categories) all.push(...getSkillNames(join(skillsDir, cat.name)))
  return all
}

/** All .mdx files under dir, recursively. */
export function walkMdx(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMdx(full))
    else if (entry.name.endsWith('.mdx')) out.push(full)
  }
  return out
}

/**
 * How many skills the plugin manifest declares. `null` if the manifest is missing —
 * the caller then skips the probe check rather than pinning every transcript to 0.
 */
export function countDeclaredPluginSkills(manifestPath: string): number | null {
  if (!existsSync(manifestPath)) return null
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const skills = (raw as { skills?: unknown }).skills
  if (Array.isArray(skills)) return skills.length
  return typeof skills === 'string' ? 1 : 0
}

/** Count of how-to guide files (NN-how-to-*.md) in a KB how-to dir. `null` if the dir is missing. */
export function countHowToGuides(howToDir: string): number | null {
  if (!existsSync(howToDir)) return null
  return readdirSync(howToDir).filter(f => /^\d+-how-to-.*\.md$/.test(f)).length
}

// --- Pure per-content checks (return error strings; no I/O) ---

/** Check 1: every "N skills" phrasing in content matches the actual skill count. */
export function findSkillCountMismatches(content: string, rel: string, actual: number): string[] {
  return countMismatches(content, rel, actual, { re: SKILL_COUNT_RE, label: 'Skill count' })
}

/**
 * Check 1b: every quoted `Skills (N)` plugin transcript matches what the plugin
 * manifest declares. Separate from check 1 on purpose — see SKILL_COUNT_PROBE_RE.
 */
export function findPluginSkillCountMismatches(
  content: string,
  rel: string,
  declared: number,
): string[] {
  return countMismatches(content, rel, declared, {
    re: SKILL_COUNT_PROBE_RE,
    label: 'Plugin skill count',
  })
}

function countMismatches(
  content: string,
  rel: string,
  actual: number,
  kind: { re: RegExp; label: string },
): string[] {
  const { re, label } = kind
  const errors: string[] = []
  for (const m of content.matchAll(re)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(`${label} mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`)
    }
  }
  return errors
}

/** Check 2b: every "N how-to guides" phrasing in content matches the actual guide count. */
export function findGuideCountMismatches(content: string, rel: string, actual: number): string[] {
  const errors: string[] = []
  for (const m of content.matchAll(GUIDE_COUNT_RE)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(
        `How-to guide count mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`,
      )
    }
  }
  return errors
}

/** Check 5: every /docs link/href in content resolves to a known route. */
export function findDeadLinks(content: string, rel: string, validRoutes: Set<string>): string[] {
  const errors: string[] = []
  for (const re of [LINK_RE, HREF_RE]) {
    for (const m of content.matchAll(re)) {
      const raw = m[1]
      if (raw === undefined) continue
      const head = (raw.split('#')[0] ?? '').split('?')[0] ?? ''
      const target = head.replace(/\/$/, '') || '/docs'
      if (!validRoutes.has(target)) {
        errors.push(`Dead internal link in ${rel}: ${raw} does not resolve to a docs page`)
      }
    }
  }
  return errors
}

// --- Catalog ROW CONTENT (single-sourced from the dataset SKILL.md frontmatter) ---
//
// checkCatalogSync (Check 2) pins the catalog's skill NAME LIST to the dataset;
// findSkillCountMismatches pins the "N skills" COUNTS. Neither pins the per-row
// Command / Description CONTENT, which used to be hand-maintained and could drift
// silently from the dataset. checkCatalogContent (Check 2c) closes that gap: the
// Command is DERIVED from category+name (the same transform `pair-cli update` applies)
// and the Description from the skill's frontmatter — so the dataset is the single
// source of truth, CI-enforced. (The Composes column is NOT owned by this check.)

export interface SkillEntry {
  category: string
  name: string
}

export interface ExpectedRow {
  command: string
  description: string
}

/**
 * category+name → the slash-command, the same name transform `pair-cli update` applies
 * when mirroring the dataset into `.claude/skills/`: a meta skill (its SKILL.md sits
 * at the category root, so name === category, e.g. `next`) becomes `/pair-<name>`;
 * every other skill becomes `/pair-<category>-<name>`.
 */
export function deriveSkillCommand(category: string, name: string): string {
  return name === category ? `/pair-${name}` : `/pair-${category}-${name}`
}

/** Enumerate every dataset skill as {category, name} (categories × getSkillNames). */
export function collectSkillEntries(skillsDir: string): SkillEntry[] {
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  const out: SkillEntry[] = []
  for (const cat of categories) {
    for (const name of getSkillNames(join(skillsDir, cat.name))) {
      out.push({ category: cat.name, name })
    }
  }
  return out
}

/** Absolute path to a skill's SKILL.md (a meta skill lives at the category root). */
export function skillMdPath(skillsDir: string, entry: SkillEntry): string {
  return entry.name === entry.category
    ? join(skillsDir, entry.category, 'SKILL.md')
    : join(skillsDir, entry.category, entry.name, 'SKILL.md')
}

/** The quoted `description:` scalar from a SKILL.md's YAML frontmatter (empty if absent). */
export function readSkillDescription(skillMdContent: string): string {
  const m = skillMdContent.match(/^description:\s*"([\s\S]*?)"\s*$/m)
  return m?.[1] ?? ''
}

// Abbreviations whose trailing period does NOT end a sentence ("e.g.", "etc.").
const SENTENCE_ABBREVIATIONS = /(?:e\.g|i\.e|etc|vs|approx)$/i

/**
 * The lead sentence of a frontmatter description, as the catalog renders it. Ends at
 * the first sentence-terminating period (one followed by whitespace/EOS, skipping
 * known abbreviations and mid-token dots like `.pair/…`), OR — for skills whose lead
 * is followed by a `$scope`/`$mode` enumeration ("… rule): `$scope: diff` …") — at
 * the `:` that introduces it. A closing period is always ensured.
 */
export function extractFirstSentence(description: string): string {
  let cut = description.length
  const mode = /:\s(?=`\$)/.exec(description)
  if (mode && mode.index + 1 < cut) cut = mode.index + 1
  const period = /\.(?=\s|$)/g
  let m: RegExpExecArray | null
  while ((m = period.exec(description)) !== null) {
    if (SENTENCE_ABBREVIATIONS.test(description.slice(0, m.index))) continue
    if (m.index + 1 < cut) cut = m.index + 1
    break
  }
  const lead = description.slice(0, cut).replace(/:\s*$/, '').trim()
  return /[.!?]$/.test(lead) ? lead : `${lead}.`
}

/**
 * Render bare `/short-name` command references as the catalog does — backticked,
 * fully-qualified `` `/pair-…` ``. A `/` only starts a command token at a word
 * boundary (not after a letter/backtick), so slash-joined prose like
 * "map-subdomains/map-contexts" is left intact.
 */
export function transformCommandTokens(text: string, commandByName: Map<string, string>): string {
  return text.replace(/(^|[^\w`])\/([a-z][a-z0-9-]*)/g, (full, pre: string, name: string) => {
    const cmd = commandByName.get(name)
    return cmd ? `${pre}\`${cmd}\`` : full
  })
}

/** The catalog Description a skill should have: its frontmatter lead, catalog-rendered. */
export function deriveCatalogDescription(
  frontmatterDescription: string,
  commandByName: Map<string, string>,
): string {
  return transformCommandTokens(extractFirstSentence(frontmatterDescription), commandByName)
}

/** Derive the expected Command + Description for every dataset skill (name → row). */
export function generateCatalogRows(skillsDir: string): Map<string, ExpectedRow> {
  const entries = collectSkillEntries(skillsDir)
  const commandByName = new Map(entries.map(e => [e.name, deriveSkillCommand(e.category, e.name)]))
  const rows = new Map<string, ExpectedRow>()
  for (const e of entries) {
    const desc = readSkillDescription(readFileSync(skillMdPath(skillsDir, e), 'utf-8'))
    rows.set(e.name, {
      command: deriveSkillCommand(e.category, e.name),
      description: deriveCatalogDescription(desc, commandByName),
    })
  }
  return rows
}

/** Parse a skill's Command + Description cells from its catalog table row (null if absent). */
export function parseCatalogRow(
  catalog: string,
  skill: string,
): { command: string; description: string } | null {
  for (const line of catalog.split('\n')) {
    const m = line.match(/^\|\s*\*\*([a-z0-9-]+)\*\*\s*\|/)
    if (!m || m[1] !== skill) continue
    // `| **skill** | `/cmd` | description | (composes) |` → ['', '**skill**', '`/cmd`', 'desc', …]
    const cells = line.split('|').map(c => c.trim())
    return {
      command: (cells[2] ?? '').replace(/^`|`$/g, ''),
      description: cells[3] ?? '',
    }
  }
  return null
}

/**
 * Check 2c: every catalog row's Command + Description MATCH the dataset-derived truth.
 * Presence/absence of rows is checkCatalogSync's job — a skill with no row is skipped
 * here (checkCatalogSync already flags it) rather than double-reported.
 */
export function checkCatalogContent(expected: Map<string, ExpectedRow>, catalog: string): string[] {
  const errors: string[] = []
  for (const [skill, exp] of expected) {
    const row = parseCatalogRow(catalog, skill)
    if (row === null) continue
    if (row.command !== exp.command) {
      errors.push(
        `Catalog command drift for "${skill}": expected \`${exp.command}\` but catalog has \`${row.command}\``,
      )
    }
    if (row.description !== exp.description) {
      errors.push(
        `Catalog description drift for "${skill}": expected "${exp.description}" but catalog has "${row.description}"`,
      )
    }
  }
  return errors
}

/** Check 2: catalog lists every skill dir, and no catalog row lacks a dir (both directions). */
export function checkCatalogSync(allSkills: string[], catalog: string): string[] {
  const errors: string[] = []
  for (const skill of allSkills) {
    if (!catalog.includes(`**${skill}**`)) {
      errors.push(`Skill "${skill}" exists in .skills/ but missing from skills-catalog.mdx`)
    }
  }
  const catalogSkills = [...catalog.matchAll(/\| \*\*([a-z0-9-]+)\*\* \|/g)]
    .map(m => m[1])
    .filter((s): s is string => s !== undefined)
  for (const docSkill of catalogSkills) {
    if (!allSkills.includes(docSkill)) {
      errors.push(`Skill "${docSkill}" in skills-catalog.mdx but no matching dir in .skills/`)
    }
  }
  return errors
}

/**
 * Check: the batch-engine page names the directories the registries actually install.
 *
 * AC8 asks for a note "derived from the dataset rather than hand-copied". The prose is
 * hand-written, but the FACTS it states — which paths appear in an adopter's repo — are
 * read from `config.json` here, so renaming a registry target without touching the page
 * fails the gate instead of leaving a doc that points at a directory nobody gets.
 */
export function checkBatchEnginePaths(
  registries: Record<string, { targets: { path: string }[] }>,
  doc: string,
): string[] {
  const errors: string[] = []
  for (const name of ['workflows', 'agent-definitions']) {
    const reg = registries[name]
    if (!reg) {
      errors.push(`asset_registries."${name}" is gone but batch-engine.mdx still documents it`)
      continue
    }
    for (const t of reg.targets) {
      // Documented with or without the trailing slash — the path is the fact, not its spelling.
      const bare = t.path.replace(/\/$/, '')
      if (!doc.includes(bare)) {
        errors.push(
          `batch-engine.mdx does not mention "${t.path}", where the "${name}" registry installs`,
        )
      }
    }
  }
  return errors
}

/**
 * Check: the batch-engine page's authority note enumerates EVERY shipped agent, with the
 * exact `tools:` list its frontmatter declares.
 *
 * The note is the only user-facing signal about what authority an adopter installs
 * unconditionally, so an understated one is worse than none. Review of #432 found it claiming
 * "three subagents" and then listing two, and describing `pair-reviewer` as holding `Bash`
 * when it declares five tools — while `pair-contract-generator`, which holds `Write`, was
 * absent. Reading the frontmatter here makes the claim gate-checked rather than hand-copied.
 */
export function checkBatchEngineAgents(
  agents: { name: string; tools: string }[],
  doc: string,
): string[] {
  const errors: string[] = []
  if (agents.length === 0) {
    // Without this, deleting the agents directory turns the check green.
    return ['no agent definitions found in the dataset — the batch-engine agent check is vacuous']
  }
  for (const { name, tools } of agents) {
    if (!doc.includes(name)) {
      errors.push(`batch-engine.mdx does not name the shipped agent "${name}"`)
      continue
    }
    if (!doc.includes(tools)) {
      errors.push(
        `batch-engine.mdx does not state "${name}" tools as declared in its frontmatter: "${tools}"`,
      )
    }
  }
  return errors
}

/** Check 3: every command dir has an anchor in commands.mdx. */
export function checkCommandAnchors(commandDirs: string[], commandsDoc: string): string[] {
  const errors: string[] = []
  for (const cmd of commandDirs) {
    if (!commandsDoc.includes(`(#${cmd})`)) {
      errors.push(`CLI command "${cmd}" has a dir in commands/ but missing from commands.mdx`)
    }
  }
  return errors
}

/**
 * A `<bin> <word>` INVOCATION, as opposed to the words "pair-cli"/"pair" in a sentence.
 *
 * Positional, deliberately, and not a list of prose words to keep extending: the binary
 * counts as an invocation only at the start of an inline code span or of a fenced line,
 * optionally behind `$ ` or an npx runner (`npx [flags] [@scope/]<bin>[@version]`). That
 * is what separates an instruction
 * from English — "common pair-cli workflows" and "the pair-cli version it invokes" are
 * prose and must not fail the gate, while `` `pair-cli init` `` is a command that does
 * not exist. The previous shape kept a PROSE_WORDS allow-list, which is the maintenance
 * pattern where the next false positive is fixed by adding a word rather than by fixing
 * the rule; under the positional rule that list is dead and is gone.
 *
 * The BINARY is captured (group 1) rather than pinned to the literal `pair-cli`, because
 * both spellings are invocations and only one of them exists: `pair` is what the docs
 * used to say and what no `npm install` ever creates (ADL 2026-08-25 — `pair-cli` is the
 * canonical name, no alias). Matching `pair-cli` alone made the gate structurally blind
 * to the very drift it exists to catch (US-449).
 *
 * The separator between binary and command is ONE space, not `\s+`: an aligned column of
 * whitespace is a diagram, never a command. The PM-tool pages map their hierarchy under a
 * fenced heading (`pair                    Linear`), which `\s+` would read as "run
 * `pair Linear`". This is a KNOWING trade, and it covers every non-single-space separator:
 * neither `pair-cli  <cmd>` written with two spaces nor `pair-cli\t<cmd>` written with a TAB
 * is flagged (no such form exists in the docs today — verified: `checkDocsCommands` returns
 * `[]` for both, pinned in the suite). A tab is column alignment by definition, so the
 * diagram rationale applies to it unchanged. Do not re-widen the separator to `\s+` or `\s`
 * to recover either — that hands the four PM-tool diagrams back as false positives; if
 * multi-space or tab invocations ever appear, narrow the DIAGRAM instead (e.g. require the
 * run of whitespace to align with another line's column).
 *
 * The npx runner is a PREFIX of the binary, never a slot that consumes it. An earlier shape
 * spelled it `npx\s+(?:--no\s+)?@?[\w/.-]+\s+` — a package token followed by a still-required
 * literal binary — so the real form `npx --no @foomakers/pair-cli <cmd>` could not match at
 * all and every npx-prefixed invocation in the docs was invisible to the gate. The scope
 * (`@foomakers/`) and the version (`@latest`) therefore attach to the captured binary here,
 * and the flags are what sit between `npx` and it.
 *
 * The span rule TOKENIZES real code spans (`` `…` `` pairs, `CODE_SPAN`) and anchors the
 * prefix at the start of the span's CONTENT — it does not scan for the prefix "after a
 * backtick". Both weaker shapes have already misfired once each, in opposite directions:
 *   - `` `\s* `` let a CLOSING FENCE (which ends with a backtick) cross the newline into the
 *     paragraph below — "pair creates Markdown files" read as an invocation of `creates`;
 *   - `` `[ \t]* `` fixed that newline but still matched after ANY backtick, so a CLOSING
 *     INLINE span followed by prose on the SAME line did it again: `` `config.json` pair
 *     skills resolve state `` read as an invocation of `skills`, and the gate would have
 *     told the writer to "write `pair-cli skills`" inside an English sentence.
 * Tokenizing removes the class rather than the two cases: the text after a closing delimiter
 * is outside every span, and a fence (```` ``` ````) yields no span at all since a span needs
 * a non-backtick character between its delimiters. Both cases are pinned in the suite.
 *
 * Only SINGLE-backtick spans are tokenized. CommonMark also allows a doubled delimiter
 * (`` ``pair install`` ``), and such a span is invisible to this gate — `CODE_SPAN` would
 * have to balance run lengths to see it. Deliberate while the corpus uses none: every
 * doubled-backtick hit across the 84 pages is a fence opener (```` ```text ````), zero are
 * inline spans. If a page ever authors one, balance the delimiter run rather than
 * loosening the span shape.
 */
const PUBLISHED_BIN = 'pair-cli'
const INVOCATION_PREFIX =
  String.raw`(?:\$[ \t]*)?(?:npx[ \t]+(?:-{1,2}[\w-]+[ \t]+)*)?` +
  String.raw`(?:@[\w.-]+/)?(pair-cli|pair)(?:@[\w.-]+)? `
/** One inline code span's CONTENT — delimiters paired, never crossing a line. */
const CODE_SPAN = /`([^`\n]+)`/g
/**
 * The token after the binary: a command name, OR a flag. A flag is never a command NAME,
 * but it IS an invocation — `pair --version` is the single most copy-pasted line in the
 * docs (9 pages carry it in its correct spelling today), and while the group was
 * `[A-Za-z][\w.-]*` a leading `-` failed the WHOLE prefix, so `pair --version` was not
 * seen as an invocation at all and shipped green behind a binary no `npm install`
 * creates. The token is therefore flag-aware, and `checkDocsCommands` runs only the
 * binary half on a `-`-leading token — otherwise the correct `pair-cli --version` would
 * become a false "is not a command". A LETTER is required immediately after the one or
 * two dashes, which is what a real flag looks like and what an ASCII diagram does not:
 * `pair -> story` and a bare `pair -- install` (an argument separator, not a flag) match
 * nothing, same trade as the single-space separator above.
 */
const COMMAND_TOKEN = String.raw`(-{1,2}[A-Za-z][\w-]*|[A-Za-z][\w.-]*)`
const SPAN_INVOCATION = new RegExp('^[ \\t]*' + INVOCATION_PREFIX + COMMAND_TOKEN)
const LINE_INVOCATION = new RegExp('^\\s*' + INVOCATION_PREFIX + COMMAND_TOKEN)

/**
 * `vX.Y.Z` / `v0.4.3` on a fenced line is printed OUTPUT, never a command — which is why
 * the token is captured whole (uppercase and dots included) instead of lower-case only:
 * a capture of just `v` would be indistinguishable from a two-letter command typo.
 */
const VERSION_STRING = /^v[\dX]/i

/**
 * Check 4: every invocation the docs tell a reader to run is one that WORKS — the right
 * binary (`pair-cli`, never a bare `pair`), naming a command that exists.
 *
 * Scoped to the whole docs tree, not just tutorials. That widening is the point: with
 * tutorials only, 21 references to three non-existent commands (`init`, `kb validate`,
 * `kb info`) survived across eight pages — each one telling a reader to run something
 * that fails. The wrong-binary case is the same defect one level up: `pair install` is
 * a real command behind a bin that no install creates.
 */
export function checkDocsCommands(
  docs: { rel: string; content: string }[],
  commandDirs: string[],
): string[] {
  const errors: string[] = []
  for (const { rel, content } of docs) {
    for (const { bin, cmd } of invokedCommands(content)) {
      // Ordering is load-bearing and deliberate: the version guard precedes the binary
      // check, so `pair v0.5.0` — a version BANNER, i.e. output a reader compares against,
      // not an invocation — is skipped whole and is the one input where a bare `pair`
      // survives the rule. Flagging it would tell a writer to rewrite printed output.
      if (VERSION_STRING.test(cmd)) continue
      // A flag is an invocation but not a command name, so only the binary half applies.
      const isFlag = cmd.startsWith('-')
      // Wrong binary reported once and on its own: `pair kb-validate` is not ALSO an
      // unknown command, and `pair init` should not be counted twice. ONE error, but the
      // message still has to be honest about both halves — a prescriptive `write
      // "pair-cli init"` for a command that does not exist sends the writer to publish a
      // second broken invocation and buys a second red round, so the fix is only offered
      // when there is one.
      if (bin !== PUBLISHED_BIN) {
        const remedy = isFlag
          ? ''
          : commandDirs.includes(cmd)
            ? ` — write "${PUBLISHED_BIN} ${cmd}"`
            : `, and "${cmd}" is not one of its commands`
        errors.push(
          `${rel} tells the reader to run "${bin} ${cmd}", but the published binary is ` +
            `"${PUBLISHED_BIN}"${remedy}`,
        )
        continue
      }
      if (isFlag || commandDirs.includes(cmd)) continue
      errors.push(`${rel} tells the reader to run "${bin} ${cmd}", which is not a command`)
    }
  }
  return errors
}

/** One `<bin> <cmd>` a document tells the reader to run. */
interface Invocation {
  bin: string
  cmd: string
}

/** The invocations a document actually makes — code spans plus fenced command lines. */
function invokedCommands(content: string): Invocation[] {
  const found = new Map<string, Invocation>()
  const add = (m: RegExpMatchArray | null): void => {
    const [, bin, cmd] = m ?? []
    if (bin !== undefined && cmd !== undefined) found.set(`${bin} ${cmd}`, { bin, cmd })
  }
  for (const [, span] of content.matchAll(CODE_SPAN)) add(SPAN_INVOCATION.exec(span ?? ''))
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) add(LINE_INVOCATION.exec(line))
  }
  return [...found.values()]
}

/** Build the set of valid /docs routes from the docs .mdx file list. */
export function buildValidRoutes(docsFiles: string[], docsDir: string): Set<string> {
  const routes = new Set<string>()
  for (const file of docsFiles) {
    const rel = relative(docsDir, file)
      .replace(/\\/g, '/')
      .replace(/\.mdx$/, '')
    routes.add(rel === 'index' ? '/docs' : `/docs/${rel.replace(/\/index$/, '')}`)
  }
  return routes
}

export interface RunResult {
  errors: string[]
  skillCount: number
  commandCount: number
}

/** Checks 3 & 4: command anchors in commands.mdx, and tutorial `pair-cli <cmd>` references. */
export function checkCliCommands(
  commandsDir: string,
  commandsFile: string,
  docs: { rel: string; content: string }[],
): { errors: string[]; commandCount: number } {
  const errors: string[] = []
  const commandDirs = readdirSync(commandsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  errors.push(...checkCommandAnchors(commandDirs, readFileSync(commandsFile, 'utf-8')))
  errors.push(...checkDocsCommands(docs, commandDirs))
  return { errors, commandCount: commandDirs.length }
}

/**
 * Per-file checks — each doc is read once and run through every content-level check:
 * 1 (skill counts), 1b (the plugin transcript), 2b (guide counts), 5 (dead links).
 * Extracted from runAllChecks only to keep it under the line ceiling.
 */
function perFileErrors(params: {
  docsFiles: string[]
  docsDir: string
  skillCount: number
  declaredPluginSkills: number | null
  howToCount: number | null
  validRoutes: Set<string>
}): string[] {
  const { docsFiles, docsDir, skillCount, declaredPluginSkills, howToCount, validRoutes } = params
  const errors: string[] = []
  for (const file of docsFiles) {
    const content = readFileSync(file, 'utf-8')
    const rel = relative(docsDir, file)
    errors.push(...findSkillCountMismatches(content, rel, skillCount))
    if (declaredPluginSkills !== null) {
      errors.push(...findPluginSkillCountMismatches(content, rel, declaredPluginSkills))
    }
    if (howToCount !== null) errors.push(...findGuideCountMismatches(content, rel, howToCount))
    errors.push(...findDeadLinks(content, rel, validRoutes))
  }
  return errors
}

/**
 * The repo-root README's count claims. It used to be excluded from this gate, with the
 * note "tracked and fixed by PR #325" — that PR is merged, so the exemption outlived its
 * own reason while the counts stayed unpinned (and a live drift sat there: 11 how-to
 * guides claimed against 9 on disk). It is the first page a reader sees; the same count
 * checks apply, and nothing else about the gate's docs-site focus changes.
 */
function readmeErrors(path: string, skillCount: number, howToCount: number | null): string[] {
  if (!existsSync(path)) return []
  const content = readFileSync(path, 'utf-8')
  const errors = findSkillCountMismatches(content, 'README.md', skillCount)
  if (howToCount !== null) {
    errors.push(...findGuideCountMismatches(content, 'README.md', howToCount))
  }
  return errors
}

/** Run every check against a repo root and collect all drift errors. */
/**
 * The source-of-truth paths every check reads, resolved from one repo root. Kept as
 * its own function so `runAllChecks` stays inside the line ceiling and the path list
 * has a single place to change.
 */
function checkPaths(root: string) {
  const DOCS_DIR = join(root, 'apps/website/content/docs')
  return {
    SKILLS_DIR: join(root, 'packages/knowledge-hub/dataset/.skills'),
    COMMANDS_DIR: join(root, 'apps/pair-cli/src/commands'),
    DOCS_DIR,
    CATALOG_FILE: join(DOCS_DIR, 'reference/skills-catalog.mdx'),
    COMMANDS_FILE: join(DOCS_DIR, 'reference/cli/commands.mdx'),
    HOW_TO_DIR: join(root, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to'),
    // The plugin manifest lives at the PLUGIN root (the bootstrap corpus), not at the
    // repo root: the marketplace entry's `source` points there.
    PLUGIN_MANIFEST: join(root, 'packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json'),
    BATCH_ENGINE_FILE: join(DOCS_DIR, 'reference/batch-engine.mdx'),
    CLI_CONFIG: join(root, 'apps/pair-cli/config.json'),
    AGENTS_DIR: join(root, 'packages/knowledge-hub/dataset/.agents'),
    WORKFLOWS_DIR: join(root, 'packages/knowledge-hub/dataset/.workflows'),
  }
}

/** `name:` and `tools:` from an agent definition's YAML frontmatter. */
function readAgentFrontmatter(dir: string): { name: string; tools: string }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => {
      const src = readFileSync(join(dir, f), 'utf-8')
      return {
        name: /^name:\s*(.+)$/m.exec(src)?.[1]?.trim() ?? f.replace(/\.md$/, ''),
        tools: /^tools:\s*(.+)$/m.exec(src)?.[1]?.trim() ?? '',
      }
    })
}

/** The shipped workflow NAMES: every `.js` at the root of the dataset workflows dir, minus the
 * dry-run suites the registry excludes. Names, not paths — the page's table is keyed by name. */
function readShippedWorkflowNames(dir: string, exclude: string[] = []): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.js') && !exclude.includes(f))
    .map(f => f.replace(/\.js$/, ''))
    .sort()
}

/**
 * Check: the batch-engine page's WORKFLOW table enumerates every shipped workflow, and no more.
 *
 * The agent table beside it is derived; this one was hand-maintained, so a third shipped
 * workflow (or a renamed one) left the page describing a set that no longer exists — and the
 * page's whole job is to say what an adopter receives. Both directions are checked: a shipped
 * workflow missing from the table understates the install, and a table naming a workflow that
 * no longer ships promises something nobody gets.
 */
/**
 * The first cell of every row of the page's WORKFLOW table, located by that table's own header.
 * Scoped rather than document-wide: the agent table below it has the same row shape and its
 * `pair-*` names are not workflows, so a whole-document scan would either false-positive on
 * them or (as it did) be narrowed to a name suffix and stop catching renames.
 */
function workflowTableRows(doc: string): string[] {
  const lines = doc.split('\n')
  const start = lines.findIndex(l => /^\|\s*Workflow\s*\|/i.test(l))
  if (start === -1) return []
  const names: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith('|')) break
    const name = /^\|\s*`([^`]+)`/.exec(line)?.[1]
    if (name) names.push(name.trim())
  }
  return names
}

export function checkBatchEngineWorkflows(shipped: string[], doc: string): string[] {
  if (shipped.length === 0) {
    // Without this, deleting the dataset workflows directory turns the check green.
    return [
      'no shipped workflows found in the dataset — the batch-engine workflow check is vacuous',
    ]
  }
  const errors: string[] = []
  for (const name of shipped)
    if (!doc.includes(name))
      errors.push(`batch-engine.mdx does not name the shipped workflow "${name}"`)
  // The reverse, read off the TABLE's own rows rather than off the whole document. Matching
  // `` `pair-*-batch` `` anywhere caught a stale name only while it kept the `-batch` suffix:
  // a future `pair-triage` left in the table after it stopped shipping passed, which is exactly
  // the promise-what-nobody-gets defect this direction exists to catch. Reading the rows makes
  // it name-shape-agnostic AND keeps the agent table's own `pair-*` names — which this check
  // does not own — out of the scan.
  const rows = workflowTableRows(doc)
  if (rows.length === 0)
    errors.push(
      'batch-engine.mdx has no workflow table — the reverse check (a name the registry does not ship) cannot run',
    )
  for (const name of rows)
    if (!shipped.includes(name) && !errors.some(e => e.includes(name)))
      errors.push(`batch-engine.mdx names "${name}", which the workflows registry does not ship`)
  return [...new Set(errors)]
}

/**
 * The batch-engine page states WHERE `pair-cli install` puts the engine, WHAT ships, and WHAT
 * authority arrives. Every one of those claims is read back from the dataset and the registries
 * rather than trusted, so renaming a target — or adding a workflow — without touching the page
 * fails here instead of leaving a doc pointing at something nobody gets.
 */
export function batchEngineErrors(paths: {
  BATCH_ENGINE_FILE: string
  CLI_CONFIG: string
  AGENTS_DIR: string
  WORKFLOWS_DIR: string
}): string[] {
  // LOUD on absence, like every sibling check in this file. Returning `[]` here meant deleting
  // `batch-engine.mdx` turned its own gate green — the page whose existence AC8 requires
  // disabling the checks that hold it honest, which is the one failure direction a staleness
  // gate must never have.
  if (!existsSync(paths.BATCH_ENGINE_FILE))
    return [
      `Batch engine page not found: ${paths.BATCH_ENGINE_FILE} — the batch-engine checks cannot run`,
    ]
  const cliConfig = JSON.parse(readFileSync(paths.CLI_CONFIG, 'utf-8')) as {
    asset_registries: Record<string, { targets: { path: string }[]; exclude?: string[] }>
  }
  const doc = readFileSync(paths.BATCH_ENGINE_FILE, 'utf-8')
  return [
    ...checkBatchEnginePaths(cliConfig.asset_registries, doc),
    ...checkBatchEngineAgents(readAgentFrontmatter(paths.AGENTS_DIR), doc),
    ...checkBatchEngineWorkflows(
      readShippedWorkflowNames(
        paths.WORKFLOWS_DIR,
        cliConfig.asset_registries['workflows']?.exclude ?? [],
      ),
      doc,
    ),
  ]
}

/**
 * The docs pages whose fenced sample block claims to BE the output of
 * `pair-cli install --list-targets`. These are transcripts a reader compares their own
 * terminal against line for line, so drift here does not read as a stale doc — it reads
 * as a broken install, and the reader has no way to tell the two apart.
 */
export const LIST_TARGETS_PAGES = [
  'getting-started/checklist.mdx',
  'getting-started/quickstart-solo.mdx',
  'reference/cli/examples.mdx',
]

/** The header `listTargets` (apps/pair-cli/src/commands/install/handler.ts) prints, uncoloured. */
export const LIST_TARGETS_HEADER = 'Asset Registries'

/** The header three pages invented for it, and which the CLI has never emitted. */
const LIST_TARGETS_INVENTED_HEADER = 'Available asset registries:'

type ListTargetsRegistry = { behavior?: string; targets?: { path: string }[] }

/** The three lines `listTargets` prints per registry, in its exact indentation. */
function listTargetsEntry(name: string, reg: ListTargetsRegistry): string {
  const target = reg.targets?.[0]?.path ?? '(none)'
  return `  ${name}\n    target:   ${target}\n    behavior: ${reg.behavior ?? 'unknown'}`
}

/**
 * Check: every page printing `--list-targets` output prints what the renderer emits — the
 * handler's header, and one `name` / `target:` / `behavior:` entry per SHIPPED registry.
 *
 * The batch-engine check above reads `asset_registries` too, but only for two registries and
 * only against `batch-engine.mdx`; these three transcripts were covered by nothing. They drifted
 * into a columnar table under a header the CLI never printed, gave `knowledge` the target `.pair`
 * instead of `.pair/knowledge`, and omitted 4 of the 7 registries — for as long as it took someone
 * to read them side by side with a terminal. Deriving both directions from `config.json` means
 * adding, renaming or re-targeting a registry fails here instead of at an adopter.
 */
export function checkListTargetsSamples(
  registries: Record<string, ListTargetsRegistry>,
  pages: { rel: string; content: string }[],
): string[] {
  const errors: string[] = []
  for (const { rel, content } of pages) {
    if (!content.includes(LIST_TARGETS_HEADER)) {
      errors.push(`${rel}: --list-targets sample is missing the "${LIST_TARGETS_HEADER}" header`)
    }
    if (content.includes(LIST_TARGETS_INVENTED_HEADER)) {
      errors.push(
        `${rel}: --list-targets sample prints "${LIST_TARGETS_INVENTED_HEADER}", a header the CLI never emits`,
      )
    }
    for (const [name, reg] of Object.entries(registries)) {
      if (!content.includes(listTargetsEntry(name, reg))) {
        errors.push(
          `${rel}: --list-targets sample does not print the "${name}" registry as the CLI does ` +
            `(expected "  ${name}" / "    target:   ${reg.targets?.[0]?.path ?? '(none)'}" / "    behavior: ${reg.behavior ?? 'unknown'}")`,
        )
      }
    }
  }
  return errors
}

/** Read the registries and the sample pages, then compare. LOUD if a page is gone. */
export function listTargetsSampleErrors(paths: { CLI_CONFIG: string; DOCS_DIR: string }): string[] {
  const { asset_registries } = JSON.parse(readFileSync(paths.CLI_CONFIG, 'utf-8')) as {
    asset_registries: Record<string, ListTargetsRegistry>
  }
  const files = LIST_TARGETS_PAGES.map(rel => ({ rel, file: join(paths.DOCS_DIR, rel) }))
  const missing = files.filter(f => !existsSync(f.file))
  if (missing.length > 0) {
    return missing.map(
      f => `--list-targets sample page not found: ${f.rel} — the sample check cannot run`,
    )
  }
  return checkListTargetsSamples(
    asset_registries,
    files.map(f => ({ rel: f.rel, content: readFileSync(f.file, 'utf-8') })),
  )
}

/**
 * Checks 2b + 2d — everything derived from `apps/pair-cli/config.json`: the batch-engine
 * asset paths, and the three docs pages that print `pair-cli install --list-targets` output.
 */
function cliConfigDerivedErrors(
  paths: Parameters<typeof batchEngineErrors>[0] & Parameters<typeof listTargetsSampleErrors>[0],
): string[] {
  return [...batchEngineErrors(paths), ...listTargetsSampleErrors(paths)]
}

export function runAllChecks(root: string): RunResult {
  const paths = checkPaths(root)
  const { SKILLS_DIR, DOCS_DIR, HOW_TO_DIR } = paths

  const errors: string[] = []
  const docsFiles = walkMdx(DOCS_DIR)
  const allSkills = collectSkills(SKILLS_DIR)
  const skillCount = allSkills.length
  const declaredPluginSkills = countDeclaredPluginSkills(paths.PLUGIN_MANIFEST)
  const validRoutes = buildValidRoutes(docsFiles, DOCS_DIR)
  const howToCount = countHowToGuides(HOW_TO_DIR)

  // Check 2b (loud failure if the how-to dataset dir moved)
  if (howToCount === null) {
    errors.push(`How-to guides dir not found: ${HOW_TO_DIR} — guide-count check cannot run`)
  }

  errors.push(
    ...perFileErrors({
      docsFiles,
      docsDir: DOCS_DIR,
      skillCount,
      declaredPluginSkills,
      howToCount,
      validRoutes,
    }),
  )

  // Check 2: catalog sync (both directions)
  const catalog = readFileSync(paths.CATALOG_FILE, 'utf-8')
  errors.push(...cliConfigDerivedErrors(paths))
  errors.push(...checkCatalogSync(allSkills, catalog))

  // Check 2c: catalog row CONTENT (Command + Description) single-sourced from the dataset
  errors.push(...checkCatalogContent(generateCatalogRows(SKILLS_DIR), catalog))

  // Checks 3 & 4: CLI command anchors + tutorial references
  const docs = docsFiles.map(file => ({
    rel: relative(DOCS_DIR, file),
    content: readFileSync(file, 'utf-8'),
  }))
  const cli = checkCliCommands(paths.COMMANDS_DIR, paths.COMMANDS_FILE, docs)
  errors.push(...cli.errors)

  errors.push(...readmeErrors(join(root, 'README.md'), skillCount, howToCount))

  return { errors, skillCount, commandCount: cli.commandCount }
}

/** Thin CLI wrapper: print the report and set the exit code. */
export function main(): void {
  const { errors, skillCount, commandCount } = runAllChecks(resolveRoot())
  console.log('Docs Staleness Check')
  console.log('====================')
  if (errors.length === 0) {
    console.log(`PASS — ${skillCount} skills, ${commandCount} commands in sync`)
    process.exit(0)
  }
  console.log(`FAIL — ${errors.length} issue${errors.length > 1 ? 's' : ''}\n`)
  for (const e of errors) console.log(`  • ${e}`)
  console.log()
  process.exit(1)
}

// Main-guard: run only when invoked directly (tsx lib/docs-staleness-check.ts),
// not when imported by the unit tests. ESM equivalent of `require.main === module`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
