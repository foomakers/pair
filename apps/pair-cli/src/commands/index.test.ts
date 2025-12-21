/**
 * Integration tests for the new command flow: Parser → Dispatcher → Handler
 * These tests verify the complete flow works correctly for all commands
 */
import { describe, it, expect } from 'vitest'
import { parseInstallCommand } from './install/parser'
import { parseUpdateCommand } from './update/parser'
import { parseUpdateLinkCommand } from './update-link/parser'
import { parseValidateConfigCommand } from './validate-config/parser'
import { parsePackageCommand } from './package/parser'
import { dispatchCommand } from './dispatcher'

describe('Command Integration Flow (Parser → Dispatcher → Handler)', () => {
  describe('Install command', () => {
    it('should parse and dispatch remote URL install', async () => {
      const options = { source: 'https://example.com/kb.zip' }
      const config = parseInstallCommand(options)

      expect(config.command).toBe('install')
      expect(config.resolution).toBe('remote')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse and dispatch local path install', async () => {
      const options = { source: '/local/path' }
      const config = parseInstallCommand(options)

      expect(config.command).toBe('install')
      expect(config.resolution).toBe('local')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse offline mode with local source', () => {
      const config = parseInstallCommand({
        source: '/local/path',
        offline: true,
      })
      expect(config.offline).toBe(true)
      expect(config.resolution).toBe('local')
    })
  })

  describe('Update command', () => {
    it('should parse and dispatch remote URL update', async () => {
      const options = { source: 'https://example.com/kb-v2.zip' }
      const config = parseUpdateCommand(options)

      expect(config.command).toBe('update')
      expect(config.resolution).toBe('remote')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse and dispatch local path update', async () => {
      const options = { source: '/local/path' }
      const config = parseUpdateCommand(options)

      expect(config.command).toBe('update')
      expect(config.resolution).toBe('local')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse offline mode with local source', () => {
      const config = parseUpdateCommand({
        source: './local/kb',
        offline: true,
      })
      expect(config.offline).toBe(true)
      expect(config.resolution).toBe('local')
    })
  })

  describe('Update-link command', () => {
    it('should parse and dispatch update-link', async () => {
      const config = parseUpdateLinkCommand({})

      expect(config.command).toBe('update-link')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse url option', () => {
      const config = parseUpdateLinkCommand({ url: 'https://example.com/dataset' })
      expect(config.url).toBe('https://example.com/dataset')
    })

    it('should parse verbose and dryRun flags', () => {
      const config = parseUpdateLinkCommand({
        verbose: true,
        dryRun: true,
      })
      expect(config.verbose).toBe(true)
      expect(config.dryRun).toBe(true)
    })
  })

  describe('Validate-config command', () => {
    it('should parse and dispatch validate-config', async () => {
      const config = parseValidateConfigCommand({})

      expect(config.command).toBe('validate-config')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse custom config path', () => {
      const config = parseValidateConfigCommand({ config: '/custom/config.json' })
      expect(config.config).toBe('/custom/config.json')
    })
  })

  describe('Package command', () => {
    it('should parse and dispatch package command', async () => {
      const config = parsePackageCommand({
        sourceDir: '/source/path',
      })

      expect(config.command).toBe('package')

      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    it('should parse all package options', () => {
      const config = parsePackageCommand({
        output: '/output/kb.zip',
        sourceDir: '/src',
        name: 'my-kb',
        version: '1.0.0',
        description: 'Test KB',
        author: 'Test Author',
      })

      expect(config.output).toBe('/output/kb.zip')
      expect(config.sourceDir).toBe('/src')
      expect(config.name).toBe('my-kb')
      expect(config.version).toBe('1.0.0')
      expect(config.description).toBe('Test KB')
      expect(config.author).toBe('Test Author')
    })

    it('should parse verbose flag with default false', () => {
      const config1 = parsePackageCommand({ sourceDir: '/src' })
      expect(config1.verbose).toBe(false)

      const config2 = parsePackageCommand({
        sourceDir: '/src',
        verbose: true,
      })
      expect(config2.verbose).toBe(true)
    })
  })
})
