import { describe, it, expect } from 'vitest'
import { copyFileSync, mkdtempSync, readdirSync, existsSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { handleInstallCommand } from '../install'
import { handlePackageCommand } from './handler'
import { handleKbVerifyCommand } from '../kb-verify'
import { handleKbValidateCommand } from '../kb-validate'

const DATASET = resolve(__dirname, '../../../../../packages/knowledge-hub/dataset')

const skills = (root: string) => readdirSync(join(root, '.claude/skills')).sort()

// #548 AC-2/3/4: install -> package (default layout) -> kb-verify -> kb-validate source -> install --source
describe('package round-trip on the shipped dataset', () => {
  it('survives install -> package -> kb-verify -> install --source with identical skills and 0 broken links', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pair-rt-'))
    const cwd = process.cwd()
    try {
      const a = join(root, 'a')
      const b = join(root, 'b')
      const unzipped = join(root, 'u')
      mkdirSync(a)
      mkdirSync(b)
      const zip = join(root, 'x.zip')

      await handleInstallCommand(
        { command: 'install', resolution: 'local', path: DATASET, offline: true, kb: false },
        fileSystemService,
        { baseTarget: a },
      )
      expect(existsSync(join(a, '.pair/adoption/tech/automation.md'))).toBe(false)

      // package reads its base config from the project root
      copyFileSync(resolve(__dirname, '../../../config.json'), join(a, 'config.json'))
      process.chdir(a)
      await handlePackageCommand(
        {
          command: 'package',
          output: zip,
          interactive: false,
          tags: [],
          license: 'MIT',
        },
        fileSystemService,
      )
      process.chdir(cwd)

      expect(await handleKbVerifyCommand({ command: 'kb-verify', packagePath: zip, json: false }, fileSystemService)).toBe(0)

      await fileSystemService.extractZip(zip, unzipped)
      copyFileSync(resolve(__dirname, '../../../config.json'), join(unzipped, 'config.json'))
      process.chdir(unzipped)
      // throws on any broken link
      await handleKbValidateCommand(
        { command: 'kb-validate', layout: 'source', strict: false, ignoreConfig: false } as never,
        fileSystemService,
      )
      process.chdir(cwd)

      await handleInstallCommand(
        { command: 'install', resolution: 'local', path: zip, offline: true, kb: false },
        fileSystemService,
        { baseTarget: b },
      )
      expect(skills(b)).toEqual(skills(a))
      expect(skills(b).some(s => s.startsWith('pair-pair-'))).toBe(false)
    } finally {
      process.chdir(cwd)
      rmSync(root, { recursive: true, force: true })
    }
  }, 120000)
})
