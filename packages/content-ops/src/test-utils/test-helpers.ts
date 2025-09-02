import { InMemoryFileSystemService } from './in-memory-fs'
import { expect } from 'vitest'

/**
 * Common test file structures for path operations testing
 */
export const TEST_FILE_STRUCTURES = {
  basic: {
    '/dataset/source.md': '# Source File\n[link](target.md)',
    '/dataset/target.md': '# Target File',
    '/dataset/other.md': '# Other File\n[link](source.md)',
  },

  directory: {
    '/dataset/folder/file1.md': '# File 1',
    '/dataset/folder/file2.md': '# File 2\n[link](../other.md)',
    '/dataset/other.md': '# Other\n[link](folder/file1.md)',
  },

  existingTarget: {
    '/dataset/source.md': '# Source',
    '/dataset/target.md': '# Existing Target',
  },

  selfReference: {
    '/dataset/folder/file.md': '# File',
  },
} as const

/**
 * Creates a test file service with the specified structure
 */
export function createTestFileService(
  structure: Record<string, string> = TEST_FILE_STRUCTURES.basic,
): InMemoryFileSystemService {
  return new InMemoryFileSystemService(structure)
}

/**
 * Common test assertions for path operations
 */
export const TEST_ASSERTIONS = {
  /**
   * Asserts that a file exists with the expected content
   */
  async assertFileExists(
    fileService: InMemoryFileSystemService,
    path: string,
    expectedContent: string,
  ) {
    const content = await fileService.readFile(path)
    expect(content).toBe(expectedContent)
  },

  /**
   * Asserts that a file does not exist
   */
  async assertFileDoesNotExist(fileService: InMemoryFileSystemService, path: string) {
    await expect(fileService.readFile(path)).rejects.toThrow()
  },

  /**
   * Asserts that a file contains specific text
   */
  async assertFileContains(
    fileService: InMemoryFileSystemService,
    path: string,
    expectedText: string,
  ) {
    const content = await fileService.readFile(path)
    expect(content).toContain(expectedText)
  },

  /**
   * Asserts that an operation result is empty (successful)
   */
  assertSuccessfulOperation(result: unknown) {
    expect(result).toEqual({})
  },
} as const

/**
 * Test setup utilities
 */
export const TEST_SETUP = {
  /**
   * Creates a basic test setup for path operations
   */
  createBasicSetup() {
    return createTestFileService(TEST_FILE_STRUCTURES.basic)
  },

  /**
   * Creates a directory test setup
   */
  createDirectorySetup() {
    return createTestFileService(TEST_FILE_STRUCTURES.directory)
  },

  /**
   * Creates a setup with existing target file
   */
  createExistingTargetSetup() {
    return createTestFileService(TEST_FILE_STRUCTURES.existingTarget)
  },

  /**
   * Creates a setup for self-reference testing
   */
  createSelfReferenceSetup() {
    return createTestFileService(TEST_FILE_STRUCTURES.selfReference)
  },
} as const
