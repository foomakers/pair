/**
 * The suite for the command the drift gate NAMES (`pnpm llms-index:regen`).
 *
 * Why it exists at all: the gate used to print "regenerate with `pair update`", and no
 * `pair` executable exists — not on `PATH`, not in any workspace `node_modules/.bin`
 * (`apps/pair-cli` publishes its bin as `pair-cli`), and no root script by that name.
 * A contributor who added a guideline, went red and typed the printed command got
 * `command not found`; resolving it to the nearest real binary was worse, since
 * `update` with no `--source` installs the PUBLISHED knowledge base over
 * `.pair/knowledge/**` and reverts the guideline that reddened the gate. AC-5 ("the
 * failure message alone is enough to fix the problem") was unmet.
 *
 * The remedy is therefore the exact INVERSE of the check — the same `generateLlmsTxt`
 * over the same tree, written to the same `TRACKED_INDEX_PATH` constant the check
 * reads — and it REFUSES on every state where the check's own message says
 * regenerating is the wrong move. That refusal set is the table below: obeying the
 * printed advice must never be the thing that loses a section.
 *
 * Fixture trees only; the real `.pair` corpus is never read and never written.
 */
import { InMemoryFileSystemService } from '@pair/content-ops'
import { dirname, join, relative } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'

import { TRACKED_INDEX_PATH, checkLlmsIndexDrift } from './llms-txt-drift-check'
import { regenerateLlmsIndex as regenerate, type LlmsIndexSink } from './llms-txt-regenerate'
import {
  generateLlmsTxt,
  type LlmsSourceFs,
} from '../../../../apps/pair-cli/src/registry/llms-generation'

let mem = new InMemoryFileSystemService({}, '/', '/')
let writes = 0
let memFs: LlmsSourceFs
let sink: LlmsIndexSink
beforeEach(() => {
  const m = (mem = new InMemoryFileSystemService({}, '/', '/'))
  writes = 0
  memFs = { exists: p => m.exists(p), readdir: p => m.readdir(p), readFile: f => m.readFile(f) }
  sink = {
    mkdir: p => m.mkdir(p, { recursive: true }),
    writeFile: (f, c) => {
      writes++
      return m.writeFile(f, c)
    },
  }
})
const regenerateLlmsIndex = (root: string, fs: LlmsSourceFs = memFs) => regenerate(root, fs, sink)
const writeFileSync = (p: string, c: string) => mem.writeFileSync(p, c)
const readFileSync = (p: string) => mem.readFileSync(p)
const mkdirSync = (p: string) => mem.mkdirSync(p, { recursive: true })
const rmSync = (p: string, o?: { recursive?: boolean; force?: boolean }) => mem.rmSync(p, o)
const readdirSync = (p: string) => mem.readdirSync(p)

let treeCount = 0

function makeTree(files: Record<string, string>): string {
  const root = `/llms-regen-${treeCount++}`
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath)
    mkdirSync(dirname(target))
    writeFileSync(target, content)
  }
  return root
}

/** U+FEFF, spelled rather than typed: the literal is an irregular-whitespace lint error. */
const BYTE_ORDER_MARK = '\uFEFF'

const KB_FILES: Record<string, string> = {
  '.pair/adoption/product/PRD.md': '# Product Requirements\n',
  '.pair/knowledge/how-to/01-how-to-start.md': '# How to start\n',
  '.pair/knowledge/guidelines/testing/README.md': '# Testing Guidelines\n',
}

async function makeInSyncTree(extra: Record<string, string> = {}): Promise<string> {
  const root = makeTree({ ...KB_FILES, ...extra })
  writeFileSync(join(root, TRACKED_INDEX_PATH), await generateLlmsTxt(memFs, root))
  return root
}

