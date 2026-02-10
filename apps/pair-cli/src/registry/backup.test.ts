import { describe, it, expect, vi } from 'vitest'
import { handleBackupRollback, createRegistryBackupConfig } from './backup'
import type { BackupService } from '@pair/content-ops'
import type { LogEntry } from '#diagnostics'

describe('registry backup utilities', () => {
  describe('handleBackupRollback', () => {
    it('skips rollback when autoRollback is false', async () => {
      const mockBackup: BackupService = { rollback: vi.fn() } as unknown as BackupService
      const logs: LogEntry[] = []
      const pushLog = (level: LogEntry['level'], message: string) =>
        logs.push({ level, message, time: new Date().toISOString() })

      await handleBackupRollback(
        mockBackup,
        new Error('test error'),
        { autoRollback: false, keepBackup: false },
        pushLog,
      )

      expect(mockBackup.rollback).not.toHaveBeenCalled()
      expect(logs).toHaveLength(0)
    })

    it('performs rollback when autoRollback is true', async () => {
      const mockBackup: BackupService = {
        rollback: vi.fn().mockResolvedValue(undefined),
      } as unknown as BackupService
      const logs: LogEntry[] = []
      const pushLog = (level: LogEntry['level'], message: string) =>
        logs.push({ level, message, time: new Date().toISOString() })
      const error = new Error('test error')

      await handleBackupRollback(
        mockBackup,
        error,
        { autoRollback: true, keepBackup: false },
        pushLog,
      )

      expect(mockBackup.rollback).toHaveBeenCalledWith(error, false)
      expect(logs).toHaveLength(0) // No errors logged on success
    })

    it('passes keepBackup option to rollback', async () => {
      const mockBackup: BackupService = {
        rollback: vi.fn().mockResolvedValue(undefined),
      } as unknown as BackupService
      const logs: LogEntry[] = []
      const pushLog = (level: LogEntry['level'], message: string) =>
        logs.push({ level, message, time: new Date().toISOString() })
      const error = new Error('test error')

      await handleBackupRollback(
        mockBackup,
        error,
        { autoRollback: true, keepBackup: true },
        pushLog,
      )

      expect(mockBackup.rollback).toHaveBeenCalledWith(error, true)
    })

    it('logs error when rollback fails', async () => {
      const rollbackError = new Error('rollback failed')
      const mockBackup: BackupService = {
        rollback: vi.fn().mockRejectedValue(rollbackError),
      } as unknown as BackupService
      const logs: LogEntry[] = []
      const pushLog = (level: LogEntry['level'], message: string) =>
        logs.push({ level, message, time: new Date().toISOString() })

      await handleBackupRollback(
        mockBackup,
        new Error('original error'),
        { autoRollback: true, keepBackup: false },
        pushLog,
      )

      expect(logs).toHaveLength(1)
      expect(logs[0]!.level).toBe('error')
      expect(logs[0]!.message).toContain('Rollback failed')
      expect(logs[0]!.message).toContain('rollback failed')
    })
  })

  describe('createRegistryBackupConfig', () => {
    it('creates config for single registry', () => {
      const result = createRegistryBackupConfig('myRegistry', '/path/to/target')

      expect(result).toEqual({
        myRegistry: '/path/to/target',
      })
    })

    it('handles absolute paths', () => {
      const result = createRegistryBackupConfig('github', '/Users/test/.github')

      expect(result).toEqual({
        github: '/Users/test/.github',
      })
    })

    it('handles relative paths', () => {
      const result = createRegistryBackupConfig('knowledge', '.pair/knowledge')

      expect(result).toEqual({
        knowledge: '.pair/knowledge',
      })
    })
  })
})
