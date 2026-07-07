import { describe, it, expect } from 'vitest'
import {
  rewriteSkillReferences,
  buildSkillNameMap,
  rewriteSkillReferencesInFiles,
  findSkillReferences,
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

  it('returns unchanged content when map is empty', () => {
    const content = '# Title\n/next is here'
    expect(rewriteSkillReferences(content, new Map())).toBe(content)
  })

  it('replaces backtick-wrapped reference', () => {
    const input = '| `/next` | Navigator |'
    expect(rewriteSkillReferences(input, map)).toBe('| `/pair-next` | Navigator |')
  })

  it('replaces in prose with "and" conjunction', () => {
    const input = 'Composes /verify-quality and /record-decision.'
    expect(rewriteSkillReferences(input, map)).toBe(
      'Composes /pair-capability-verify-quality and /pair-capability-record-decision.',
    )
  })

  it('replaces double-quoted reference', () => {
    const input = 'Compose "/verify-adoption" with $scope'
    expect(rewriteSkillReferences(input, map)).toBe(
      'Compose "/pair-capability-verify-adoption" with $scope',
    )
  })

  it('replaces plain reference after verb', () => {
    const input = 'invoke /implement immediately'
    expect(rewriteSkillReferences(input, map)).toBe('invoke /pair-process-implement immediately')
  })

  it('replaces reference at start of line', () => {
    const input = '/next is the catalog'
    expect(rewriteSkillReferences(input, map)).toBe('/pair-next is the catalog')
  })

  it('replaces reference at end of line', () => {
    const input = 'run /next'
    expect(rewriteSkillReferences(input, map)).toBe('run /pair-next')
  })

  it('does NOT replace name without leading slash', () => {
    const input = 'name: pair-next'
    expect(rewriteSkillReferences(input, map)).toBe(input)
  })

  it('does NOT replace partial match in path', () => {
    const input = 'path/next/page'
    expect(rewriteSkillReferences(input, map)).toBe(input)
  })

  it('does NOT replace when preceded by non-boundary char', () => {
    const input = 'pre/next'
    expect(rewriteSkillReferences(input, map)).toBe(input)
  })

  it('replaces longer names before shorter to avoid partial match', () => {
    const shortMap = new Map([
      ['record', 'pair-record'],
      ['record-decision', 'pair-capability-record-decision'],
    ])
    const input = '/record-decision and /record'
    expect(rewriteSkillReferences(input, shortMap)).toBe(
      '/pair-capability-record-decision and /pair-record',
    )
  })

  it('handles multiple occurrences in same line', () => {
    const input = '/next and /next again'
    expect(rewriteSkillReferences(input, map)).toBe('/pair-next and /pair-next again')
  })

  it('preserves non-matching slashes', () => {
    const input = '/unknown-skill stays'
    const smallMap = new Map([['next', 'pair-next']])
    expect(rewriteSkillReferences(input, smallMap)).toBe(input)
  })

  it('works in full table row', () => {
    const input = '| `/verify-quality` | Capability | Yes |'
    expect(rewriteSkillReferences(input, map)).toBe(
      '| `/pair-capability-verify-quality` | Capability | Yes |',
    )
  })

  it('handles frontmatter description with references', () => {
    const input = 'description: Composes /verify-quality and /record-decision.'
    expect(rewriteSkillReferences(input, map)).toBe(
      'description: Composes /pair-capability-verify-quality and /pair-capability-record-decision.',
    )
  })

  it('replaces reference in parentheses', () => {
    const input = '(see /next for details)'
    expect(rewriteSkillReferences(input, map)).toBe('(see /pair-next for details)')
  })

  it('replaces reference followed by comma', () => {
    const input = '/next, /implement, /review'
    expect(rewriteSkillReferences(input, map)).toBe(
      '/pair-next, /pair-process-implement, /pair-process-review',
    )
  })

  it('replaces reference followed by colon', () => {
    const input = 'run /next:'
    expect(rewriteSkillReferences(input, map)).toBe('run /pair-next:')
  })

  describe('fenced code blocks (AC6)', () => {
    it('leaves a fenced code block referencing a skill name untouched', () => {
      const input = ['Run `/next` to start.', '```', '/next', '```', 'Then run /implement.'].join(
        '\n',
      )
      expect(rewriteSkillReferences(input, map)).toBe(
        ['Run `/pair-next` to start.', '```', '/next', '```', 'Then run /pair-process-implement.'].join(
          '\n',
        ),
      )
    })

    it('leaves a fenced block with a language tag and multiple lines untouched', () => {
      const input = [
        '```text',
        'pair install',
        '/next',
        '/implement',
        '```',
        'Compose /next.',
      ].join('\n')
      expect(rewriteSkillReferences(input, map)).toBe(
        ['```text', 'pair install', '/next', '/implement', '```', 'Compose /pair-next.'].join(
          '\n',
        ),
      )
    })

    it('handles a tilde-fenced code block', () => {
      const input = ['~~~', '/next', '~~~', 'Run /next.'].join('\n')
      expect(rewriteSkillReferences(input, map)).toBe(
        ['~~~', '/next', '~~~', 'Run /pair-next.'].join('\n'),
      )
    })

    it('rewrites prose again after a fence closes', () => {
      const input = ['```', '/next', '```', 'Run /next after the fence.'].join('\n')
      expect(rewriteSkillReferences(input, map)).toBe(
        ['```', '/next', '```', 'Run /pair-next after the fence.'].join('\n'),
      )
    })

    it('still rewrites inline single-backtick code spans (not a fence)', () => {
      const input = 'Composes `/verify-quality` inline.'
      expect(rewriteSkillReferences(input, map)).toBe(
        'Composes `/pair-capability-verify-quality` inline.',
      )
    })

    it('treats an unterminated fence as fenced through end of content', () => {
      const input = ['```', '/next', 'still inside /implement'].join('\n')
      expect(rewriteSkillReferences(input, map)).toBe(input)
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

  it('finds a prose invocation', () => {
    expect(findSkillReferences('run /old-name here', ['old-name'])).toEqual(['old-name'])
  })

  it('finds a backtick-wrapped invocation', () => {
    expect(findSkillReferences('`/old-name`', ['old-name'])).toEqual(['old-name'])
  })

  it('does not find a name only present inside a fenced code block', () => {
    const content = ['```', '/old-name', '```'].join('\n')
    expect(findSkillReferences(content, ['old-name'])).toEqual([])
  })

  it('does not match a name that is not present', () => {
    expect(findSkillReferences('nothing here', ['old-name'])).toEqual([])
  })

  it('finds multiple distinct names', () => {
    const found = findSkillReferences('/a and /b', ['a', 'b', 'c'])
    expect(found.sort()).toEqual(['a', 'b'])
  })
})

describe('buildSkillNameMap', () => {
  it('builds map from dirMappingFiles with flatten+prefix', () => {
    const dirMappingFiles = new Map([
      ['catalog/next', ['/target/pair-catalog-next/SKILL.md']],
      ['capability/verify-quality', ['/target/pair-capability-verify-quality/SKILL.md']],
    ])
    const result = buildSkillNameMap(dirMappingFiles, { flatten: true, prefix: 'pair' })
    expect(result.get('next')).toBe('pair-catalog-next')
    expect(result.get('verify-quality')).toBe('pair-capability-verify-quality')
  })

  it('skips entries where leaf equals transformed (no rename)', () => {
    const dirMappingFiles = new Map([['myskill', ['/target/myskill/SKILL.md']]])
    const result = buildSkillNameMap(dirMappingFiles, {})
    expect(result.size).toBe(0)
  })

  it('handles multiple entries', () => {
    const dirMappingFiles = new Map([
      ['catalog/next', ['/t/pair-catalog-next/SKILL.md']],
      ['process/implement', ['/t/pair-process-implement/SKILL.md']],
      ['capability/record-decision', ['/t/pair-capability-record-decision/SKILL.md']],
    ])
    const result = buildSkillNameMap(dirMappingFiles, { flatten: true, prefix: 'pair' })
    expect(result.size).toBe(3)
    expect(result.get('next')).toBe('pair-catalog-next')
    expect(result.get('implement')).toBe('pair-process-implement')
    expect(result.get('record-decision')).toBe('pair-capability-record-decision')
  })

  it('works with flatten only (no prefix)', () => {
    const dirMappingFiles = new Map([['catalog/next', ['/t/catalog-next/SKILL.md']]])
    const result = buildSkillNameMap(dirMappingFiles, { flatten: true })
    expect(result.get('next')).toBe('catalog-next')
  })
})

describe('rewriteSkillReferencesInFiles', () => {
  it('rewrites references in .md files', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/target/skill-a/SKILL.md': '# Skill A\nComposes /skill-b.',
        '/target/skill-b/SKILL.md': '# Skill B\nComposed by /skill-a.',
      },
      '/',
      '/',
    )

    const skillNameMap = new Map([
      ['skill-a', 'px-skill-a'],
      ['skill-b', 'px-skill-b'],
    ])

    await rewriteSkillReferencesInFiles({
      fileService,
      files: ['/target/skill-a/SKILL.md', '/target/skill-b/SKILL.md'],
      skillNameMap,
    })

    const a = await fileService.readFile('/target/skill-a/SKILL.md')
    expect(a).toContain('/px-skill-b')

    const b = await fileService.readFile('/target/skill-b/SKILL.md')
    expect(b).toContain('/px-skill-a')
  })

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

  it('does not write file when no references match', async () => {
    const fileService = new InMemoryFileSystemService(
      { '/target/README.md': '# No skill refs here' },
      '/',
      '/',
    )

    await rewriteSkillReferencesInFiles({
      fileService,
      files: ['/target/README.md'],
      skillNameMap: new Map([['next', 'pair-next']]),
    })

    const content = await fileService.readFile('/target/README.md')
    expect(content).toBe('# No skill refs here')
  })
})
