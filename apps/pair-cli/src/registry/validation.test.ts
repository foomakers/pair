import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  validateRegistry,
  detectOverlappingTargets,
  validateAllRegistries,
  checkTargetEmptiness,
  checkTargetsEmptiness,
} from './validation'
import { getReservedPaths, detectReservedPathOverlap } from './reserved-paths'
import { RegistryConfig } from './resolver'
import { createTestFs } from '#test-utils'

describe('registry validation - checkTargetEmptiness', () => {
  it('returns empty if directory does not exist', async () => {
    const fs = createTestFs({}, {}, '/test')
    const result = await checkTargetEmptiness('/test/absent', fs)
    expect(result.empty).toBe(true)
    expect(result.exists).toBe(false)
  })

  it('returns not empty if directory has files', async () => {
    const fs = createTestFs({}, { '/test/dir/file.txt': 'hi' }, '/test')
    const result = await checkTargetEmptiness('/test/dir', fs)
    expect(result.empty).toBe(false)
    expect(result.exists).toBe(true)
  })

  it('checkTargetsEmptiness validates multiple paths', async () => {
    const fs = createTestFs({}, {}, '/test')
    await fs.mkdir('/test/occupied', { recursive: true })
    await fs.writeFile('/test/occupied/f.txt', 'occupied')

    const targets = {
      empty: '/test/empty',
      occupied: '/test/occupied',
    }
    const result = await checkTargetsEmptiness(targets, fs)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.registry).toBe('occupied')
  })
})