/** Every file in the tree with its content — the "nothing else moved" assertion. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else out[relative(root, full)] = readFileSync(full)
    }
  }
  walk(root)
  return out
}

describe('regenerateLlmsIndex — the command the gate names', () => {
  it('WRITES the generator output when a guideline was added without regenerating', async () => {
    const root = await makeInSyncTree()
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/story-local-markers.md'),
      '# Story Local Markers\n',
    )
    expect((await checkLlmsIndexDrift(root, memFs)).ok).toBe(false)

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('written')
    // The postcondition the story's success metric names: the gate is green afterwards.
    expect((await checkLlmsIndexDrift(root, memFs)).ok).toBe(true)
    expect(readFileSync(join(root, TRACKED_INDEX_PATH))).toContain(
      '- [Story Local Markers](.pair/knowledge/guidelines/story-local-markers.md)',
    )
  })

  it('writes EXACTLY the one file it advertises and touches nothing else', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), 'hand-edited garbage\n')
    const before = snapshot(root)

    await regenerateLlmsIndex(root)

    const after = snapshot(root)
    const changed = Object.keys(after).filter(f => after[f] !== before[f])
    expect(changed).toEqual([TRACKED_INDEX_PATH])
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
  })

  it('CREATES the index when the tracked file does not exist at all', async () => {
    const root = makeTree(KB_FILES)

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('written')
    expect((await checkLlmsIndexDrift(root, memFs)).ok).toBe(true)
  })

  it('is IDEMPOTENT: a second run on a green tree writes nothing and stays green', async () => {
    const root = await makeInSyncTree()
    const writesBefore = writes

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('already-in-sync')
    expect(writes).toBe(writesBefore)
    expect((await checkLlmsIndexDrift(root, memFs)).ok).toBe(true)
  })

  it('STRIPS a byte-order mark — the one invisible difference regeneration does fix', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, `${BYTE_ORDER_MARK}${readFileSync(tracked)}`)

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('written')
    expect(readFileSync(tracked).startsWith(BYTE_ORDER_MARK)).toBe(false)
    expect((await checkLlmsIndexDrift(root, memFs)).ok).toBe(true)
  })

  it('REFUSES on a carriage-return checkout: the write lands as LF and git puts the CRs back', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const asCrlf = readFileSync(tracked).replace(/\n/g, '\r\n')
    writeFileSync(tracked, asCrlf)

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('refused')
    // Untouched: a "successful" regeneration here is a loop, not a fix.
    expect(readFileSync(tracked)).toBe(asCrlf)
    expect(outcome.kind === 'refused' && outcome.message).toContain('git checkout --')
  })

  it('REFUSES on a bare-CR file too — the same cause, the same exit', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    const asBareCr = readFileSync(tracked).replace(/\n/g, '\r')
    writeFileSync(tracked, asBareCr)

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('refused')
    expect(readFileSync(tracked)).toBe(asBareCr)
  })

  it('REFUSES on a sparse tree instead of committing the deletion of a whole section', async () => {
    // The damage this command must not do: a partial checkout is indistinguishable
    // from a mass deletion, so a blind regeneration writes an index with the section
    // gone — the exact loss `sparseTreeCaution` exists to prevent, delivered by
    // obeying the advice that caution is printed next to.
    const root = await makeInSyncTree()
    const before = readFileSync(join(root, TRACKED_INDEX_PATH))
    rmSync(join(root, '.pair/knowledge/how-to'), { recursive: true, force: true })

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('refused')
    expect(readFileSync(join(root, TRACKED_INDEX_PATH))).toBe(before)
    expect(outcome.kind === 'refused' && outcome.message).toContain('How-To Guides')
  })

  it('REFUSES when there is no knowledge base to index (unfinished install)', async () => {
    const root = makeTree({ '.pair/llms.txt': '# pair\n\n## Guidelines\n\n- [X](x.md)\n' })

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('refused')
    // A 4-line preamble written over a real index would be the worst outcome available.
    expect(readFileSync(join(root, TRACKED_INDEX_PATH))).toContain('- [X](x.md)')
  })

  it('REFUSES when the tracked file itself cannot be read', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    rmSync(tracked)
    mkdirSync(tracked)

    const outcome = await regenerateLlmsIndex(root)

    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.message).toContain('could not read the tracked')
  })

  it('REFUSES when the knowledge-base TREE is unreadable, naming the tree not the index', async () => {
    const root = await makeInSyncTree()
    const locked = join(root, '.pair/knowledge/guidelines')
    const denied: LlmsSourceFs = {
      ...memFs,
      readdir: p =>
        p === locked
          ? Promise.reject(
              Object.assign(new Error(`EACCES: permission denied, scandir '${p}'`), {
                code: 'EACCES',
              }),
            )
          : memFs.readdir(p),
    }

    const outcome = await regenerateLlmsIndex(root, denied)

    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.message).toContain('knowledge base')
  })
})
