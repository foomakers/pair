import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'
import { validateMetadata } from './metadata-validator'

describe('validateMetadata', () => {
  let fs: FileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, '/kb', '/kb')
  })

  describe('skill file validation', () => {
    it('should validate skill file with complete frontmatter', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
name: bootstrap
description: Bootstrap a new project
version: 1.0.0
author: Pair Team
---

# Bootstrap Skill

Content here.`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results).toHaveLength(1)
      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })

    it('should detect missing frontmatter section', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `# Bootstrap Skill

No frontmatter here.`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('Missing frontmatter section')
    })

    it('should detect missing name field', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
description: Bootstrap a new project
version: 1.0.0
author: Pair Team
---

# Bootstrap Skill`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('name')
    })

    it('should detect missing description field', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
name: bootstrap
version: 1.0.0
author: Pair Team
---

# Bootstrap Skill`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('description')
    })

    it('should detect missing version field', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
name: bootstrap
description: Bootstrap a new project
author: Pair Team
---

# Bootstrap Skill`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('version')
    })

    it('should detect missing author field', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
name: bootstrap
description: Bootstrap a new project
version: 1.0.0
---

# Bootstrap Skill`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('author')
    })

    it('should detect multiple missing fields', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
name: bootstrap
---

# Bootstrap Skill`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(3)
      expect(results[0]?.errors).toContain('Missing required frontmatter field: description')
      expect(results[0]?.errors).toContain('Missing required frontmatter field: version')
      expect(results[0]?.errors).toContain('Missing required frontmatter field: author')
    })

    it('should validate multiple skill files', async () => {
      fs.writeFile(
        '/kb/.skills/valid.md',
        `---
name: valid
description: Valid skill
version: 1.0.0
author: Team
---

# Valid`,
      )

      fs.writeFile(
        '/kb/.skills/invalid.md',
        `---
name: invalid
---

# Invalid`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/valid.md', '/kb/.skills/invalid.md'],
        adoptionFiles: [],
        fs,
      })

      expect(results).toHaveLength(2)
      expect(results[0]?.file).toBe('/kb/.skills/valid.md')
      expect(results[0]?.valid).toBe(true)
      expect(results[1]?.file).toBe('/kb/.skills/invalid.md')
      expect(results[1]?.valid).toBe(false)
    })
  })

  describe('adoption file validation', () => {
    it('should pass adoption file without placeholders', async () => {
      fs.writeFile(
        '/kb/.pair/adoption/tech-stack.md',
        `# Tech Stack

## Frontend
- React 18
- TypeScript 5

## Backend
- Node.js 20`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: [],
        adoptionFiles: ['/kb/.pair/adoption/tech-stack.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('should warn about single placeholder', async () => {
      fs.writeFile(
        '/kb/.pair/adoption/tech-stack.md',
        `# Tech Stack

## Frontend
[placeholder]

## Backend
- Node.js 20`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: [],
        adoptionFiles: ['/kb/.pair/adoption/tech-stack.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('1 unpopulated placeholder')
    })

    it('should warn about multiple placeholders', async () => {
      fs.writeFile(
        '/kb/.pair/adoption/tech-stack.md',
        `# Tech Stack

## Frontend
[placeholder]

## Backend
[placeholder]

## Database
[placeholder]`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: [],
        adoptionFiles: ['/kb/.pair/adoption/tech-stack.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('3 unpopulated placeholder')
    })

    it('should be case-insensitive for placeholders', async () => {
      fs.writeFile(
        '/kb/.pair/adoption/tech-stack.md',
        `# Tech Stack

[Placeholder]
[PLACEHOLDER]`,
      )

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: [],
        adoptionFiles: ['/kb/.pair/adoption/tech-stack.md'],
        fs,
      })

      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('2 unpopulated placeholder')
    })

    it('should validate multiple adoption files', async () => {
      fs.writeFile('/kb/.pair/adoption/complete.md', 'All good here')
      fs.writeFile('/kb/.pair/adoption/incomplete.md', '[placeholder]')

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: [],
        adoptionFiles: ['/kb/.pair/adoption/complete.md', '/kb/.pair/adoption/incomplete.md'],
        fs,
      })

      expect(results).toHaveLength(2)
      expect(results[0]?.warnings).toHaveLength(0)
      expect(results[1]?.warnings).toHaveLength(1)
    })
  })

  describe('mixed validation', () => {
    it('should validate both skill and adoption files', async () => {
      fs.writeFile(
        '/kb/.skills/bootstrap.md',
        `---
name: bootstrap
description: Bootstrap skill
version: 1.0.0
author: Team
---

# Bootstrap`,
      )

      fs.writeFile('/kb/.pair/adoption/tech-stack.md', '[placeholder]')

      const results = await validateMetadata({
        baseDir: '/kb',
        skillFiles: ['/kb/.skills/bootstrap.md'],
        adoptionFiles: ['/kb/.pair/adoption/tech-stack.md'],
        fs,
      })

      expect(results).toHaveLength(2)
      expect(results[0]?.file).toBe('/kb/.skills/bootstrap.md')
      expect(results[0]?.valid).toBe(true)
      expect(results[1]?.file).toBe('/kb/.pair/adoption/tech-stack.md')
      expect(results[1]?.valid).toBe(true)
      expect(results[1]?.warnings).toHaveLength(1)
    })
  })
})