describe('registry validation - validateRegistry', () => {
  it('validates a correct registry', () => {
    const config: RegistryConfig = {
      source: '.pair',
      behavior: 'mirror',
      description: 'Test',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors).toHaveLength(0)
  })

  it('fails on invalid behavior', () => {
    const config = {
      behavior: 'invalid',
      description: 'Test',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors[0]).toContain('invalid behavior')
  })

  it('fails on missing targets', () => {
    const config = {
      behavior: 'mirror',
      description: 'Test',
    }
    const errors = validateRegistry('test', config)
    expect(errors[0]).toContain('at least one target')
  })

  it('fails when registry config is not an object', () => {
    const errors = validateRegistry('test', 'invalid-registry')
    expect(errors).toContain("Registry 'test' must be a valid object")
  })

  it('fails when include array contains non-string items', () => {
    const config = {
      source: '.pair',
      behavior: 'mirror',
      description: 'Test',
      include: ['valid-string', 123],
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors).toContain("Registry 'test' include array must contain only strings")
  })

  // `exclude` is the entry-level counterpart of `include`, so it gets the same
  // two shape checks: a non-array or a non-string member is a config error, not
  // something the copy pipeline should discover and silently ignore.
  it('fails when exclude is not an array', () => {
    const config = {
      source: '.skills',
      behavior: 'overwrite',
      description: 'Test',
      exclude: 'process/setup',
      targets: [{ path: '.claude/skills', mode: 'installed' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors).toContain("Registry 'test' exclude must be an array of strings")
  })

  it('fails when exclude array contains non-string items', () => {
    const config = {
      source: '.skills',
      behavior: 'overwrite',
      description: 'Test',
      exclude: ['process/setup', 7],
      targets: [{ path: '.claude/skills', mode: 'installed' }],
    }
    const errors = validateRegistry('test', config)
    expect(errors).toContain("Registry 'test' exclude array must contain only strings")
  })

  it('accepts a well-formed exclude array', () => {
    const config = {
      source: '.skills',
      behavior: 'overwrite',
      description: 'Test',
      exclude: ['process/setup'],
      targets: [{ path: '.claude/skills', mode: 'installed' }],
    }
    expect(validateRegistry('test', config)).toHaveLength(0)
  })
})

describe('registry validation - detectOverlappingTargets', () => {
  it('detects identical targets', () => {
    const targets = {
      reg1: 'path/a',
      reg2: 'path/a',
    }
    const errors = detectOverlappingTargets(targets)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('same target')
  })

  it('detects nested targets', () => {
    const targets = {
      parent: 'path/a',
      child: 'path/a/b',
    }
    const errors = detectOverlappingTargets(targets)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('overlap')
  })
})

describe('registry validation - validateAllRegistries', () => {
  it('validates a full set of registries', () => {
    const registries: Record<string, RegistryConfig> = {
      reg1: {
        source: 'reg1',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'a', mode: 'canonical' }],
      },
      reg2: {
        source: 'reg2',
        behavior: 'add',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'b', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects overlaps in validateAllRegistries', () => {
    const registries: Record<string, RegistryConfig> = {
      reg1: {
        source: 'reg1',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'a', mode: 'canonical' }],
      },
      reg2: {
        source: 'reg2',
        behavior: 'add',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: 'a', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('fails when no valid registries exist (all invalid)', () => {
    const registries: Record<string, RegistryConfig> = {
      // Registry with missing required fields
      invalid1: {
        source: 'invalid1',
        behavior: '' as unknown as 'mirror',
        description: '',
        include: [],
        flatten: false,
        targets: [],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails when registries object is empty', () => {
    const registries: Record<string, RegistryConfig> = {}
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Config must have asset_registries object')
  })
})

describe('registry validation - reserved path overlap (D14)', () => {
  it('passes for default registries against the default working path', () => {
    const registries: Record<string, RegistryConfig> = {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(true)
  })

  it('fails when a registry target overlaps a reserved path (working area)', () => {
    const registries: Record<string, RegistryConfig> = {
      pairroot: {
        source: '.pair',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: '.pair', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('reserved path'))).toBe(true)
  })

  it('fails when an overridden working path lands inside a registry-managed directory', () => {
    const registries: Record<string, RegistryConfig> = {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries, '.pair/knowledge/working')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('reserved path'))).toBe(true)
  })

  it('rejects a non-project-relative (absolute) working_path', () => {
    const registries: Record<string, RegistryConfig> = {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        description: 'desc',
        include: [],
        flatten: false,
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
      },
    }
    const result = validateAllRegistries(registries, '/var/tmp/working')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('must be project-relative'))).toBe(true)
  })
})

describe('registry validation - targets', () => {
  it('accepts registry with valid targets', () => {
    const config: RegistryConfig = {
      source: '.claude/skills/',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.github/skills/', mode: 'symlink' },
      ],
    }
    const errors = validateRegistry('skills', config)
    expect(errors).toHaveLength(0)
  })

  it('accepts registry with single canonical target', () => {
    const config: RegistryConfig = {
      source: '.pair',
      behavior: 'mirror',
      description: 'KB',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const errors = validateRegistry('knowledge', config)
    expect(errors).toHaveLength(0)
  })

  it('rejects non-array targets', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: 'invalid',
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('target'))).toBe(true)
  })

  it('rejects targets with missing path or mode', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [{ path: '.claude/skills/' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('path and mode'))).toBe(true)
  })

  it('rejects multi-target with no canonical via validateTargets', () => {
    const config: RegistryConfig = {
      source: 'skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [
        { path: '.github/skills/', mode: 'symlink' },
        { path: '.cursor/skills/', mode: 'copy' },
      ],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('canonical'))).toBe(true)
  })

  it('accepts registry with flatten and prefix', () => {
    const config: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: true,
      prefix: 'pair',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors).toHaveLength(0)
  })

  // #407: flattenDepth bounds flatten to the registry's entry granularity. It is
  // read from JSON, so an invalid value must be REJECTED — degrading silently
  // would degrade back into the unbounded flatten this option exists to fix.
  it('accepts a positive-integer flattenDepth alongside flatten: true', () => {
    const config: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: true,
      flattenDepth: 2,
      prefix: 'pair',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    expect(validateRegistry('skills', config)).toHaveLength(0)
  })

  it.each([0, -1, 1.5, '2', null])('rejects the invalid flattenDepth %p', flattenDepth => {
    const config = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: true,
      flattenDepth,
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('flattenDepth must be a positive integer'))).toBe(true)
  })

  it('rejects flattenDepth without flatten: true (it would do nothing)', () => {
    const config = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      flattenDepth: 2,
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('flattenDepth requires flatten: true'))).toBe(true)
  })

  it('rejects non-boolean flatten', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: 'yes',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('flatten'))).toBe(true)
  })

  it('rejects non-string prefix', () => {
    const config = {
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      prefix: 123,
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const errors = validateRegistry('skills', config)
    expect(errors.some(e => e.includes('prefix'))).toBe(true)
  })

  it('accepts target with valid transform', () => {
    const config: RegistryConfig = {
      source: 'AGENTS.md',
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      ],
    }
    const errors = validateRegistry('agents', config)
    expect(errors).toHaveLength(0)
  })

  it('rejects target with empty transform prefix', () => {
    const config = {
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: '' } },
      ],
    }
    const errors = validateRegistry('agents', config)
    expect(errors.some(e => e.includes('transform'))).toBe(true)
  })

  it('rejects target with non-object transform', () => {
    const config = {
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: 'invalid' },
      ],
    }
    const errors = validateRegistry('agents', config)
    expect(errors.some(e => e.includes('transform'))).toBe(true)
  })
})

