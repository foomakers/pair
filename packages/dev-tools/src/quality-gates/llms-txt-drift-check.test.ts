/**
 * T-1 (story #416) — the fixture-based suite for the `.pair/llms.txt` drift gate.
 *
 * Written BEFORE the module it imports (repo TDD convention). Every case runs on a
 * SELF-CONTAINED fixture tree under a temp dir: the real `.pair` corpus is never
 * read, so a legitimately added guideline can never turn this suite red — the whole
 * point of the gate is that such an addition goes red in the GATE, not here.
 *
 * The expected index is never hardcoded: each case asserts against what
 * `generateLlmsTxt` actually emits for that fixture. Per AC-6 the trailing-newline
 * form is #393's, consumed here and not re-litigated.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  chmodSync,
  statSync,
  symlinkSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  REGENERATION_COMMAND,
  TRACKED_INDEX_PATH,
  checkLlmsIndexDrift,
  compareIndex,
  formatReport,
  main,
  readOnlyFileSystem,
} from './llms-txt-drift-check'
import {
  generateLlmsTxt,
  type LlmsSourceFs,
} from '../../../../apps/pair-cli/src/registry/llms-generation'

const fixtures: string[] = []

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

/** A temp KB tree. `files` are paths relative to the tree root, with their content. */
function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'llms-drift-'))
  fixtures.push(root)
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf-8')
  }
  return root
}

const KB_FILES: Record<string, string> = {
  '.pair/adoption/product/PRD.md': '# Product Requirements\n',
  '.pair/knowledge/how-to/01-how-to-start.md': '# How to start\n',
  '.pair/knowledge/guidelines/testing/README.md': '# Testing Guidelines\n',
}

/** A tree whose committed index is exactly what the generator emits for it. */
async function makeInSyncTree(extra: Record<string, string> = {}): Promise<string> {
  const root = makeTree({ ...KB_FILES, ...extra })
  const generated = await generateLlmsTxt(readOnlyFileSystem, root)
  writeFileSync(join(root, TRACKED_INDEX_PATH), generated, 'utf-8')
  return root
}

