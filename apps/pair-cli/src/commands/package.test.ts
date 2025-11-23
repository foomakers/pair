import { describe, it, expect, beforeEach } from 'vitest'
import { Command } from 'commander'
import { packageCommand } from './package'

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