describe('US-219 — the workflow + agent registries are installable and reserved-path safe', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '../../config.json'), 'utf-8')) as {
    asset_registries: Record<string, RegistryConfig>
  }

  it('registers both the workflows and the agent execution layer', () => {
    // A workflow installed without the agent definitions its `agentType`s resolve to
    // cannot run: the pair is the unit, not the workflow alone (AC3).
    expect(config.asset_registries['workflows']).toBeDefined()
    expect(config.asset_registries['agent-definitions']).toBeDefined()
  })

  it('neither target overlaps the reserved working area', () => {
    // D14: `.pair/working` holds checkpoints and audit logs that survive context resets.
    // A registry writing there would have an install wipe a run's own audit trail.
    const registries = config.asset_registries
    const result = validateAllRegistries(registries)
    expect(result.valid, JSON.stringify(result.errors)).toBe(true)

    const mine = Object.fromEntries(
      ['workflows', 'agent-definitions'].map(n => [n, registries[n]!]),
    )
    expect(detectReservedPathOverlap(mine, getReservedPaths('.pair/working'))).toEqual([])
  })

  it('installs unconditionally, with no tool-gating at install time (ADR-017 §5)', () => {
    // Workflows are Claude-Code-specific and inert elsewhere. Gating the install on the
    // detected tool would make the artifact absent exactly where a later `pair-cli update`
    // could not add it back without re-running detection.
    // The gate is on the registry's STRUCTURE — the keys that could carry a condition — not on
    // its serialized text. Grepping the whole JSON swept in `description`, where "Claude Code
    // only" and "workflows" contain three of the four words: the assertion passed for the wrong
    // reason and would have failed on a harmless wording change while a real `when:` key added
    // beside a reworded description slipped through.
    const CONDITION_KEYS = [
      'tool',
      'tools',
      'gate',
      'gated',
      'when',
      'condition',
      'conditions',
      'if',
      'requires',
    ]
    const gatingKeysIn = (o: object) =>
      Object.keys(o).filter(k => CONDITION_KEYS.includes(k.toLowerCase()))
    for (const name of ['workflows', 'agent-definitions']) {
      const reg = config.asset_registries[name]!
      expect(reg.targets.length).toBe(1)
      expect(
        gatingKeysIn(reg),
        `${name} carries install-time gating keys: ${gatingKeysIn(reg).join(', ')}`,
      ).toEqual([])
      for (const t of reg.targets) expect(gatingKeysIn(t)).toEqual([])
    }
  })
})
