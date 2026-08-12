/**
 * Story-local acceptance-criterion markers are banned CORPUS-WIDE.
 *
 * A marker like `(AC5)` names a criterion in the story that motivated the sentence. Inside
 * a shipped skill or KB file it has no referent: the reader installing this corpus into
 * their own project has no access to that story, and the number goes stale the moment the
 * story is re-refined. The sentence must carry its own justification or none.
 *
 * This rule lived inside `verify-quality.test.ts` as a per-artifact assertion, which is why
 * 40 markers survived across 22 files in 11 other skills for months — a per-artifact guard
 * only ever sees its own artifact. It is asserted here over EVERY skill file in both skill
 * corpora AND every KB guideline/asset file in both knowledge corpora, so a marker
 * reintroduced anywhere fails, named with its file and line.
 *
 * The rule itself is documented for authors in the shared skill-conventions guidance:
 * `dataset/.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/story-local-markers.md`.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

// Same path convention as the sibling conformance guards (classify.test.ts et al).
const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_KNOWLEDGE = join(__dirname, '../../dataset/.pair/knowledge')
const INSTALLED_KNOWLEDGE = join(__dirname, '../../../../.pair/knowledge')
const REPO_ROOT = join(__dirname, '../../../..')

const ROOTS = [DATASET_SKILLS, MIRROR_SKILLS, DATASET_KNOWLEDGE, INSTALLED_KNOWLEDGE]

// The KB corpora legitimately contain `ACn` tokens in exactly two shapes, allowlisted per
// file (relative to the corpus root, so one entry covers the dataset source and its
// installed copy). Everything else is a story citation and banned.
//
// - TEMPLATE PLACEHOLDERS: the token is the artifact's own structure — a template or a
//   worked example DEFINES criteria right where it names them, so the referent is on the
//   same page, not in a story.
// - EXAMPLE STORY BODIES: a guideline showing what a story looks like quotes criteria the
//   example itself declares.
//
// The allowlist applies to the knowledge corpora only — a skill file never has a
// legitimate `ACn`, so the skill roots are scanned without exemptions.
const KNOWLEDGE_ALLOWLIST = new Set([
  // Epic template: `**AC1:** [High-level acceptance criterion …]` placeholder rows.
  'guidelines/collaboration/templates/epic-template.md',
  // Worked example of a filesystem-PM story body — the criteria are defined in place.
  'guidelines/collaboration/project-management-tool/filesystem-implementation.md',
  // PRD template + example: `**AC1:** [Specific acceptance criterion]` placeholder rows.
  'assets/PRD_template.md',
  'assets/PRD_example.md',
])

// ANY story-local criterion reference, in any spelling. The first version matched only a
// parenthetical containing nothing but the marker — `(AC1)`, `(AC1, AC4)` — and seven other
// spellings shipped straight past it: `### Phase 1: Quality Gate (BLOCKING — AC5)`,
// `this is the AC4 signal`, `(decision Q5, AC2)`, `the action AC1 requires`. The guard then
// manufactured false confidence, which is exactly what its own docstring blames the old
// per-artifact assertion for.
//
// A bare word-boundary `ACn` is safe here: a grep over all four corpora finds no legitimate
// `AC<digit>` token outside the allowlisted files — every other occurrence was a story
// citation. Prose containing "AC" as part of a longer word (`ACL`, `ACCEPTED`) does not
// match, and a parenthetical that explains rather than cites (`(this session is the
// actor)`) is untouched.
const MARKER = /\bAC\d+\b/g

// A citation that NAMES its story — `#227/AC4` — carries its referent with it: the reader
// can open story #227 and find criterion 4. These are stripped before matching, so they
// stay legal everywhere (e.g. code-review-template.md's introduced-red-security rule).
const REFERENT_CARRYING = /#\d+\/AC\d+\b/g

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

function isAllowlisted(root: string, file: string): boolean {
  if (root !== DATASET_KNOWLEDGE && root !== INSTALLED_KNOWLEDGE) return false
  return KNOWLEDGE_ALLOWLIST.has(relative(root, file).split('\\').join('/'))
}

function offendersIn(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines.flatMap((line, i) => {
    const hits = line.replace(REFERENT_CARRYING, '').match(MARKER)
    return hits ? [`${relative(REPO_ROOT, file)}:${i + 1} → ${hits.join(', ')}`] : []
  })
}

describe('story-local (ACn) markers — banned in every shipped skill and KB file', () => {
  const scanned = ROOTS.flatMap(root =>
    markdownFilesIn(root).filter(file => !isAllowlisted(root, file)),
  )

  it('finds files to check (the guard must not pass by seeing nothing)', () => {
    // Without this, a broken path would make the whole rule vacuously green — the same
    // failure mode as an assertion that cannot fail. Four corpora: well past 100 files.
    expect(scanned.length).toBeGreaterThan(100)
  })

  it('ships no story-local (ACn) marker anywhere in the corpus', () => {
    const offenders = scanned.flatMap(offendersIn)
    expect(
      offenders,
      `story-local criterion markers must not ship:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('every allowlist entry still earns its exemption (no stale entries)', () => {
    // An allowlisted file that no longer exists or no longer contains a marker means the
    // exemption is dead weight — remove the entry so the guard's blind spots stay curated.
    for (const rel of KNOWLEDGE_ALLOWLIST) {
      const stillEarned = [DATASET_KNOWLEDGE, INSTALLED_KNOWLEDGE].some(root => {
        try {
          // `.match` (not `.test`) — a /g regex's lastIndex would leak between files.
          return (readFileSync(join(root, rel), 'utf8').match(MARKER) ?? []).length > 0
        } catch {
          return false
        }
      })
      expect(stillEarned, `stale allowlist entry (file gone or marker-free): ${rel}`).toBe(true)
    }
  })
})
