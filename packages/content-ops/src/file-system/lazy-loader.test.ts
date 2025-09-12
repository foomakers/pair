import { describe, it, expect } from 'vitest'
import {
  getRemarkParseInstance,
  getUnifiedInstance,
  getFsInstance,
  getPathInstance,
  loadHeavyOperations,
} from './lazy-loader'

describe('Dynamic Imports', () => {
  it('should get unified instance', async () => {
    const instance = await getUnifiedInstance()
    expect(instance).toBeDefined()
  })

  it('should get remark parse instance', async () => {
    const instance = await getRemarkParseInstance()
    expect(instance).toBeDefined()
  })

  it('should get fs instance', async () => {
    const instance = await getFsInstance()
    expect(instance).toBeDefined()
  })

  it('should get path instance', async () => {
    const instance = await getPathInstance()
    expect(instance).toBeDefined()
  })
})

describe('Heavy Operations Loader', () => {
  it('should load heavy operations', async () => {
    const operations = await loadHeavyOperations()
    expect(Array.isArray(operations)).toBe(true)
  })
})