describe('checkLlmsIndexDrift — the committed index vs. the generator', () => {
  it('passes when the tracked index is what the generator emits', async () => {
    const root = await makeInSyncTree()

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(true)
    expect(result.report.kind).toBe('in-sync')
  })

  it('fails and names the un-indexed guideline as MISSING', async () => {
    const root = await makeInSyncTree()
    // A guideline added without regenerating — the exact miss this gate exists for.
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration'), { recursive: true })
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/collaboration/story-local-markers.md'),
      '# Story Local Markers\n',
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('drift')
    const line =
      '- [Story Local Markers](.pair/knowledge/guidelines/collaboration/story-local-markers.md)'
    expect(result.report).toMatchObject({ missing: [line], extra: [] })
    // AC2: the LINE, not "files differ".
    expect(result.message).toContain(line)
    expect(result.message).toContain('missing')
  })

  it('fails and names the stale entry as EXTRA when a KB file is deleted', async () => {
    const root = await makeInSyncTree({
      '.pair/knowledge/guidelines/retired/old-rule.md': '# Old Rule\n',
    })
    rmSync(join(root, '.pair/knowledge/guidelines/retired'), { recursive: true, force: true })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    const line = '- [Old Rule](.pair/knowledge/guidelines/retired/old-rule.md)'
    expect(result.report).toMatchObject({ kind: 'drift', missing: [], extra: [line] })
    expect(result.message).toContain(line)
    expect(result.message).toContain('extra')
  })

  it('names the regeneration command in the failure, so the fix needs no manual diff (AC5)', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.message).toContain(REGENERATION_COMMAND)
  })

  it('NEVER writes: a failing run leaves the tracked file byte-identical (AC5, check-only ADL)', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, 'hand-edited garbage\n', 'utf-8')
    const before = readFileSync(tracked, 'utf-8')
    const mtimeBefore = statSync(tracked).mtimeMs

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(readFileSync(tracked, 'utf-8')).toBe(before)
    expect(statSync(tracked).mtimeMs).toBe(mtimeBefore)
  })

  it('reports an EMPTY tracked file as drift with the full missing list, not a crash', async () => {
    const root = await makeInSyncTree()
    const expected = readFileSync(join(root, TRACKED_INDEX_PATH), 'utf-8')
    writeFileSync(join(root, TRACKED_INDEX_PATH), '', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('drift')
    const contentLines = expected.split('\n').filter(l => l.trim() !== '')
    expect(result.report).toMatchObject({ missing: contentLines, extra: [] })
  })

  it('reports an ABSENT tracked file as drift naming the file, not a crash', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, TRACKED_INDEX_PATH), { force: true })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({ kind: 'drift', trackedExists: false })
    expect(result.message).toContain(TRACKED_INDEX_PATH)
  })

  it('reports a MISSING KB tree as a broken setup, a distinct outcome from drift', async () => {
    const root = makeTree({ 'README.md': '# not a pair project\n' })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('broken-setup')
    expect(result.message).not.toContain(REGENERATION_COMMAND)
  })

  it('reports a PARTIALLY installed tree (no indexable section) as a broken setup too', async () => {
    const root = makeTree({ '.pair/llms.txt': '# pair\n' })

    const result = await checkLlmsIndexDrift(root)

    expect(result.report.kind).toBe('broken-setup')
  })

  // A tree missing ONE WHOLE section still yields other sections, so it clears the
  // broken-setup guard and is reported as drift listing every guideline as `extra`.
  // The verdict is right (a mass deletion looks identical), the ADVICE is not: a
  // contributor who obeys "regenerate and commit" on a sparse checkout commits an
  // index with the entire Guidelines section deleted — the index going stale in the
  // more damaging direction, caused by the gate's own message.
  it('cautions against regenerating when a whole tracked section has no generated entries', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, '.pair/knowledge/guidelines'), { recursive: true, force: true })

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', emptiedSections: ['Guidelines'] })
    expect(result.message).toContain('Guidelines')
    expect(result.message).toContain('do not regenerate')
  })

  // The caution is worthless if the message then closes with the bare imperative: the
  // LAST paragraph is the call to action a contributor scanning for the fix obeys, and
  // obeying it here commits the index with the Guidelines section deleted. So the
  // closing paragraph itself must carry the precondition.
  it('conditions the closing call to action on a complete tree when a section was emptied', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, '.pair/knowledge/guidelines'), { recursive: true, force: true })

    const result = await checkLlmsIndexDrift(root)

    // Still names the command (AC5) — behind its precondition.
    expect(result.message).toContain(REGENERATION_COMMAND)
    expect(result.message).toContain('Once the tree is complete, regenerate with')
    // No paragraph anywhere opens with the unconditional imperative.
    expect(result.message).not.toMatch(/^Regenerate with/m)
    const paragraphs = result.message.split('\n\n')
    expect(paragraphs[paragraphs.length - 1]).toContain('Once the tree is complete')
  })

  it('adds no caution when every tracked heading still has generated entries', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, '.pair/knowledge/guidelines/testing/README.md'), { force: true })
    writeFileSync(join(root, '.pair/knowledge/guidelines/testing/other.md'), '# Other\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', emptiedSections: [] })
    expect(result.message).not.toContain('do not regenerate')
    // The paired path: a complete tree keeps the unconditional imperative.
    expect(result.message).toMatch(/^Regenerate with/m)
    expect(result.message).not.toContain('Once the tree is complete')
  })

  // A contributor who cloned with `core.autocrlf=true` gets every line of the tracked
  // file terminated `\r\n` while the generator emits `\n`. Byte equality fails on the
  // whole file, and a line-literal delta degenerates into the worst possible report:
  // every tracked line `extra`, every generated line `missing` (~1140 lines on the real
  // index) under the advice "regenerate and commit", which writes LF, gets CR back on
  // the next checkout, and loops. The terminators are normalized away before the delta
  // and the mismatch is reported as what it is.
  it('reports a CRLF checkout as a line-ending mismatch, not every line missing AND extra', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(/\n/g, '\r\n'), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({
      kind: 'drift',
      missing: [],
      extra: [],
      trackedCarriesCr: true,
    })
    expect(result.message).toContain('CRLF')
    // Not diagnosed as an ordering problem, and not closed with the bare imperative
    // that would send the contributor round the loop.
    expect(result.message).not.toContain('their order or surrounding whitespace')
    expect(result.message).not.toMatch(/^Regenerate with/m)
    // The recipe named is the one PROVEN to rewrite the working tree under the `eol=lf`
    // attribute, and it touches nothing but the one file. `git add --renormalize` is the
    // idiomatic-sounding alternative and it is inert when the INDEX is already LF — it
    // stages nothing, the CRs stay on disk, and the gate stays red: advice that reads
    // like a fix and leaves the contributor exactly where the loop started. A
    // `git config core.autocrlf false` step is the other thing it must NOT say: the
    // attribute overrides `autocrlf` on its own (verified on a `core.autocrlf=true`
    // clone: `rm` + `git checkout --` alone → `w/lf`, 0 CRs, config untouched), so the
    // config line would rewrite the contributor's repo-local git config for every file
    // to fix one.
    expect(result.message).toContain(
      `rm ${TRACKED_INDEX_PATH} && git checkout -- ${TRACKED_INDEX_PATH}`,
    )
    expect(result.message).not.toContain('git config')
    expect(result.message).not.toContain('--renormalize')
  })

  // Not a state git produces — it is what a hand-rolled `s/\n/\r\n/` conversion leaves
  // on a file that was already CRLF. Reported as the terminator problem it is, rather
  // than as the whole file having changed.
  it('reports a doubled terminator as a line-ending mismatch too', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(/\n/g, '\r\r\n'), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({
      kind: 'drift',
      missing: [],
      extra: [],
      trackedCarriesCr: true,
    })
  })

  // The third terminator state a text file can be in: a BARE CR (classic-Mac form, what
  // a hand-rolled `s/\n/\r/` conversion leaves). Split on `\n` alone the whole file is
  // ONE segment — every generated line `missing`, a single unreadable concatenation
  // `extra`, no terminator caution, and the report closes with the bare `pair update`
  // the CRLF branch exists to avoid: regenerating writes LF and whatever produced the
  // CRs puts them back. Same cause as CRLF, so the same diagnosis and the same recipe.
  it('reports a BARE-CR file as a line-ending mismatch, not one giant extra line', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(/\n/g, '\r'), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({
      kind: 'drift',
      missing: [],
      extra: [],
      trackedCarriesCr: true,
    })
    expect(result.message).toContain('carriage return')
    expect(result.message).not.toContain('their order or surrounding whitespace')
    expect(result.message).not.toMatch(/^Regenerate with/m)
    expect(result.message).toContain(
      `rm ${TRACKED_INDEX_PATH} && git checkout -- ${TRACKED_INDEX_PATH}`,
    )
  })

  it('still names the real content delta when the tracked file is BARE-CR', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(/\n/g, '\r'), 'utf-8')
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration'), { recursive: true })
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/collaboration/story-local-markers.md'),
      '# Story Local Markers\n',
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    const line =
      '- [Story Local Markers](.pair/knowledge/guidelines/collaboration/story-local-markers.md)'
    expect(result.report).toMatchObject({ kind: 'drift', missing: [line], extra: [] })
    expect(result.message).toContain('Once the checkout is normalized to LF')
  })

  it('still names the real content delta when the tracked file is ALSO CRLF', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(/\n/g, '\r\n'), 'utf-8')
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration'), { recursive: true })
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/collaboration/story-local-markers.md'),
      '# Story Local Markers\n',
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    const line =
      '- [Story Local Markers](.pair/knowledge/guidelines/collaboration/story-local-markers.md)'
    expect(result.report).toMatchObject({ kind: 'drift', missing: [line], extra: [] })
    expect(result.message).toContain('CRLF')
    // AC5 survives, behind its precondition: the command is named, the imperative is not bare.
    expect(result.message).toContain(REGENERATION_COMMAND)
    expect(result.message).toContain('Once the checkout is normalized to LF')
  })

  it('reports an LF tracked file as CRLF-free, so the caution never fires on a normal clone', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', trackedCarriesCr: false })
    expect(result.message).not.toContain('CRLF')
  })

  // ---- Differences a terminal cannot show -------------------------------------------
  //
  // AC-2 promises "the fix is obvious without a manual diff". A pair of missing/extra
  // lines that differ only in INVISIBLE bytes breaks that promise the same way a
  // terminator did: two identical-looking lines, one listed missing and one extra, and
  // no hint of what to change. The producers of such bytes are editors, not git: a
  // UTF-8 BOM (U+FEFF — Notepad, some Windows editors), a trailing space, a
  // non-breaking space or a zero-width space pasted from a web page. Each is one row
  // below; every row is rendered QUOTED with the invisible character escaped, and the
  // BOM — the one with a known producer and a known fix — also gets a named caution.
  it('names a leading byte-order mark, and renders the two look-alike lines escaped', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, '﻿' + readFileSync(tracked, 'utf-8'), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({
      kind: 'drift',
      missing: ['# pair'],
      extra: ['﻿# pair'],
      trackedCarriesBom: true,
    })
    expect(result.message).toContain('byte-order mark')
    expect(result.message).toContain('U+FEFF')
    // The pair is shown with the difference VISIBLE, not as two identical `# pair`s.
    expect(result.message).toContain('"\\ufeff# pair"')
    expect(result.message).toContain('"# pair"')
    // Regeneration DOES fix a BOM (verified: `pair update` on a BOM-prefixed index
    // rewrites it without one), so the call to action stays the bare imperative.
    expect(result.message).toMatch(/^Regenerate with/m)
  })

  it('renders a trailing-space look-alike pair escaped, with a caution naming the class', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [Product Requirements](.pair/adoption/product/PRD.md)'
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(line, `${line} `), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({
      kind: 'drift',
      missing: [line],
      extra: [`${line} `],
      trackedCarriesBom: false,
    })
    expect(result.message).toContain(`"${line} "`)
    expect(result.message).toContain(`"${line}"`)
    expect(result.message).toContain('characters a terminal does not show')
    // The class caution names the BOM as one possible class; the dedicated BOM caution
    // (which asserts the file STARTS with one) must not fire on a trailing space.
    expect(result.message).not.toContain('starts with a byte-order mark')
    expect(result.message).toMatch(/^Regenerate with/m)
  })

  it('renders a LEADING-space look-alike pair escaped', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [Product Requirements](.pair/adoption/product/PRD.md)'
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(line, ` ${line}`), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ missing: [line], extra: [` ${line}`] })
    expect(result.message).toContain(`" ${line}"`)
    expect(result.message).toContain('characters a terminal does not show')
  })

  it('renders a NON-BREAKING-space look-alike pair escaped', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [Testing Guidelines](.pair/knowledge/guidelines/testing/README.md)'
    const nbsp = line.replace('Testing Guidelines', 'Testing Guidelines')
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(line, nbsp), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ missing: [line], extra: [nbsp] })
    expect(result.message).toContain('Testing\\u00a0Guidelines')
    expect(result.message).toContain('characters a terminal does not show')
  })

  it('renders a ZERO-WIDTH-space look-alike pair escaped', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [How to start](.pair/knowledge/how-to/01-how-to-start.md)'
    // A zero-width space ADDED next to the real one: the line looks identical.
    const zw = line.replace('How to start', 'How to ​start')
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(line, zw), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ missing: [line], extra: [zw] })
    expect(result.message).toContain('How to \\u200bstart')
    expect(result.message).toContain('characters a terminal does not show')
  })

  // The paired path: a VISIBLE difference is rendered raw. Quoting every line would
  // make the common case (a whole missing entry) harder to read for no gain.
  it('renders a visibly different line raw, with no invisible-character caution', async () => {
    const root = await makeInSyncTree()
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration'), { recursive: true })
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/collaboration/story-local-markers.md'),
      '# Story Local Markers\n',
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    const line =
      '- [Story Local Markers](.pair/knowledge/guidelines/collaboration/story-local-markers.md)'
    expect(result.message).toContain(`  ${line}\n`)
    expect(result.message).not.toContain(`"${line}"`)
    expect(result.message).not.toContain('characters a terminal does not show')
    expect(result.message).not.toContain('starts with a byte-order mark')
  })

  // Two look-alike pairs plus one real delta in the same report: the real one stays raw
  // and readable, only the look-alikes are quoted.
  it('escapes only the look-alike pairs when a real delta is present too', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const prd = '- [Product Requirements](.pair/adoption/product/PRD.md)'
    writeFileSync(tracked, '﻿' + readFileSync(tracked, 'utf-8').replace(prd, `${prd} `), 'utf-8')
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration'), { recursive: true })
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/collaboration/story-local-markers.md'),
      '# Story Local Markers\n',
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    const real =
      '- [Story Local Markers](.pair/knowledge/guidelines/collaboration/story-local-markers.md)'
    expect(result.report).toMatchObject({
      missing: ['# pair', prd, real],
      extra: ['﻿# pair', `${prd} `],
    })
    expect(result.message).toContain(`  ${real}\n`)
    expect(result.message).toContain(`"${prd} "`)
    expect(result.message).toContain('"\\ufeff# pair"')
    expect(result.message).toContain('4 line(s) above carry characters a terminal does not show')
  })

  // ---- Round 7: the invisible-character class is Unicode's, not a hand list ------------
  //
  // `ZERO_WIDTH` was a hand-picked list (BOM, ZWSP..ZWJ, WJ, SHY, LS/PS) and missed the
  // bidi format characters — the invisible bytes a browser or Word paste most often
  // carries (U+200E LRM, U+200F RLM, U+061C ALM, the U+2066–2069 isolates), plus the
  // invisible operators U+2061–2064, U+180E and the variation selectors. Probe at the
  // reviewed head: `compareIndex('- [A](a.md)\n', '- [A\u200E](a.md)\n')` rendered BOTH
  // lines raw — two identical `- [A](a.md)` and no caution, the exact shape the
  // look-alike rendering exists to prevent. The class is now `\p{Cf}` + `\p{Zl}` +
  // `\p{Zp}` + `\p{Variation_Selector}` (Node 24 Unicode tables: 432 code points), so
  // every row below is one member of the authoritative class, not a new hand entry.
  it.each([
    ['U+200E LEFT-TO-RIGHT MARK', '\u200E'],
    ['U+200F RIGHT-TO-LEFT MARK', '\u200F'],
    ['U+061C ARABIC LETTER MARK', '\u061C'],
    ['U+2066 LEFT-TO-RIGHT ISOLATE', '\u2066'],
    ['U+2069 POP DIRECTIONAL ISOLATE', '\u2069'],
    ['U+202E RIGHT-TO-LEFT OVERRIDE', '\u202E'],
    ['U+180E MONGOLIAN VOWEL SEPARATOR', '\u180E'],
    ['U+2061 FUNCTION APPLICATION', '\u2061'],
    ['U+2064 INVISIBLE PLUS', '\u2064'],
    ['U+FE0F VARIATION SELECTOR-16', '\uFE0F'],
    ['U+2028 LINE SEPARATOR', '\u2028'],
    ['U+00AD SOFT HYPHEN', '\u00AD'],
    ['U+FEFF BOM mid-line', '\uFEFF'],
  ])('renders a %s look-alike pair escaped', (_name, char) => {
    const line = '- [A](a.md)'
    const spoiled = `- [A${char}](a.md)`
    const hex = `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`

    const report = compareIndex(`${line}\n`, `${spoiled}\n`)
    const message = formatReport(report, '/repo')

    expect(report).toMatchObject({ kind: 'drift', missing: [line], extra: [spoiled] })
    expect(message).toContain(`  "${line}"\n`)
    expect(message).toContain(`  "- [A${hex}](a.md)"\n`)
    expect(message).not.toContain(`  ${spoiled}\n`)
    expect(message).toContain('characters a terminal does not show')
  })

  // Above the BMP the format class continues (the TAG characters U+E0001/E0020–E007F
  // that spell emoji flag sequences, the supplementary variation selectors). One code
  // point is two UTF-16 units there, so a `charCodeAt(0)` escape would print the lone
  // high surrogate. Spelled `\u{XXXXX}` — the form JavaScript itself reads back.
  it.each([
    ['U+E0001 LANGUAGE TAG', '\u{E0001}', 'e0001'],
    ['U+E007F CANCEL TAG', '\u{E007F}', 'e007f'],
    ['U+E0100 VARIATION SELECTOR-17', '\u{E0100}', 'e0100'],
  ])('renders an astral %s look-alike pair escaped as \\u{XXXXX}', (_name, char, hex) => {
    const line = '- [A](a.md)'
    const spoiled = `- [A${char}](a.md)`

    const message = formatReport(compareIndex(`${line}\n`, `${spoiled}\n`), '/repo')

    expect(message).toContain(`  "- [A\\u{${hex}}](a.md)"\n`)
    expect(message).toContain(`  "${line}"\n`)
    expect(message).toContain('characters a terminal does not show')
  })

  // The paired negative: an astral character that is VISIBLE (an emoji base with no
  // selector) is a real difference and stays raw — `\p{Cf}` must not swallow it.
  it('renders a visibly different astral character raw', () => {
    const message = formatReport(compareIndex('- [A](a.md)\n', '- [A\u{1F680}](a.md)\n'), '/repo')

    expect(message).toContain('  - [A\u{1F680}](a.md)\n')
    expect(message).not.toContain('"- [A')
    expect(message).not.toContain('characters a terminal does not show')
  })

  // The reviewer's row, through the real pipeline: a bidi mark pasted into a tracked
  // entry of a fixture tree.
  it('renders a LEFT-TO-RIGHT-MARK look-alike pair escaped on a real tree', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [How to start](.pair/knowledge/how-to/01-how-to-start.md)'
    const lrm = line.replace('How to start', 'How to start\u200E')
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(line, lrm), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ missing: [line], extra: [lrm] })
    expect(result.message).toContain('How to start\\u200e')
    expect(result.message).toContain(`  "${line}"\n`)
    expect(result.message).toContain('characters a terminal does not show')
  })

  // ---- Round 7: an UNPAIRED invisible line is escaped too ----------------------------
  //
  // Only pairs were escaped. A tracked line consisting of a lone U+200B has no
  // counterpart (it is not White_Space, so `contentLines` keeps it), and rendered raw it
  // printed `1 extra line(s):` followed by an apparently blank line — content the
  // reader cannot see, with no caution. Any line that CARRIES an invisible character
  // is now escaped, paired or not.
  it('escapes an unpaired extra line that consists only of a zero-width space', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, readFileSync(tracked, 'utf-8') + '\u200B\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', missing: [], extra: ['\u200B'] })
    expect(result.message).toContain('1 extra line(s):\n  "\\u200b"\n')
    expect(result.message).not.toContain('\n  \u200B\n')
    expect(result.message).toContain('1 line(s) above carry characters a terminal does not show')
  })

  it('escapes an unpaired extra line that carries a non-breaking space next to its clean twin', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [Testing Guidelines](.pair/knowledge/guidelines/testing/README.md)'
    const nbsp = line.replace('Testing Guidelines', 'Testing\u00A0Guidelines')
    // The clean line stays, so the NBSP line is EXTRA with nothing missing to pair with.
    writeFileSync(
      tracked,
      readFileSync(tracked, 'utf-8').replace(line, `${line}\n${nbsp}`),
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ missing: [], extra: [nbsp] })
    expect(result.message).toContain('Testing\\u00a0Guidelines')
    expect(result.message).not.toContain(`  ${nbsp}\n`)
    expect(result.message).toContain('1 line(s) above carry characters a terminal does not show')
  })

  // The paired negative for the unpaired rule: an unpaired line with NO invisible
  // character — the common whole-entry delta — is still raw (already asserted by the
  // "visibly different line raw" row above; restated here on the multi-line shape).
  it('leaves an unpaired plain extra line raw when another line is escaped', () => {
    const message = formatReport(
      compareIndex('- [A](a.md)\n', '- [A](a.md) \n- [B](b.md)\n'),
      '/repo',
    )

    expect(message).toContain('  "- [A](a.md) "\n')
    expect(message).toContain('  - [B](b.md)\n')
    expect(message).not.toContain('"- [B](b.md)"')
  })

  // ---- Round 7: the caution counts the quoted LINES ------------------------------------
  //
  // It counted DISTINCT visible forms: one missing `- [A](a.md)` against two extra
  // variants (`- [A](a.md) `, `   - [A](a.md)`) printed three quoted lines under a
  // caution that said `1 missing/extra pair(s)`.
  it('counts every quoted line in the caution, not the distinct visible forms', () => {
    const message = formatReport(
      compareIndex('- [A](a.md)\n', '- [A](a.md) \n   - [A](a.md)\n'),
      '/repo',
    )

    expect(message).toContain('1 missing line(s):\n  "- [A](a.md)"\n')
    expect(message).toContain(
      '2 extra line(s):\n  "- [A](a.md) "\n  "\\u0020\\u0020\\u0020- [A](a.md)"\n',
    )
    expect(message).toContain('3 line(s) above carry characters a terminal does not show')
  })

  // ---- Round 7: a run of spaces is in the class -----------------------------------------
  //
  // `visibleForm` folded each space-like to ONE space but kept runs, so `- [A  B](a.md)`
  // against `- [A B](a.md)` was not a look-alike and printed raw. A doubled space is
  // technically visible (a wider gap) and just as easy to miss in a 50-line list, so
  // runs collapse in the KEY — and, because quotes alone would not show the width, a
  // run of two or more spaces is spelled `\u0020\u0020` in the RENDERING.
  it('renders a doubled-space look-alike pair escaped, with the run spelled out', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const line = '- [How to start](.pair/knowledge/how-to/01-how-to-start.md)'
    const doubled = line.replace('How to start', 'How to  start')
    writeFileSync(tracked, readFileSync(tracked, 'utf-8').replace(line, doubled), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ missing: [line], extra: [doubled] })
    expect(result.message).toContain(
      '"- [How to\\u0020\\u0020start](.pair/knowledge/how-to/01-how-to-start.md)"',
    )
    expect(result.message).toContain(`  "${line}"\n`)
    expect(result.message).toContain('characters a terminal does not show')
  })

  // A single interior space is never touched: it is the ordinary word separator and
  // spelling it out would quote-and-escape every entry of a plain look-alike pair.
  it('keeps single spaces literal inside an escaped line', () => {
    const message = formatReport(compareIndex('- [A B](a.md)\n', '- [A B](a.md) \n'), '/repo')

    expect(message).toContain('  "- [A B](a.md) "\n')
    expect(message).not.toContain('A\\u0020B')
  })

  // ---- Round 7: one space-like class, used by KEY and RENDERING alike ------------------
  //
  // The class was written twice — `SPACE_LIKE` (with `\t`) and an inline copy in
  // `escapeInvisible` (without) — so a code point added to one list and not the other
  // would make a pair DETECTED (key folds it) but rendered UNESCAPED (still two identical
  // lines). Every member is asserted on both sides here; the tab shows as `\t` because
  // `JSON.stringify` already spells it.
  it.each([
    ['U+00A0 NO-BREAK SPACE', '\u00A0', '\\u00a0'],
    ['U+2000 EN QUAD', '\u2000', '\\u2000'],
    ['U+2009 THIN SPACE', '\u2009', '\\u2009'],
    ['U+200A HAIR SPACE', '\u200A', '\\u200a'],
    ['U+202F NARROW NO-BREAK SPACE', '\u202F', '\\u202f'],
    ['U+205F MEDIUM MATHEMATICAL SPACE', '\u205F', '\\u205f'],
    ['U+3000 IDEOGRAPHIC SPACE', '\u3000', '\\u3000'],
    ['U+0009 TAB', '\t', '\\t'],
  ])('detects AND escapes a %s look-alike pair', (_name, char, escaped) => {
    const line = '- [A B](a.md)'
    const spoiled = `- [A${char}B](a.md)`

    const report = compareIndex(`${line}\n`, `${spoiled}\n`)
    const message = formatReport(report, '/repo')

    expect(report).toMatchObject({ missing: [line], extra: [spoiled] })
    expect(message).toContain(`  "- [A${escaped}B](a.md)"\n`)
    expect(message).toContain(`  "${line}"\n`)
    expect(message).toContain('2 line(s) above carry characters a terminal does not show')
  })

  // Both editor-class problems at once: the CR caution owns the precondition (git puts
  // the CRs back; it does not put a BOM back), the BOM caution is still named.
  it('names both a BOM and a CR when the file carries both, with the CR owning the precondition', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, '﻿' + readFileSync(tracked, 'utf-8').replace(/\n/g, '\r\n'), 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ trackedCarriesBom: true, trackedCarriesCr: true })
    expect(result.message).toContain('byte-order mark')
    expect(result.message).toContain('CRLF')
    expect(result.message).toContain('Once the checkout is normalized to LF, regenerate with')
    expect(result.message).not.toMatch(/^Regenerate with/m)
  })

  it('reports a BOM-free LF file with the flag off, so the caution never fires on a normal clone', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', trackedCarriesBom: false })
    expect(result.message).not.toContain('starts with a byte-order mark')
  })

  // ---- The tracked file cannot be read ---------------------------------------------
  //
  // The generator ran and the KB tree is complete: only the FILE at `.pair/llms.txt` is
  // bad. Reported as the KB tree being unreadable ("partially unpacked install") this
  // sends the contributor to inspect or reinstall a tree that is fine. One row per way
  // a file at a fixed path can fail `readFile` after `stat` succeeded; the recipe named
  // is `git checkout -- .pair/llms.txt`, verified (git 2.55) to replace a chmod-000
  // file, a directory (empty or not) and a broken symlink at that path.
  it('reports an EACCES on the tracked file as an unreadable INDEX, not an unreadable KB tree', async () => {
    const root = await makeInSyncTree()
    const trackedPath = join(root, TRACKED_INDEX_PATH)
    const denied = Object.assign(new Error(`EACCES: permission denied, open '${trackedPath}'`), {
      code: 'EACCES',
    })
    const lockedIndex: LlmsSourceFs = {
      ...readOnlyFileSystem,
      readFile: file => {
        if (file === trackedPath) throw denied
        return readOnlyFileSystem.readFile(file)
      },
    }

    const result = await checkLlmsIndexDrift(root, lockedIndex)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({
      kind: 'unreadable-index',
      path: trackedPath,
      detail: denied.message,
    })
    expect(result.message).toContain(`could not read the tracked index ${trackedPath}`)
    expect(result.message).toContain('EACCES')
    expect(result.message).toContain(`git checkout -- ${TRACKED_INDEX_PATH}`)
    // Not the KB-tree diagnosis, and not the drift advice: neither applies.
    expect(result.message).not.toContain('could not read the knowledge base')
    expect(result.message).not.toContain('partially unpacked')
    expect(result.message).not.toContain(REGENERATION_COMMAND)
  })

  it('reports a DIRECTORY at the tracked path (EISDIR) as an unreadable index', async () => {
    const root = await makeInSyncTree()
    const trackedPath = join(root, TRACKED_INDEX_PATH)
    rmSync(trackedPath, { force: true })
    mkdirSync(trackedPath)

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({ kind: 'unreadable-index', path: trackedPath })
    expect(result.message).toContain('EISDIR')
    expect(result.message).toContain(`could not read the tracked index ${trackedPath}`)
    expect(result.message).toContain(`git checkout -- ${TRACKED_INDEX_PATH}`)
    expect(result.message).not.toContain('could not read the knowledge base')
    expect(result.message).not.toContain(REGENERATION_COMMAND)
  })

  // The real permission bit, kept beside the injected row as proof the injected error
  // is the one the OS raises. Explicitly skipped under a uid the bit does not bind.
  it('reports a real chmod-000 tracked file the same way', async ctx => {
    const root = await makeInSyncTree()
    const trackedPath = join(root, TRACKED_INDEX_PATH)
    chmodSync(trackedPath, 0o000)

    let readable = true
    try {
      readFileSync(trackedPath)
    } catch {
      readable = false
    }
    if (readable) {
      chmodSync(trackedPath, 0o644)
      ctx.skip('this uid ignores the permission bit (root) — the case cannot exist here')
    }

    try {
      const result = await checkLlmsIndexDrift(root)

      expect(result.report).toMatchObject({ kind: 'unreadable-index', path: trackedPath })
      expect(result.message).toContain('EACCES')
      expect(result.message).not.toContain('could not read the knowledge base')
    } finally {
      chmodSync(trackedPath, 0o644)
    }
  })

  // The boundary row that is NOT unreadable-index: a dangling symlink fails `stat`
  // (ENOENT), so `exists` is false and it is the ABSENT-file drift. Pinned here so the
  // table of what a bad path yields is closed, not re-derived per report.
  it('reports a DANGLING symlink at the tracked path as an absent file, not an unreadable index', async () => {
    const root = await makeInSyncTree()
    const trackedPath = join(root, TRACKED_INDEX_PATH)
    rmSync(trackedPath, { force: true })
    symlinkSync(join(root, 'nowhere.txt'), trackedPath)

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', trackedExists: false })
    expect(result.message).toContain('does not exist')
  })

  // The story's edge case names "locale-dependent sort" verbatim. `localeCompare`
  // passes no locale and uses the runtime's ICU default, so a Node built without full
  // ICU orders the index differently and the gate goes red on an untouched tree.
  // `PRD.md` vs `context-map.md` is a pair where ICU (case-insensitive: context-map
  // first) and the code-unit comparator ('P' 0x50 < 'c' 0x63: PRD first) disagree.
  it('orders entries by code unit, not by the runtime locale', async () => {
    const root = makeTree({
      ...KB_FILES,
      '.pair/adoption/product/context-map.md': '# Context Map\n',
    })

    const generated = await generateLlmsTxt(readOnlyFileSystem, root)

    expect(generated.indexOf('product/PRD.md')).toBeLessThan(
      generated.indexOf('product/context-map.md'),
    )
  })

  it('is deterministic: the same tree yields the same generated index twice', async () => {
    const root = await makeInSyncTree({
      '.pair/knowledge/guidelines/b/second.md': '# Second\n',
      '.pair/knowledge/guidelines/a/first.md': '# First\n',
      '.pair/adoption/decision-log/2026-01-01-a-choice.md': '# A choice\n',
    })

    const first = await generateLlmsTxt(readOnlyFileSystem, root)
    const second = await generateLlmsTxt(readOnlyFileSystem, root)

    expect(second).toBe(first)
    // Ordering is content-derived (sorted by path), not filesystem-walk order.
    expect(first.indexOf('a/first.md')).toBeLessThan(first.indexOf('b/second.md'))
  })

  it('is deterministic across runs: two checks on the same tree report identically', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')

    const first = await checkLlmsIndexDrift(root)
    const second = await checkLlmsIndexDrift(root)

    expect(second.message).toBe(first.message)
  })
})

