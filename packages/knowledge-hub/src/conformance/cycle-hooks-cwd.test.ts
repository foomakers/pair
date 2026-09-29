import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// US-489 review r0-1 — target artifact: pair-workflow-cycle SKILL.md (dataset source + installed
// mirror). A STAGE hook (`pre-<step>` / `post-<step>`) gates the tree the stage works on — the
// STORY worktree — never the developer's main checkout. `verify` is the one stage whose packet
// names another tree (`<worktreeRoot>/<story>-review`, a detached worktree the verify agent itself
// creates and removes), so the instructions must say which tree a verify hook gates: the story
// worktree at the PR head, not the review worktree. (The schema-text rows live with the schema's
// own conformance file, cycle-hooks-schema.test.ts.)

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')

const skills = {
  dataset: join(DATASET, '.skills/workflow/cycle/SKILL.md'),
  installed: join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/SKILL.md'),
}

const MAIN_ONLY = new Set(['"$MAIN"', '"$PWD"', '$MAIN', '$PWD', ''])

/** Every `cycle-hooks.mjs … run … --cwd <value>` invocation in a document, as its `--cwd` value. */
function hookRunCwds(doc: string): string[] {
  return doc
    .split('\n')
    .filter(line => /cycle-hooks\.mjs"?\s+run\b/.test(line))
    .map(line => /--cwd\s+("[^"]*"|\S+)/.exec(line)?.[1] ?? '')
}

/** The markdown paragraph (blank-line delimited) or fenced block around each line matching `re`. */
function paragraphsWith(doc: string, re: RegExp): string[] {
  return doc.split(/\n\s*\n/).filter(p => re.test(p))
}

describe.each(Object.entries(skills))('r0-1: pair-workflow-cycle stage hooks (%s)', (_n, path) => {
  const doc = readFileSync(path, 'utf-8')

  it('g1-w5: the stage hook points are run with the story worktree as --cwd, not the main checkout', () => {
    const cwds = hookRunCwds(doc)
    expect(cwds.length).toBeGreaterThan(0)
    expect(
      cwds.some(cwd => !MAIN_ONLY.has(cwd)),
      `every hook run uses the main checkout: ${cwds.join(', ')}`,
    ).toBe(true)
    expect(doc).not.toMatch(/Hook points, all run in the repo root/)
    // Tied to the stage points (reviewer note on attempt 1): the instruction naming `pre-<step>`
    // says where it runs: the story worktree.
    const stagePoint = paragraphsWith(doc, /`pre-<step>`/)
    expect(stagePoint.length, 'no paragraph names `pre-<step>`').toBeGreaterThan(0)
    expect(
      stagePoint.some(p => /story worktree/i.test(p)),
      'no paragraph naming `pre-<step>` says it runs in the story worktree',
    ).toBe(true)
  })

  it('g1-w5 (verify): states that a verify hook gates the story worktree at the PR head, not the review worktree', () => {
    const verifyLines = doc
      .split('\n')
      .filter(
        line =>
          /verify/.test(line) &&
          /story worktree/i.test(line) &&
          /PR head/i.test(line) &&
          /review worktree/i.test(line),
      )
    expect(
      verifyLines.length,
      'no line states that `pre-verify`/`post-verify` gate the story worktree at the PR head (not the review worktree)',
    ).toBeGreaterThan(0)
    expect(doc).not.toMatch(/`(pre|post)-verify`[^.\n]*runs? in the review worktree/i)
  })
})

// US-490 review r3-1 — `post-merge` runs after `cycle-merge.mjs run`, which has already removed the
// story worktree (AC3): the docs that tell a coordinator where to run it must name the MAIN
// checkout. Target artifacts: pair-workflow-cycle SKILL.md and automation-policy.md `## Cycle Hooks`
// (dataset sources + installed/mirror copies).

const POLICY_REL = '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'
const postMergeDocs = {
  'SKILL.md (dataset)': skills.dataset,
  'SKILL.md (installed)': skills.installed,
  'automation-policy.md (dataset)': join(DATASET, POLICY_REL),
  'automation-policy.md (mirror)': join(REPO_ROOT, POLICY_REL),
}

/** Sentences, then `;`-clauses: the smallest unit a "`post-merge` runs in X" statement lives in. */
function clausesWith(doc: string, re: RegExp): string[] {
  return doc
    .split(/(?<=[.!?])\s+(?=[A-Z`(*])/)
    .flatMap(sentence => sentence.split(/;\s+/))
    .filter(clause => re.test(clause))
}

describe.each(Object.entries(postMergeDocs))('r3-1: where `post-merge` runs (%s)', (_n, path) => {
  const doc = readFileSync(path, 'utf-8')

  it('r3-1-d1: a statement naming `post-merge` says it runs in the main checkout', () => {
    const clauses = clausesWith(doc, /`post-merge`/)
    expect(clauses.length, 'no statement names `post-merge`').toBeGreaterThan(0)
    expect(
      clauses.some(c => /main checkout/i.test(c)),
      `no statement says \`post-merge\` runs in the main checkout:\n${clauses.join('\n---\n')}`,
    ).toBe(true)
  })

  it('r3-1-d2: no statement places `post-merge` in the story worktree', () => {
    const inStory = clausesWith(doc, /`post-merge`[^.;]*\bruns?\b[^.;]*story worktree/i)
    expect(inStory, inStory.join('\n---\n')).toEqual([])
  })
})
