import { describe, it, expect } from 'vitest'
import {
  rewriteSkillReferences,
  buildSkillNameMap,
  rewriteSkillReferencesInFiles,
  findSkillReferences,
  buildSkillLinkPathMap,
  rewriteSkillLinkPaths,
  rewriteSkillLinkPathsInFiles,
} from './skill-reference-rewriter'
import { InMemoryFileSystemService } from '../test-utils'

describe('rewriteSkillReferences', () => {
  const map = new Map([
    ['next', 'pair-next'],
    ['verify-quality', 'pair-capability-verify-quality'],
    ['record-decision', 'pair-capability-record-decision'],
    ['implement', 'pair-process-implement'],
    ['assess-stack', 'pair-capability-assess-stack'],
    ['verify-adoption', 'pair-capability-verify-adoption'],
    ['review', 'pair-process-review'],
  ])

  it('handles multiple occurrences in same line', () => {
    const input = '/next and /next again'
    expect(rewriteSkillReferences(input, map)).toBe('/pair-next and /pair-next again')
  })

  describe('fenced code blocks (AC6)', () => {
    it('leaves a fenced code block referencing a skill name untouched', () => {
      const input = ['Run `/next` to start.', '```', '/next', '```', 'Then run /implement.'].join(
        '\n',
      )
      expect(rewriteSkillReferences(input, map)).toBe(
        [
          'Run `/pair-next` to start.',
          '```',
          '/next',
          '```',
          'Then run /pair-process-implement.',
        ].join('\n'),
      )
    })

    it('does not treat a backtick-containing info string as a fence-open (CommonMark)', () => {
      // Per CommonMark, a backtick-fence's info string must itself be
      // backtick-free; a line like this never opens a real fence, so
      // rewriting must continue normally afterward instead of being
      // suppressed for the rest of the file.
      const input = ['intro line', '```inline `code` marker', 'Run /next to start.'].join('\n')
      expect(rewriteSkillReferences(input, map)).toBe(
        ['intro line', '```inline `code` marker', 'Run /pair-next to start.'].join('\n'),
      )
    })

    it('still treats a tilde-fence with a backtick in its info string as fenced', () => {
      // Tilde fences have no backtick restriction on the info string.
      const input = ['~~~lang `with backtick`', '/next', '~~~', 'Run /next after.'].join('\n')
      expect(rewriteSkillReferences(input, map)).toBe(
        ['~~~lang `with backtick`', '/next', '~~~', 'Run /pair-next after.'].join('\n'),
      )
    })
  })
})

describe('findSkillReferences', () => {
  it('returns empty array when no names given', () => {
    expect(findSkillReferences('/next', [])).toEqual([])
  })

  it('finds multiple distinct names', () => {
    const found = findSkillReferences('/a and /b', ['a', 'b', 'c'])
    expect(found.sort()).toEqual(['a', 'b'])
  })
})

describe('buildSkillNameMap', () => {

  it('skips entries where leaf equals transformed (no rename)', () => {
    const dirMappingFiles = new Map([['myskill', ['/target/myskill/SKILL.md']]])
    const result = buildSkillNameMap(dirMappingFiles, { flatten: false })
    expect(result.size).toBe(0)
  })

  // #407: a bounded flatten makes a skill's `references/` sub-dir a real
  // sub-path, so it now shows up in dirMappingFiles alongside the skill dirs.
  // It is CONTENT, not a skill: registering `references` as a skill name maps
  // the `/references` token to ONE arbitrary skill's sub-dir (last writer wins
  // on iteration order) and rewrites it inside every OTHER skill's body too.
  it('does not register a content sub-dir as a skill name (#407)', () => {
    const dirMappingFiles = new Map([
      ['process/review', ['/t/pair-process-review/SKILL.md']],
      ['process/review/references', ['/t/pair-process-review/references/deep.md']],
      ['capability/grill', ['/t/pair-capability-grill/SKILL.md']],
      ['capability/grill/references', ['/t/pair-capability-grill/references/deep.md']],
    ])
    const result = buildSkillNameMap(dirMappingFiles, {
      flatten: true,
      prefix: 'pair',
      flattenDepth: 2,
    })
    expect(result.has('references')).toBe(false)
    expect([...result.entries()].sort()).toEqual([
      ['grill', 'pair-capability-grill'],
      ['review', 'pair-process-review'],
    ])
  })
})

