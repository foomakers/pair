import { describe, it, expect, beforeEach } from 'vitest'
import { Command } from 'commander'
import {
  packageCommand,
  EXIT_SUCCESS,
  EXIT_VALIDATION_ERROR,
  EXIT_PACKAGING_ERROR,
  formatFileSize,
} from './package'

describe('package command - RED phase', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
  })

  describe('command registration', () => {
    it('should register package command with correct name', () => {
      packageCommand(program)
      const commands = program.commands
      expect(commands.some(cmd => cmd.name() === 'package')).toBe(true)
    })

    it('should have correct description', () => {
      packageCommand(program)
      const pkgCmd = program.commands.find(cmd => cmd.name() === 'package')
      expect(pkgCmd?.description()).toContain('Package KB content')
    })

    it('should accept --output option', () => {
      packageCommand(program)
      const pkgCmd = program.commands.find(cmd => cmd.name() === 'package')
      const opts = pkgCmd?.options
      expect(opts?.some(opt => opt.flags.includes('--output'))).toBe(true)
    })

    it('should accept --source-dir option', () => {
      packageCommand(program)
      const pkgCmd = program.commands.find(cmd => cmd.name() === 'package')
      const opts = pkgCmd?.options
      expect(opts?.some(opt => opt.flags.includes('--source-dir'))).toBe(true)
    })

    it('should accept --config option', () => {
      packageCommand(program)
      const pkgCmd = program.commands.find(cmd => cmd.name() === 'package')
      const opts = pkgCmd?.options
      expect(opts?.some(opt => opt.flags.includes('--config'))).toBe(true)
    })
  })
})

describe('package command - exit codes', () => {
  it('exports EXIT_SUCCESS = 0', () => {
    expect(EXIT_SUCCESS).toBe(0)
  })

  it('exports EXIT_VALIDATION_ERROR = 1', () => {
    expect(EXIT_VALIDATION_ERROR).toBe(1)
  })

  it('exports EXIT_PACKAGING_ERROR = 2', () => {
    expect(EXIT_PACKAGING_ERROR).toBe(2)
  })
})

describe('package command - file size formatting', () => {
  it('formats bytes in KB for files under 1MB', () => {
    expect(formatFileSize(512)).toBe('0.50 KB')
    expect(formatFileSize(1024)).toBe('1.00 KB')
    expect(formatFileSize(512 * 1024)).toBe('512.00 KB')
  })

  it('formats bytes in MB for files over 1MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.50 MB')
    expect(formatFileSize(100 * 1024 * 1024)).toBe('100.00 MB')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatFileSize(1536)).toBe('1.50 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB')
  })
})
