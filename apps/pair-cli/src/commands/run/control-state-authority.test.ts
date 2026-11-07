import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('pair-next control-state authority', () => {
  it('ships one executable in the installed skill dataset', () => {
    expect(
      existsSync(
        resolve(
          __dirname,
          '../../../../../packages/knowledge-hub/dataset/.skills/next/control-state.mjs',
        ),
      ),
    ).toBe(true)
  })
})
