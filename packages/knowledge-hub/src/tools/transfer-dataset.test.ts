import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCopyPathOps, mockMovePathOps, mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockCopyPathOps: vi.fn(),
  mockMovePathOps: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
}))

vi.mock('@pair/content-ops', async () => {
  const actual = await vi.importActual<typeof import('@pair/content-ops')>('@pair/content-ops')
  return {
    ...actual,
    fileSystemService: {
      readFileSync: vi.fn((path: string) => {
        if (path === '/valid.json') return '{"defaultBehavior":"mirror"}'
        if (path === '/invalid.json') return 'not json'
        throw new Error(`ENOENT: no such file or directory '${path}'`)
      }),
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    },
    movePathOps: mockMovePathOps,
    copyPathOps: mockCopyPathOps,
  }
})

import { parseOptions, runTransferDataset, runTransferPipeline } from './transfer-dataset'

describe('parseOptions', () => {
  it('returns undefined for undefined arg', () => {
    expect(parseOptions(undefined)).toBeUndefined()
  })

  it('parses JSON string with flatten and targets', () => {
    const result = parseOptions(
      '{"defaultBehavior":"mirror","flatten":true,"targets":[{"path":".claude/skills/","mode":"canonical"}]}',
    )
    expect(result).toBeDefined()
    expect(result!.flatten).toBe(true)
    expect(result!.targets).toHaveLength(1)
  })

  it('throws on invalid input that is not JSON and not a valid file', () => {
    expect(() => parseOptions('/nonexistent/path.json')).toThrow('Failed to parse options from arg')
  })
})

describe('runTransferDataset', () => {
  beforeEach(() => {
    mockCopyPathOps.mockReset()
    mockMovePathOps.mockReset()
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
  })

  it('calls movePathOps in move mode', async () => {
    mockMovePathOps.mockResolvedValue(undefined)

    const result = await runTransferDataset({ source: 'a', target: 'b', mode: 'move' }, '/root')

    expect(mockMovePathOps).toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('skips content transform for non-.md files', async () => {
    mockCopyPathOps.mockResolvedValue({})

    await runTransferDataset(
      { source: 'config.json', target: 'config.json', mode: 'copy', stripMarkers: true },
      '/root',
    )

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('throws on invalid markers in content', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const content = ['# Title', '<!-- @claude-skip-start -->', 'Unclosed block'].join('\n')
    mockReadFile.mockResolvedValue(content)

    await expect(
      runTransferDataset(
        { source: 'A.md', target: 'A.md', mode: 'copy', stripMarkers: true },
        '/root',
      ),
    ).rejects.toThrow('Marker validation failed')
  })
})

describe('runTransferPipeline', () => {
  beforeEach(() => {
    mockCopyPathOps.mockReset()
    mockMovePathOps.mockReset()
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
  })

  it('forwards skillNameMap from first step to subsequent steps', async () => {
    const skillNameMap = new Map([
      ['next', 'pair-next'],
      ['implement', 'pair-process-implement'],
    ])

    // Step 1: skills copy returns skillNameMap
    mockCopyPathOps.mockResolvedValueOnce({ skillNameMap })
    // Step 2: AGENTS.md copy consumes it
    mockCopyPathOps.mockResolvedValueOnce({})

    await runTransferPipeline(
      [
        {
          source: '.skills',
          target: '.claude/skills',
          mode: 'copy',
          options: { flatten: true, prefix: 'pair', targets: [] },
        },
        { source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy' },
      ],
      '/root',
    )

    // Second call should receive skillNameMap from first
    expect(mockCopyPathOps).toHaveBeenCalledTimes(2)
    const secondCallArgs = mockCopyPathOps.mock.calls[1]![0]
    expect(secondCallArgs.skillNameMap).toBe(skillNameMap)
  })

  it('returns accumulated skillNameMap', async () => {
    const skillNameMap = new Map([['next', 'pair-next']])
    mockCopyPathOps.mockResolvedValueOnce({ skillNameMap })
    mockCopyPathOps.mockResolvedValueOnce({})

    const result = await runTransferPipeline(
      [
        { source: '.skills', target: '.claude/skills', mode: 'copy' },
        { source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy' },
      ],
      '/root',
    )

    expect(result.skillNameMap).toBe(skillNameMap)
  })

  it('applies transform and stripMarkers in different pipeline steps', async () => {
    const skillNameMap = new Map([
      ['next', 'pair-next'],
      ['implement', 'pair-process-implement'],
    ])
    const agentsContent = [
      '# AGENTS',
      '<!-- @claude-skip-start -->',
      '## Session Context',
      '<!-- @claude-skip-end -->',
      'Run `/next` to start.',
    ].join('\n')

    // Step 1: skills copy returns skillNameMap
    mockCopyPathOps.mockResolvedValueOnce({ skillNameMap })
    // Step 2: AGENTS.md copy (stripMarkers)
    mockCopyPathOps.mockResolvedValueOnce({})
    mockReadFile.mockResolvedValueOnce(agentsContent)
    mockWriteFile.mockResolvedValueOnce(undefined)
    // Step 3: CLAUDE.md copy (transform prefix:claude)
    mockCopyPathOps.mockResolvedValueOnce({})
    mockReadFile.mockResolvedValueOnce(agentsContent)
    mockWriteFile.mockResolvedValueOnce(undefined)

    await runTransferPipeline(
      [
        { source: '.skills', target: '.claude/skills', mode: 'copy' },
        { source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy', stripMarkers: true },
        { source: 'AGENTS.md', target: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      ],
      '/root',
    )

    // All 3 steps should have forwarded skillNameMap
    expect(mockCopyPathOps).toHaveBeenCalledTimes(3)
    expect(mockCopyPathOps.mock.calls[1]![0]).toHaveProperty('skillNameMap', skillNameMap)
    expect(mockCopyPathOps.mock.calls[2]![0]).toHaveProperty('skillNameMap', skillNameMap)

    // Step 2 (AGENTS.md): markers stripped, content preserved
    const agentsWritten = mockWriteFile.mock.calls[0]![1] as string
    expect(agentsWritten).toContain('Session Context')
    expect(agentsWritten).not.toContain('<!--')

    // Step 3 (CLAUDE.md): @claude-skip removed, markers stripped
    const claudeWritten = mockWriteFile.mock.calls[1]![1] as string
    expect(claudeWritten).not.toContain('Session Context')
    expect(claudeWritten).not.toContain('<!--')
  })
})
