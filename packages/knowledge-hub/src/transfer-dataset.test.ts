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

import {
  parseJson,
  parseOptions,
  runTransferDataset,
  runTransferPipeline,
} from './transfer-dataset'

describe('parseJson', () => {
  it('parses a valid JSON string', () => {
    const result = parseJson('{"key":"value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('reads and parses a valid JSON file', () => {
    const result = parseJson('/valid.json')
    expect(result).toEqual({ defaultBehavior: 'mirror' })
  })

  it('throws on non-existent file with non-JSON string', () => {
    expect(() => parseJson('/missing.json')).toThrow('ENOENT')
  })

  it('throws on file with invalid JSON content', () => {
    expect(() => parseJson('/invalid.json')).toThrow()
  })
})

describe('parseOptions', () => {
  it('returns undefined for undefined arg', () => {
    expect(parseOptions(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string arg', () => {
    expect(parseOptions('')).toBeUndefined()
  })

  it('parses JSON string with flatten and targets', () => {
    const result = parseOptions(
      '{"defaultBehavior":"mirror","flatten":true,"targets":[{"path":".claude/skills/","mode":"canonical"}]}',
    )
    expect(result).toBeDefined()
    expect(result!.flatten).toBe(true)
    expect(result!.targets).toHaveLength(1)
  })

  it('defaults flatten to false when not provided', () => {
    const result = parseOptions('{"defaultBehavior":"overwrite"}')
    expect(result).toBeDefined()
    expect(result!.flatten).toBe(false)
  })

  it('defaults targets to empty array when not provided', () => {
    const result = parseOptions('{"defaultBehavior":"overwrite"}')
    expect(result).toBeDefined()
    expect(result!.targets).toEqual([])
  })

  it('preserves prefix when provided as string', () => {
    const result = parseOptions('{"prefix":"pair"}')
    expect(result).toBeDefined()
    expect(result!.prefix).toBe('pair')
  })

  it('omits prefix when not a string', () => {
    const result = parseOptions('{"prefix":123}')
    expect(result).toBeDefined()
    expect(result!.prefix).toBeUndefined()
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

  it('calls copyPathOps in copy mode and returns result', async () => {
    const skillNameMap = new Map([['next', 'pair-next']])
    mockCopyPathOps.mockResolvedValue({ skillNameMap })

    const result = await runTransferDataset(
      { source: '.skills', target: '.claude/skills', mode: 'copy' },
      '/root',
    )

    expect(mockCopyPathOps).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '.skills',
        target: '.claude/skills',
        datasetRoot: '/root',
      }),
    )
    expect(result.skillNameMap).toBe(skillNameMap)
  })

  it('forwards skillNameMap to copyPathOps', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const skillNameMap = new Map([['next', 'pair-next']])

    await runTransferDataset(
      { source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy', skillNameMap },
      '/root',
    )

    expect(mockCopyPathOps).toHaveBeenCalledWith(expect.objectContaining({ skillNameMap }))
  })

  it('calls movePathOps in move mode', async () => {
    mockMovePathOps.mockResolvedValue(undefined)

    const result = await runTransferDataset({ source: 'a', target: 'b', mode: 'move' }, '/root')

    expect(mockMovePathOps).toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('applies transform with prefix, removing @prefix-skip blocks and all markers', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const content = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Session Context section',
      '<!-- @claude-skip-end -->',
      'Visible content',
      '<!-- @other-skip-start -->',
      'Other section',
      '<!-- @other-skip-end -->',
    ].join('\n')
    mockReadFile.mockResolvedValue(content)
    mockWriteFile.mockResolvedValue(undefined)

    await runTransferDataset(
      { source: 'AGENTS.md', target: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      '/root',
    )

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const written = mockWriteFile.mock.calls[0]![1] as string
    expect(written).not.toContain('Session Context section')
    expect(written).not.toContain('@claude-skip')
    expect(written).toContain('Visible content')
    expect(written).toContain('Other section')
    expect(written).not.toContain('<!-- @other-skip')
  })

  it('strips all markers with stripMarkers option', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const content = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Keep this',
      '<!-- @claude-skip-end -->',
    ].join('\n')
    mockReadFile.mockResolvedValue(content)
    mockWriteFile.mockResolvedValue(undefined)

    await runTransferDataset(
      { source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy', stripMarkers: true },
      '/root',
    )

    const written = mockWriteFile.mock.calls[0]![1] as string
    expect(written).toContain('Keep this')
    expect(written).not.toContain('<!--')
  })

  it('skips content transform when neither transform nor stripMarkers set', async () => {
    mockCopyPathOps.mockResolvedValue({})

    await runTransferDataset({ source: 'a.md', target: 'b.md', mode: 'copy' }, '/root')

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
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

  it('removes multiple @prefix-skip blocks with transform', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const content = [
      '# AGENTS.md',
      '<!-- @claude-skip-start -->',
      '## Session Context',
      'Context details here',
      '<!-- @claude-skip-end -->',
      '',
      '## Quick Start',
      'Visible section',
      '',
      '<!-- @claude-skip-start -->',
      '## Internal Notes',
      'More internal content',
      '<!-- @claude-skip-end -->',
      '',
      '## References',
      'Final section',
      '',
      '<!-- @claude-skip-start -->',
      '## Session Examples',
      'Example content',
      '<!-- @claude-skip-end -->',
    ].join('\n')
    mockReadFile.mockResolvedValue(content)
    mockWriteFile.mockResolvedValue(undefined)

    await runTransferDataset(
      { source: 'AGENTS.md', target: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      '/root',
    )

    const written = mockWriteFile.mock.calls[0]![1] as string
    expect(written).not.toContain('Session Context')
    expect(written).not.toContain('Internal Notes')
    expect(written).not.toContain('Session Examples')
    expect(written).toContain('Quick Start')
    expect(written).toContain('Visible section')
    expect(written).toContain('References')
    expect(written).toContain('Final section')
    expect(written).not.toContain('<!--')
  })

  it('preserves non-matching prefix content and strips their markers', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const content = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Claude-only section',
      '<!-- @claude-skip-end -->',
      '<!-- @cursor-skip-start -->',
      'Cursor-only section',
      '<!-- @cursor-skip-end -->',
      '<!-- @copilot-skip-start -->',
      'Copilot-only section',
      '<!-- @copilot-skip-end -->',
      'Always visible',
    ].join('\n')
    mockReadFile.mockResolvedValue(content)
    mockWriteFile.mockResolvedValue(undefined)

    await runTransferDataset(
      { source: 'AGENTS.md', target: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      '/root',
    )

    const written = mockWriteFile.mock.calls[0]![1] as string
    expect(written).not.toContain('Claude-only section')
    expect(written).toContain('Cursor-only section')
    expect(written).toContain('Copilot-only section')
    expect(written).toContain('Always visible')
    expect(written).not.toContain('<!--')
  })

  it('stripMarkers keeps all content from all prefixes', async () => {
    mockCopyPathOps.mockResolvedValue({})
    const content = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Claude section',
      '<!-- @claude-skip-end -->',
      '<!-- @cursor-skip-start -->',
      'Cursor section',
      '<!-- @cursor-skip-end -->',
      'Always visible',
    ].join('\n')
    mockReadFile.mockResolvedValue(content)
    mockWriteFile.mockResolvedValue(undefined)

    await runTransferDataset(
      { source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy', stripMarkers: true },
      '/root',
    )

    const written = mockWriteFile.mock.calls[0]![1] as string
    expect(written).toContain('Claude section')
    expect(written).toContain('Cursor section')
    expect(written).toContain('Always visible')
    expect(written).not.toContain('<!--')
  })

  it('applies content transform after move mode', async () => {
    mockMovePathOps.mockResolvedValue(undefined)
    const content = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Remove this',
      '<!-- @claude-skip-end -->',
      'Keep this',
    ].join('\n')
    mockReadFile.mockResolvedValue(content)
    mockWriteFile.mockResolvedValue(undefined)

    await runTransferDataset(
      { source: 'A.md', target: 'B.md', mode: 'move', transform: { prefix: 'claude' } },
      '/root',
    )

    expect(mockMovePathOps).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const written = mockWriteFile.mock.calls[0]![1] as string
    expect(written).not.toContain('Remove this')
    expect(written).toContain('Keep this')
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

  it('returns empty when no step produces skillNameMap', async () => {
    mockCopyPathOps.mockResolvedValue({})

    const result = await runTransferPipeline([{ source: 'a', target: 'b', mode: 'copy' }], '/root')

    expect(result).toEqual({})
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

  it('handles empty pipeline gracefully', async () => {
    const result = await runTransferPipeline([], '/root')
    expect(result).toEqual({})
  })
})
