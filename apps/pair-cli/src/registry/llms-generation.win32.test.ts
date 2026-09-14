/**
 * The THIRD environment axis of the same invariant `.gitattributes` (line terminator)
 * and the code-unit comparator (collation) already close: `.pair/llms.txt` must be
 * byte-reproducible on any machine that checks it out, and Windows is not excluded as
 * a development platform (ADL
 * `2026-09-01-a-byte-compared-generated-artifact-sorts-by-codepoint.md`).
 *
 * `path.join` is PLATFORM-BOUND. Building an entry path with it emitted
 * `.pair/knowledge/...` on POSIX and `.pair\knowledge\...` on Windows — a link form no
 * markdown renderer and no agent resolves, shipped into every adopter's `.pair/llms.txt`
 * by `pair-cli install`/`update`, and undetectable by the drift gate, which reports it
 * as 562 missing + 562 extra lines closing with the bare "regenerate and commit".
 *
 * WHY THIS FILE MOCKS `path`, and why that is not faking the boundary: Node's own
 * `lib/path.js` ends with `module.exports = isWindows ? win32 : posix`, so on Windows
 * `require('path')` IS `path.win32` — the object substituted below is Node's REAL win32
 * implementation, taken from the REAL `path` module of the running Node, not a
 * hand-written stand-in. Running the generator against it is the only way a POSIX CI can
 * execute the Windows row at all: on POSIX, `join` and `posix.join` are the same
 * function, so no fixture can tell the fixed code from the broken code.
 *
 * The in-memory file system normalizes `\` to `/` before its lookup because the Win32
 * file APIs accept both separators interchangeably — a Windows machine finds
 * `C:\repo\.pair\adoption` and `C:\repo/.pair/adoption` alike. Only the EMITTED ENTRY
 * STRINGS are under test.
 */
import type { Dirent } from 'fs'
import * as pathModule from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path')
  return { ...actual.win32, win32: actual.win32, posix: actual.posix, default: actual.win32 }
})

import { generateLlmsTxt, type LlmsSourceFs } from './llms-generation'

/**
 * A read-only in-memory tree keyed by POSIX paths, tolerant of either separator on the
 * way in — the tolerance the Win32 file APIs themselves have.
 */
function createFs(files: Record<string, string>): LlmsSourceFs {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const paths = Object.keys(files).map(normalize)

  const childrenOf = (dir: string): { name: string; directory: boolean }[] => {
    const prefix = `${dir}/`
    const seen = new Map<string, boolean>()
    for (const p of paths) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      const slash = rest.indexOf('/')
      const name = slash === -1 ? rest : rest.slice(0, slash)
      seen.set(name, slash !== -1 || (seen.get(name) ?? false))
    }
    return [...seen].map(([name, directory]) => ({ name, directory }))
  }

  return {
    exists: async path => {
      const target = normalize(path)
      return paths.includes(target) || paths.some(p => p.startsWith(`${target}/`))
    },
    readdir: async path =>
      childrenOf(normalize(path)).map(
        entry => ({ name: entry.name, isDirectory: () => entry.directory }) as unknown as Dirent,
      ),
    readFile: async file => {
      const content = files[normalize(file)]
      if (content === undefined) throw new Error(`ENOENT: ${file}`)
      return content
    },
  }
}

const TREE: Record<string, string> = {
  '/project/.pair/adoption/product/PRD.md': '# Product Requirements Document\n',
  '/project/.pair/adoption/decision-log/2026-09-01-a-decision.md': '# A Decision\n',
  '/project/.pair/knowledge/how-to/01-create-PRD.md': '# How to Create a PRD\n',
  '/project/.pair/knowledge/guidelines/testing/README.md': '# Testing Guidelines\n',
  // The separator-sensitive pair: `a/b.md` vs `a5.md` differ first at the separator,
  // and `/` (0x2F) sorts BELOW `5` (0x35) while `\` (0x5C) sorts ABOVE it.
  '/project/.pair/knowledge/guidelines/a/b.md': '# B\n',
  '/project/.pair/knowledge/guidelines/a5.md': '# A5\n',
  '/project/.pair/knowledge/guidelines/collaboration/templates/pr-template.md': '# PR Template\n',
  '/project/.pair/knowledge/skills-guide.md': '# Skills Guide\n',
}