describe('compareIndex — the pure line-level comparison', () => {
  it('is in-sync only on byte equality', () => {
    expect(compareIndex('a\nb\n', 'a\nb\n').kind).toBe('in-sync')
    expect(compareIndex('a\nb\n', 'a\nb').kind).toBe('drift')
  })

  it('reports a whitespace/ordering-only difference with empty missing AND extra', () => {
    const report = compareIndex('- [A](a)\n- [B](b)\n', '- [B](b)\n- [A](a)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: [] })
    expect(formatReport(report, '/repo')).toContain('order')
  })

  it('ignores blank lines, which carry no index information', () => {
    expect(compareIndex('- [A](a)\n\n\n', '- [A](a)\n').kind).toBe('drift')
    expect(compareIndex('- [A](a)\n\n\n', '- [A](a)\n')).toMatchObject({ missing: [], extra: [] })
  })

  // `.pair/llms.txt` is touched by every ADL/guideline addition, so parallel branches
  // conflict on it routinely and a "keep both sides" resolution duplicates an entry
  // line. Diffed as SETS that duplicate is invisible: 0 missing / 0 extra plus the
  // "order or whitespace" sentence — a confidently wrong diagnosis in exactly the
  // case where the contributor needs the diff (AC2).
  it('reports a DUPLICATED line as extra — multiplicity, not set membership', () => {
    const report = compareIndex(
      '- [A](a.md)\n- [B](b.md)\n',
      '- [A](a.md)\n- [A](a.md)\n- [B](b.md)\n',
    )

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: ['- [A](a.md)'] })
    expect(formatReport(report, '/repo')).not.toContain('order')
  })

  // The terminator states git can hand a checkout: LF (the generator's own) and CRLF
  // (`core.autocrlf=true` on Windows). A file half-converted by a merge carries both.
  it('normalizes the terminator before diffing, flagging CRLF instead of every line', () => {
    const report = compareIndex('- [A](a.md)\n- [B](b.md)\n', '- [A](a.md)\r\n- [B](b.md)\r\n')

    expect(report).toMatchObject({
      kind: 'drift',
      missing: [],
      extra: [],
      trackedCarriesCr: true,
    })
    expect(formatReport(report, '/repo')).not.toContain('their order or surrounding whitespace')
  })

  it('flags a MIXED-terminator file too — one CRLF line is enough', () => {
    const report = compareIndex('- [A](a.md)\n- [B](b.md)\n', '- [A](a.md)\r\n- [B](b.md)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: [], trackedCarriesCr: true })
  })

  // `## Heading\r` must not read as a heading the generator dropped: under a naive
  // split every section of a CRLF file looks emptied and the report tells the
  // contributor their KB tree is incomplete — on a complete tree.
  it('does not read CRLF headings as emptied sections', () => {
    const report = compareIndex('## Adoption\n- [A](a.md)\n', '## Adoption\r\n- [A](a.md)\r\n')

    expect(report).toMatchObject({ kind: 'drift', emptiedSections: [] })
    expect(formatReport(report, '/repo')).not.toContain('do not regenerate')
  })

  // The terminator domain is closed here, one row per state a tracked file can be in:
  // LF (above), CRLF, mixed, doubled `\r\r\n`, bare CR, CR mixed with LF, and a stray CR
  // left at EOF. Every state carrying a CR is the same diagnosis, because it is the same
  // cause and the same exit.
  it('normalizes a BARE-CR terminator, and does not read its headings as emptied sections', () => {
    const report = compareIndex('## Adoption\n- [A](a.md)\n', '## Adoption\r- [A](a.md)\r')

    expect(report).toMatchObject({
      kind: 'drift',
      missing: [],
      extra: [],
      trackedCarriesCr: true,
      emptiedSections: [],
    })
    expect(formatReport(report, '/repo')).not.toContain('their order or surrounding whitespace')
    expect(formatReport(report, '/repo')).not.toContain('do not regenerate')
  })

  it('flags a file mixing BARE CR and LF — one CR is enough', () => {
    const report = compareIndex('- [A](a.md)\n- [B](b.md)\n', '- [A](a.md)\r- [B](b.md)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: [], trackedCarriesCr: true })
  })

  it('flags a leading byte-order mark on the tracked side', () => {
    expect(compareIndex('# pair\n', '\uFEFF# pair\n')).toMatchObject({
      kind: 'drift',
      missing: ['# pair'],
      extra: ['\uFEFF# pair'],
      trackedCarriesBom: true,
    })
  })

  it('does not flag a BOM that is not at the start — that is an ordinary look-alike line', () => {
    expect(compareIndex('a\nb\n', 'a\n\uFEFFb\n')).toMatchObject({
      trackedCarriesBom: false,
      missing: ['b'],
      extra: ['\uFEFFb'],
    })
  })

  it('flags a stray CR left at end of file', () => {
    const report = compareIndex('- [A](a.md)\n', '- [A](a.md)\n\r')

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: [], trackedCarriesCr: true })
  })

  it('reports a DROPPED duplicate as missing when the generator emits a line twice', () => {
    const report = compareIndex('- [A](a.md)\n- [A](a.md)\n', '- [A](a.md)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: ['- [A](a.md)'], extra: [] })
  })
})

