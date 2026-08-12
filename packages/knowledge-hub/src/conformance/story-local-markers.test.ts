/**
 * Story-local acceptance-criterion markers are banned CORPUS-WIDE.
 *
 * A marker like `(AC5)` names a criterion in the story that motivated the sentence. Inside
 * a shipped skill it has no referent: the reader installing this corpus into their own
 * project has no access to that story, and the number goes stale the moment the story is
 * re-refined. The sentence must carry its own justification or none.
 *
 * This rule lived inside `verify-quality.test.ts` as a per-artifact assertion, which is why
 * 40 markers survived across 22 files in 11 other skills for months — a per-artifact guard
 * only ever sees its own artifact. It is asserted here over EVERY skill file in both
 * corpora instead, so a marker reintroduced anywhere fails, named with its file and line.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

// Same path convention as the sibling conformance guards (classify.test.ts et al).
const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const REPO_ROOT = join(__dirname, '../../../..')

const ROOTS = [DATASET_SKILLS, MIRROR_SKILLS]

// Story-local criterion reference: `(AC1)`, `(AC12)`, `(AC1, AC4)`, `(AC3, AC4, AC5)`.
// Deliberately NOT matched: prose that merely contains "AC" (`ACL`, `ACCEPTED`), and a
// parenthetical that explains rather than cites (`(this session is the actor)`).
const MARKER = /\(AC\d+(?:,\s*AC\d+)*\)/g

function markdownFilesIn(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return [] // a corpus that is not installed here is not a failure of this rule
  }
  return entries.flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? markdownFilesIn(p) : name.endsWith('.md') ? [p] : []
  })
}

describe('story-local (ACn) markers — banned in every shipped skill file', () => {
  const files = ROOTS.flatMap(markdownFilesIn)

  it('finds skill files to check (the guard must not pass by seeing nothing)', () => {
    // Without this, a broken path would make the whole rule vacuously green — the same
    // failure mode as an assertion that cannot fail.
    expect(files.length).toBeGreaterThan(20)
  })

  it('ships no story-local (ACn) marker anywhere in the skill corpus', () => {
    const offenders = files.flatMap(file => {
      const lines = readFileSync(file, 'utf8').split('\n')
      return lines.flatMap((line, i) => {
        const hits = line.match(MARKER)
        return hits ? [`${relative(REPO_ROOT, file)}:${i + 1} → ${hits.join(', ')}`] : []
      })
    })
    expect(
      offenders,
      `story-local criterion markers must not ship:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