/**
 * The exact document the generator must emit for `TREE` — separators included. Written
 * as a literal rather than derived from `posix.join`, so the assertion cannot be
 * satisfied by the same platform-bound call it is meant to catch.
 */
const EXPECTED = [
  '# pair',
  '',
  '> AI-assisted development knowledge base for this project.',
  '',
  '## Adoption — Product',
  '',
  '- [Product Requirements Document](.pair/adoption/product/PRD.md)',
  '',
  '## Adoption — Decisions',
  '',
  '- [A Decision](.pair/adoption/decision-log/2026-09-01-a-decision.md)',
  '',
  '## How-To Guides',
  '',
  '- [How to Create a PRD](.pair/knowledge/how-to/01-create-PRD.md)',
  '',
  '## Guidelines',
  '',
  '- [B](.pair/knowledge/guidelines/a/b.md)',
  '- [A5](.pair/knowledge/guidelines/a5.md)',
  '- [PR Template](.pair/knowledge/guidelines/collaboration/templates/pr-template.md)',
  '- [Testing Guidelines](.pair/knowledge/guidelines/testing/README.md)',
  '',
  '## Skills',
  '',
  '- [Skills Guide](.pair/knowledge/skills-guide.md)',
  '',
].join('\n')

describe('generateLlmsTxt on Windows (`path` bound to Node’s real win32 implementation)', () => {
  it('is a smoke check that the win32 flavour is really in force', () => {
    // Guards the whole file: if the mock stopped applying, every assertion below would
    // pass on POSIX for the wrong reason.
    expect(pathModule.win32.join('.pair/knowledge/guidelines', 'nested', 'a.md')).toBe(
      '.pair\\knowledge\\guidelines\\nested\\a.md',
    )
  })

  it('emits the SAME bytes a POSIX machine emits for the same tree', async () => {
    const result = await generateLlmsTxt(createFs(TREE), '/project')

    expect(result).toBe(EXPECTED)
  })

  it('emits no backslash in any entry path, at any nesting depth', async () => {
    const result = await generateLlmsTxt(createFs(TREE), '/project')

    const entryPaths = [...result.matchAll(/^- \[[^\]]*\]\(([^)]*)\)$/gm)].map(m => m[1] ?? '')
    expect(entryPaths.length).toBe(8)
    expect(entryPaths.filter(p => p.includes('\\'))).toEqual([])
  })

  it('still finds the sections: the file-system access keeps the platform separator', async () => {
    // The fix is scoped to the EMITTED path. Reading the tree must keep using the
    // platform's own `join`, or a real Windows machine would index nothing and the
    // gate would report a broken setup instead of drift.
    const result = await generateLlmsTxt(createFs(TREE), '/project')

    expect(result).toContain('## Guidelines')
    expect(result).toContain('## Skills')
  })

  it('ORDERS by the POSIX path: the separator is a sort key, not only a link', async () => {
    // Not a second spelling of the assertion above. The comparator is code-unit order
    // over the emitted path, so the separator's own code point decides sibling order:
    // `a/b.md` vs `a5.md` differ at `/` (0x2F) vs `5` (0x35) — `a/b.md` first — while
    // `a\b.md` vs `a5.md` differ at `\` (0x5C) vs `5` — `a5.md` first. A Windows-built
    // index would therefore also REORDER entries, not merely spell them differently,
    // which is the determinism the ADL's code-unit comparator exists to buy.
    const result = await generateLlmsTxt(createFs(TREE), '/project')

    const guidelines = result.slice(result.indexOf('## Guidelines'), result.indexOf('## Skills'))
    const titles = [...guidelines.matchAll(/^- \[([^\]]*)\]/gm)].map(m => m[1])
    expect(titles).toEqual(['B', 'A5', 'PR Template', 'Testing Guidelines'])
  })
})