describe('main — the CLI wrapper', () => {
  // The catch path asserted through the INJECTED fs seam, so the coverage does not
  // depend on the uid the suite runs under. Probing a `chmod 000` directory and
  // skipping the body when it stays readable (root — the default user in a plain
  // `node:*` image and in many self-hosted runners) makes the test vacuous exactly
  // there: deleting `main`'s try/catch would re-introduce the unhandled rejection and
  // the suite would still print all-green, with no skip marker to show the gap.
  it('turns an UNREADABLE KB directory into a report, not an unhandled rejection', async () => {
    const root = await makeInSyncTree()
    const scandirDenied = Object.assign(
      new Error(`EACCES: permission denied, scandir '${join(root, '.pair/knowledge/guidelines')}'`),
      { code: 'EACCES' },
    )
    const unreadableTree: LlmsSourceFs = {
      ...readOnlyFileSystem,
      readdir: () => {
        throw scandirDenied
      },
    }

    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root, unreadableTree)

      expect(process.exitCode).toBe(1)
      const printed = errors.mock.calls.map(call => String(call[0])).join('\n')
      expect(printed).toContain('llms-index')
      expect(printed).toContain('EACCES')
      expect(printed).toContain('could not read the knowledge base')
      // A broken setup is not a stale index: it must NOT send anyone to regenerate.
      expect(printed).not.toContain(REGENERATION_COMMAND)
      // And not the OTHER unreadable thing: the index file is fine here.
      expect(printed).not.toContain('could not read the tracked index')
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
    }
  })

  // The evidence command of the round-6 finding: `chmod 000 .pair/llms.txt` (here: a
  // directory in its place, the uid-independent form) printed the KB-tree diagnosis.
  it('exits 1 with the tracked-index diagnosis when the index file is a directory', async () => {
    const root = await makeInSyncTree()
    const trackedPath = join(root, TRACKED_INDEX_PATH)
    rmSync(trackedPath, { force: true })
    mkdirSync(trackedPath)

    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root)

      expect(process.exitCode).toBe(1)
      const printed = errors.mock.calls.map(call => String(call[0])).join('\n')
      expect(printed).toContain(`could not read the tracked index ${trackedPath}`)
      expect(printed).toContain('EISDIR')
      expect(printed).not.toContain('could not read the knowledge base')
      expect(printed).not.toContain('partially unpacked')
      expect(printed).not.toContain(REGENERATION_COMMAND)
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
    }
  })

  // The same path against a REAL permission-denied directory — kept as the proof that
  // the injected error is the one the OS actually raises. Explicitly SKIPPED, never
  // silently vacuous, under a uid the permission bit does not bind.
  it('reports a real chmod-000 KB directory the same way', async ctx => {
    const root = await makeInSyncTree()
    const locked = join(root, '.pair/knowledge/guidelines/locked')
    mkdirSync(locked, { recursive: true })
    writeFileSync(join(locked, 'rule.md'), '# Rule\n', 'utf-8')
    chmodSync(locked, 0o000)

    let readable = true
    try {
      readdirSync(locked)
    } catch {
      readable = false
    }
    if (readable) {
      chmodSync(locked, 0o700)
      ctx.skip('this uid ignores the permission bit (root) — the case cannot exist here')
    }

    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root)

      expect(process.exitCode).toBe(1)
      const printed = errors.mock.calls.map(call => String(call[0])).join('\n')
      expect(printed).toContain('llms-index')
      expect(printed).toContain('EACCES')
      expect(printed).not.toContain(REGENERATION_COMMAND)
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
      chmodSync(locked, 0o700)
    }
  })

  it('prints the in-sync report and leaves the exit code untouched on a clean tree', async () => {
    const root = await makeInSyncTree()
    const previousExitCode = process.exitCode
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      process.exitCode = undefined
      await main(root)

      expect(process.exitCode).toBeUndefined()
      expect(String(logs.mock.calls[0]?.[0])).toContain('matches the generator')
    } finally {
      logs.mockRestore()
      process.exitCode = previousExitCode
    }
  })

  it('exits 1 on drift', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')
    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root)

      expect(process.exitCode).toBe(1)
      expect(String(errors.mock.calls[0]?.[0])).toContain(REGENERATION_COMMAND)
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
    }
  })
})
