import { vi } from 'vitest'

export function setupMockExtract() {
  const mockExtract = vi.fn()
  mockExtract.mockResolvedValue(undefined)
  return mockExtract
}

export function setupConsoleSpies() {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  return {
    consoleLogSpy,
    consoleErrorSpy,
    restore: () => {
      consoleLogSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    },
  }
}

export function clearHttpsMocks() {
  vi.clearAllMocks()
}
