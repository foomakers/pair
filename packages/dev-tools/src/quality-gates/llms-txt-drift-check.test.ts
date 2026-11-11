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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROOT_PACKAGE_JSON } from './pre-push-gate-composition'
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

  it('names a command that EXISTS — a root script, resolved against the real package.json (AC5)', async () => {
    // The producer -> published identity -> consumer chain for the advice: the root
    // `package.json` (producer) defines the script name (published identity) that the
    // printed remedy (consumer) tells a contributor to type. Asserted against the REAL
    // root manifest, the way `pre-push-gate-composition` asserts its own remedy, so a
    // renamed or deleted script turns the advice red here instead of in a shell.
    const runnerForm = /^pnpm (?<script>[A-Za-z0-9_:.-]+)$/.exec(REGENERATION_COMMAND)
    expect(runnerForm?.groups?.script).toBeDefined()

    const rootScripts = (
      JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8')) as {
        scripts: Record<string, string>
      }
    ).scripts
    expect(Object.keys(rootScripts)).toContain(runnerForm?.groups?.script)
  })

  it("never names `pair`, which is not this repo's binary (AC5)", async () => {
    // `apps/pair-cli` publishes its bin as `pair-cli`; `pair` resolves nowhere — not on
    // PATH, not in any workspace `node_modules/.bin`, not as a root script. It is also
    // the wrong ACTION: `pair-cli update` with no `--source` installs the published
    // knowledge base over `.pair/knowledge/**` and reverts the guideline that reddened
    // the gate.
    expect(REGENERATION_COMMAND).not.toMatch(/\bpair\b(?!-cli)/)
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

  it('reports a MISSING KB tree as a broken setup, a distinct outcome from drift', async () => {
    const root = makeTree({ 'README.md': '# not a pair project\n' })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('broken-setup')
    expect(result.message).not.toContain(REGENERATION_COMMAND)
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
    // Regeneration DOES fix a BOM (verified: the real regeneration on a BOM-prefixed index
    // rewrites it without one), so the call to action stays the bare imperative.
    expect(result.message).toMatch(/^Regenerate with/m)
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
  // look-alike rendering exists to prevent. The class became Unicode's — round 7 named
  // it `\p{Cf}` + `\p{Zl}` + `\p{Zp}` + `\p{Variation_Selector}`, round 8 (below)
  // `\p{Default_Ignorable_Code_Point}` + `\p{Zl}` + `\p{Zp}` — so every row below is
  // one member of the authoritative class, not a new hand entry.
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

  // ---- Round 8: the class is Unicode's RENDERING-ignorable property, not its FORMAT one --
  //
  // `\p{Cf}` is the format class, and format is not "renders as nothing" in either
  // direction. Measured on Node 24.15.0 (the runtime whose tables define both classes,
  // enumerating U+0000–U+10FFFF): 4036 Default_Ignorable code points are NOT `Cf` —
  // U+034F (Mn), U+115F–1160, U+3164, U+FFA0 (Lo — the Hangul fillers), U+17B4–5,
  // U+180B–D, U+180F, U+FE00–F (Mn), U+2065, U+FFF0–8, U+E0000, U+E0002–1F,
  // U+E0080–E0FFF (Cn, reserved-but-ignorable) — and 32 `Cf` code points are NOT
  // Default_Ignorable: U+0600–0605, U+06DD, U+070F, U+0890–1, U+08E2, U+FFF9–B,
  // U+110BD, U+110CD, U+13430–F, the number signs and format controls a font DOES draw.
  // Probe at the reviewed head: `compareIndex('- [A](a.md)\n', '- [A͏](a.md)\n')`
  // printed both lines RAW with no caution (two identical-looking lines — the shape
  // round 7 fixed for U+200E), while `- [A۝](a.md)` was quoted under a caution that
  // claimed the terminal does not show it. The class is now
  // `\p{Default_Ignorable_Code_Point}` + `\p{Zl}` + `\p{Zp}`: every variation selector
  // is DI (VS \ DI = 0 measured), no DI code point is White_Space (DI ∩ White_Space = 0,
  // so the space-like key is untouched), and the caution's claim holds for every member.
  // One row per (range × general category) of DI \ Cf.
  it.each([
    ['U+034F COMBINING GRAPHEME JOINER (Mn)', '͏'],
    ['U+17B4 KHMER VOWEL INHERENT AQ (Mn)', '឴'],
    ['U+180B MONGOLIAN FREE VARIATION SELECTOR ONE (Mn)', '᠋'],
    ['U+115F HANGUL CHOSEONG FILLER (Lo)', 'ᅟ'],
    ['U+1160 HANGUL JUNGSEONG FILLER (Lo)', 'ᅠ'],
    ['U+3164 HANGUL FILLER (Lo)', 'ㅤ'],
    ['U+FFA0 HALFWIDTH HANGUL FILLER (Lo)', 'ﾠ'],
    ['U+2065 reserved, default-ignorable (Cn)', '⁥'],
    ['U+FFF0 reserved, default-ignorable (Cn)', '￰'],
    ['U+FFF8 reserved, default-ignorable (Cn)', '￸'],
  ])('renders a %s look-alike pair escaped — Default_Ignorable but not Cf', (_name, char) => {
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

  it.each([
    ['U+E0000 reserved, default-ignorable (Cn)', '\u{E0000}', 'e0000'],
    ['U+E0002 reserved, default-ignorable (Cn)', '\u{E0002}', 'e0002'],
    ['U+E0080 reserved, default-ignorable (Cn)', '\u{E0080}', 'e0080'],
    ['U+E0FFF reserved, default-ignorable (Cn)', '\u{E0FFF}', 'e0fff'],
  ])('renders an astral %s look-alike pair escaped as \\u{XXXXX}', (_name, char, hex) => {
    const line = '- [A](a.md)'
    const spoiled = `- [A${char}](a.md)`

    const message = formatReport(compareIndex(`${line}\n`, `${spoiled}\n`), '/repo')

    expect(message).toContain(`  "- [A\\u{${hex}}](a.md)"\n`)
    expect(message).toContain(`  "${line}"\n`)
    expect(message).toContain('characters a terminal does not show')
  })

  // The paired negative: a `Cf` code point that is NOT Default_Ignorable is one a font
  // draws (the Arabic number signs sit over the digits that follow; END OF AYAH is a
  // visible ornament; the interlinear annotation anchors are kept out of DI by Unicode
  // so that an unsupported annotation does not vanish). Quoting them would keep the
  // difference readable, but the caution's "characters a terminal does not show" would
  // be false for the row — they stay raw. One row per range of Cf \ DI.
  it.each([
    ['U+0600 ARABIC NUMBER SIGN', '؀'],
    ['U+0605 ARABIC NUMBER MARK ABOVE', '؅'],
    ['U+06DD ARABIC END OF AYAH', '۝'],
    ['U+070F SYRIAC ABBREVIATION MARK', '܏'],
    ['U+0890 ARABIC POUND MARK ABOVE', '࢐'],
    ['U+08E2 ARABIC DISPUTED END OF AYAH', '࣢'],
    ['U+FFF9 INTERLINEAR ANNOTATION ANCHOR', '￹'],
    ['U+FFFB INTERLINEAR ANNOTATION TERMINATOR', '￻'],
    ['U+110BD KAITHI NUMBER SIGN', '\u{110BD}'],
    ['U+110CD KAITHI NUMBER SIGN ABOVE', '\u{110CD}'],
    ['U+13430 EGYPTIAN HIEROGLYPH VERTICAL JOINER', '\u{13430}'],
    ['U+1343F EGYPTIAN HIEROGLYPH END WALLED ENCLOSURE', '\u{1343F}'],
  ])('renders a visible %s raw — Cf but not Default_Ignorable', (_name, char) => {
    const spoiled = `- [A${char}](a.md)`

    const message = formatReport(compareIndex('- [A](a.md)\n', `${spoiled}\n`), '/repo')

    expect(message).toContain(`  ${spoiled}\n`)
    expect(message).toContain('  - [A](a.md)\n')
    expect(message).not.toContain('"- [A')
    expect(message).not.toContain('characters a terminal does not show')
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
})

describe('compareIndex — the pure line-level comparison', () => {

  it('reports a whitespace/ordering-only difference with empty missing AND extra', () => {
    const report = compareIndex('- [A](a)\n- [B](b)\n', '- [B](b)\n- [A](a)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: [] })
    expect(formatReport(report, '/repo')).toContain('order')
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
})
