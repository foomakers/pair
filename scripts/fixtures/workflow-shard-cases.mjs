import { test } from 'node:test'

for (const name of ['dataset', 'github', 'github and linear', 'installed', 'other'])
  test(name, () => {})
