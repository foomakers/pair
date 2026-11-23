import { InMemoryFileSystemService } from '@pair/content-ops'
import { expect, it, vi } from 'vitest'
import { engineFacts } from './workflow-configuration'

it('recognizes models in the Codex cache without treating it as the complete list', () => {
  const cwd = '/codex-config-test'
  const fs = new InMemoryFileSystemService(
    { [cwd + '/models_cache.json']: '{"models":[{"slug":"gpt-6.1-terra"}]}' },
    cwd,
    cwd,
  )
  vi.stubEnv('CODEX_HOME', cwd)
  try {
    const facts = engineFacts({} as Parameters<typeof engineFacts>[0], () => true, fs)
    expect(facts.recognizesModel?.('codex', 'gpt-6.1-terra')).toBe(true)
    expect(facts.recognizesModel?.('codex', 'unlisted-model')).toBe(false)
    expect(facts.recognizesModel?.('claude', 'gpt-6.1-terra')).toBe(false)
    expect(facts.models('codex')).toBeUndefined()
  } finally {
    vi.unstubAllEnvs()
  }
})