describe('rewriteSkillReferencesInFiles', () => {

  it('skips non-.md files', async () => {
    const fileService = new InMemoryFileSystemService(
      { '/target/config.json': '{"skill": "/next"}' },
      '/',
      '/',
    )

    await rewriteSkillReferencesInFiles({
      fileService,
      files: ['/target/config.json'],
      skillNameMap: new Map([['next', 'pair-next']]),
    })

    const content = await fileService.readFile('/target/config.json')
    expect(content).toBe('{"skill": "/next"}')
  })
})

describe('buildSkillLinkPathMap', () => {
  const opts = { flatten: true, prefix: 'pair' }

  it('maps a nested skill SKILL.md relative link to its installed .claude/skills path', () => {
    const dirMappingFiles = new Map<string, string[]>([
      ['capability/map-subdomains', []],
      ['process/refine-story', []],
    ])
    const map = buildSkillLinkPathMap(dirMappingFiles, opts)
    expect(map.get('../.skills/capability/map-subdomains/SKILL.md')).toBe(
      '../.claude/skills/pair-capability-map-subdomains/SKILL.md',
    )
    expect(map.get('../.skills/process/refine-story/SKILL.md')).toBe(
      '../.claude/skills/pair-process-refine-story/SKILL.md',
    )
  })

  it('skips bare top-level dirs with no category (e.g. next)', () => {
    const dirMappingFiles = new Map<string, string[]>([
      ['next', []],
      ['capability/estimate', []],
    ])
    const map = buildSkillLinkPathMap(dirMappingFiles, opts)
    expect([...map.keys()]).toEqual(['../.skills/capability/estimate/SKILL.md'])
  })

  // #407, same reason as buildSkillNameMap: a content sub-dir is not a skill, so
  // it must not get a `.skills/<cat>/<name>/SKILL.md` link mapping of its own —
  // no such SKILL.md exists inside a `references/` dir.
  it('skips a content sub-dir below the entry depth (#407)', () => {
    const dirMappingFiles = new Map<string, string[]>([
      ['process/review', []],
      ['process/review/references', []],
    ])
    const map = buildSkillLinkPathMap(dirMappingFiles, { ...opts, flattenDepth: 2 })
    expect([...map.keys()]).toEqual(['../.skills/process/review/SKILL.md'])
  })
})

describe('rewriteSkillLinkPaths', () => {
  const linkMap = new Map([
    [
      '../.skills/capability/map-subdomains/SKILL.md',
      '../.claude/skills/pair-capability-map-subdomains/SKILL.md',
    ],
    [
      '../.skills/capability/map-contexts/SKILL.md',
      '../.claude/skills/pair-capability-map-contexts/SKILL.md',
    ],
  ])

  it('is idempotent — a second pass is a no-op', () => {
    const input = '(../../.skills/capability/map-subdomains/SKILL.md)'
    const once = rewriteSkillLinkPaths(input, linkMap)
    expect(rewriteSkillLinkPaths(once, linkMap)).toBe(once)
  })
})

describe('rewriteSkillLinkPathsInFiles', () => {
  const linkMap = new Map([
    [
      '../.skills/capability/map-subdomains/SKILL.md',
      '../.claude/skills/pair-capability-map-subdomains/SKILL.md',
    ],
  ])

  it('rewrites link paths in .md files, skipping non-.md files', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/t/doc.md': '[a](../../.skills/capability/map-subdomains/SKILL.md)',
        '/t/config.json': '"../../.skills/capability/map-subdomains/SKILL.md"',
      },
      '/',
      '/',
    )

    await rewriteSkillLinkPathsInFiles({
      fileService,
      files: ['/t/doc.md', '/t/config.json'],
      linkMap,
    })

    expect(await fileService.readFile('/t/doc.md')).toBe(
      '[a](../../.claude/skills/pair-capability-map-subdomains/SKILL.md)',
    )
    expect(await fileService.readFile('/t/config.json')).toBe(
      '"../../.skills/capability/map-subdomains/SKILL.md"',
    )
  })
})
